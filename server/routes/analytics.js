const express = require("express");
const pool = require("../db");
const { authenticateToken, allowRoles } = require("../middleware/auth");

const router = express.Router();

function periodBounds(period) {
  const now = new Date();
  const end = now;

  if (period === "day") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "Today" };
  }

  if (period === "week") {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "This week" };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, label: "This month" };
  }

  return null;
}

/** Date window in MySQL session timezone (avoids JS Date ↔ DATETIME skew). */
function periodDateFilter(column, period) {
  if (period === "day") {
    return `${column} >= CURDATE() AND ${column} < CURDATE() + INTERVAL 1 DAY`;
  }
  if (period === "week") {
    return `${column} >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND ${column} < CURDATE() + INTERVAL 1 DAY`;
  }
  if (period === "month") {
    return `${column} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND ${column} < CURDATE() + INTERVAL 1 DAY`;
  }
  return null;
}

async function metricsForBranch(branchId, period) {
  const saleWhen = periodDateFilter("sale_datetime", period);
  const returnWhen = periodDateFilter("return_datetime", period);
  const purchaseWhen = periodDateFilter("purchase_datetime", period);

  if (!saleWhen || !returnWhen || !purchaseWhen) {
    throw new Error(`Invalid analytics period: ${period}`);
  }

  const [billed] = await pool.execute(
    `SELECT COALESCE(SUM(grand_total), 0) AS total
     FROM sales
     WHERE branch_id = ?
       AND status = 'FINALIZED'
       AND sale_type = 'BILLED'
       AND ${saleWhen}`,
    [branchId]
  );

  const [unbilled] = await pool.execute(
    `SELECT COALESCE(SUM(grand_total), 0) AS total
     FROM sales
     WHERE branch_id = ?
       AND status = 'FINALIZED'
       AND sale_type = 'UNBILLED'
       AND ${saleWhen}`,
    [branchId]
  );

  const [returns] = await pool.execute(
    `SELECT COALESCE(SUM(return_total), 0) AS total
     FROM customer_returns
     WHERE branch_id = ?
       AND ${returnWhen}`,
    [branchId]
  );

  const [purchases] = await pool.execute(
    `SELECT COALESCE(SUM(grand_total), 0) AS total
     FROM purchases
     WHERE branch_id = ?
       AND status = 'FINALIZED'
       AND ${purchaseWhen}`,
    [branchId]
  );

  const grossBilled = Number(billed[0].total);
  const unbilledTotal = Number(unbilled[0].total);
  const customerReturns = Number(returns[0].total);
  const stockPurchases = Number(purchases[0].total);
  const netTotal = Number((grossBilled + unbilledTotal - customerReturns).toFixed(2));
  const totalProfit = Number((netTotal - stockPurchases).toFixed(2));

  return {
    grossBilled,
    unbilledTotal,
    customerReturns,
    stockPurchases,
    netTotal,
    totalProfit,
  };
}

async function getDashboardCharts(branchId, period = "month") {
  const saleWhen = periodDateFilter("s.sale_datetime", period) || periodDateFilter("s.sale_datetime", "month");
  const monthWhen = periodDateFilter("s.sale_datetime", "month");
  const branchClause = branchId != null ? " AND s.branch_id = ?" : "";
  const branchParams = branchId != null ? [Number(branchId)] : [];

  const [paymentRows] = await pool.query(
    `SELECT
       s.payment_method,
       COUNT(*) AS bill_count,
       COALESCE(SUM(s.grand_total), 0) AS total
     FROM sales s
     WHERE s.status = 'FINALIZED'
       AND s.sale_type = 'BILLED'
       AND ${saleWhen}${branchClause}
     GROUP BY s.payment_method
     ORDER BY total DESC`,
    branchParams
  );

  const [trendRows] = await pool.query(
    `SELECT
       DATE(s.sale_datetime) AS sale_day,
       COUNT(*) AS bill_count,
       COALESCE(SUM(s.grand_total), 0) AS total
     FROM sales s
     WHERE s.status = 'FINALIZED'
       AND ${monthWhen}${branchClause}
     GROUP BY DATE(s.sale_datetime)
     ORDER BY sale_day ASC`,
    branchParams
  );

  const [topMedicineRows] = await pool.query(
    `SELECT
       si.product_name_snapshot AS product_name,
       COALESCE(SUM(si.quantity), 0) AS units_sold,
       COALESCE(SUM(si.line_total), 0) AS revenue
     FROM sale_items si
     JOIN sales s ON s.sale_id = si.sale_id AND s.branch_id = si.branch_id
     WHERE s.status = 'FINALIZED'
       AND ${saleWhen}${branchClause}
     GROUP BY si.product_name_snapshot
     ORDER BY revenue DESC
     LIMIT 6`,
    branchParams
  );

  return {
    paymentMix: paymentRows.map((r) => ({
      paymentMethod: r.payment_method || "OTHER",
      billCount: Number(r.bill_count || 0),
      total: Number(Number(r.total || 0).toFixed(2)),
    })),
    dailyTrend: trendRows.map((r) => {
      const dateStr =
        r.sale_day instanceof Date
          ? r.sale_day.toISOString().slice(0, 10)
          : String(r.sale_day).slice(0, 10);
      return {
        date: dateStr,
        label: dateStr.slice(5),
        billCount: Number(r.bill_count || 0),
        total: Number(Number(r.total || 0).toFixed(2)),
      };
    }),
    topMedicines: topMedicineRows.map((r) => ({
      productName: r.product_name,
      unitsSold: Number(r.units_sold || 0),
      revenue: Number(Number(r.revenue || 0).toFixed(2)),
    })),
  };
}

router.get("/branch", authenticateToken, async (req, res) => {
  try {
    if (!["SHOP_USER", "SHOP_MANAGER"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Shop branch analytics only.",
      });
    }

    const branchId = Number(req.user.branchId);
    const periods = ["day", "week", "month"];
    const result = {};

    for (const period of periods) {
      const bounds = periodBounds(period);
      if (!bounds) continue;
      result[period] = {
        label: bounds.label,
        ...(await metricsForBranch(branchId, period)),
      };
    }

    const charts = await getDashboardCharts(branchId, "month");

    res.json({ success: true, branchId, analytics: result, charts });
  } catch (error) {
    console.error("Branch analytics error:", error.message);
    res.status(500).json({ success: false, message: "Unable to load analytics." });
  }
});

router.get(
  "/admin",
  authenticateToken,
  allowRoles("ADMIN"),
  async (req, res) => {
    try {
      const period = ["day", "week", "month"].includes(req.query.period)
        ? req.query.period
        : "day";
      const bounds = periodBounds(period);
      if (!bounds) {
        return res.status(400).json({ success: false, message: "Invalid period." });
      }

      const [branches] = await pool.query(
        `SELECT branch_id, branch_code, branch_name, gstin, is_active
         FROM branches ORDER BY branch_id`
      );

      const byBranch = [];
      let overall = {
        grossBilled: 0,
        unbilledTotal: 0,
        customerReturns: 0,
        stockPurchases: 0,
        netTotal: 0,
        totalProfit: 0,
      };

      for (const branch of branches) {
        if (!branch.is_active) continue;
        const m = await metricsForBranch(branch.branch_id, period);
        byBranch.push({
          branchId: branch.branch_id,
          branchCode: branch.branch_code,
          branchName: branch.branch_name,
          gstin: branch.gstin,
          ...m,
        });
        overall.grossBilled += m.grossBilled;
        overall.unbilledTotal += m.unbilledTotal;
        overall.customerReturns += m.customerReturns;
        overall.stockPurchases += m.stockPurchases;
        overall.netTotal += m.netTotal;
        overall.totalProfit += m.totalProfit;
      }

      overall.grossBilled = Number(overall.grossBilled.toFixed(2));
      overall.unbilledTotal = Number(overall.unbilledTotal.toFixed(2));
      overall.customerReturns = Number(overall.customerReturns.toFixed(2));
      overall.stockPurchases = Number(overall.stockPurchases.toFixed(2));
      overall.netTotal = Number(overall.netTotal.toFixed(2));
      overall.totalProfit = Number(overall.totalProfit.toFixed(2));

      const charts = await getDashboardCharts(null, period);

      res.json({
        success: true,
        period,
        label: bounds.label,
        overall,
        byBranch,
        charts,
      });
    } catch (error) {
      console.error("Admin analytics error:", error.message);
      res.status(500).json({ success: false, message: "Unable to load admin analytics." });
    }
  }
);

function parseDoctorFromNotes(notes) {
  if (!notes || typeof notes !== "string") return "";
  const m = notes.match(/Doctor:\s*([^|]+)/i);
  if (!m) return "";
  const val = m[1].trim();
  if (!val || /^(n\/a|na|self|-|—)$/i.test(val)) return "";
  return val;
}

function normalizeDoctorKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

router.get(
  "/doctor-sales",
  authenticateToken,
  allowRoles("ADMIN", "SHOP_MANAGER", "SHOP_USER"),
  async (req, res) => {
    try {
      const period = ["day", "week", "month", "all"].includes(req.query.period)
        ? req.query.period
        : "month";
      const search =
        typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";

      let effectiveBranchId = null;
      if (["SHOP_USER", "SHOP_MANAGER"].includes(req.user.role)) {
        effectiveBranchId = Number(req.user.branchId);
      } else if (req.query.branchId) {
        if (!/^\d+$/.test(String(req.query.branchId).trim())) {
          return res.status(400).json({ success: false, message: "Invalid branchId." });
        }
        effectiveBranchId = Number(req.query.branchId);
      }

      const whenClause =
        period === "all" ? "1=1" : periodDateFilter("s.sale_datetime", period);

      let salesSql = `
        SELECT
          s.sale_id,
          s.branch_id,
          b.branch_name,
          s.invoice_number,
          s.sale_datetime,
          s.payment_method,
          s.grand_total,
          s.notes,
          s.doctor_id,
          d.full_name AS doctor_full_name,
          s.patient_id,
          p.full_name AS patient_full_name
        FROM sales s
        JOIN branches b ON b.branch_id = s.branch_id
        LEFT JOIN doctors d ON d.doctor_id = s.doctor_id AND d.branch_id = s.branch_id
        LEFT JOIN patients p ON p.patient_id = s.patient_id AND p.branch_id = s.branch_id
        WHERE s.status = 'FINALIZED'
          AND s.sale_type = 'BILLED'
          AND ${whenClause}
      `;
      const salesParams = [];
      if (effectiveBranchId != null) {
        salesSql += " AND s.branch_id = ?";
        salesParams.push(effectiveBranchId);
      }
      salesSql += " ORDER BY s.sale_datetime DESC";

      const [salesRows] = await pool.query(salesSql, salesParams);

      let retSql = `
        SELECT sale_id, COALESCE(SUM(return_total), 0) AS returned_total
        FROM customer_returns
      `;
      const retParams = [];
      if (effectiveBranchId != null) {
        retSql += " WHERE branch_id = ?";
        retParams.push(effectiveBranchId);
      }
      retSql += " GROUP BY sale_id";
      const [retRows] = await pool.query(retSql, retParams);
      const returnsBySale = new Map(
        retRows.map((r) => [Number(r.sale_id), Number(r.returned_total || 0)])
      );

      let qtySql = `
        SELECT sale_id, COALESCE(SUM(quantity), 0) AS units_sold
        FROM sale_items
      `;
      const qtyParams = [];
      if (effectiveBranchId != null) {
        qtySql += " WHERE branch_id = ?";
        qtyParams.push(effectiveBranchId);
      }
      qtySql += " GROUP BY sale_id";
      const [qtyRows] = await pool.query(qtySql, qtyParams);
      const unitsBySale = new Map(
        qtyRows.map((q) => [Number(q.sale_id), Number(q.units_sold || 0)])
      );

      const doctorMap = new Map();

      for (const row of salesRows) {
        const rawDoc =
          (row.doctor_full_name && String(row.doctor_full_name).trim()) ||
          parseDoctorFromNotes(row.notes) ||
          "Walk-in / Self (No Doctor)";

        if (search && !rawDoc.toLowerCase().includes(search)) {
          continue;
        }

        const key = `${effectiveBranchId == null ? "ALL" : row.branch_id}:${normalizeDoctorKey(rawDoc)}`;
        const gross = Number(row.grand_total || 0);
        const ret = returnsBySale.get(Number(row.sale_id)) || 0;
        const net = Math.max(0, Number((gross - ret).toFixed(2)));
        const units = unitsBySale.get(Number(row.sale_id)) || 0;

        const patMatch = (row.notes || "").match(/Patient:\s*([^|]+)/i);
        const patientName =
          row.patient_full_name ||
          (patMatch && patMatch[1].trim() !== "N/A" ? patMatch[1].trim() : "Walk-in Patient");
        const patientKey = row.patient_id ? `id:${row.patient_id}` : `name:${patientName.toLowerCase()}`;

        if (!doctorMap.has(key)) {
          doctorMap.set(key, {
            doctorKey: key,
            doctorName: rawDoc,
            isWalkIn: rawDoc === "Walk-in / Self (No Doctor)",
            branchNames: new Set(),
            billCount: 0,
            patientKeys: new Set(),
            unitsSold: 0,
            grossBilled: 0,
            customerReturns: 0,
            netSales: 0,
            lastSaleDate: row.sale_datetime,
            bills: [],
          });
        }

        const entry = doctorMap.get(key);
        entry.branchNames.add(row.branch_name);
        entry.billCount += 1;
        entry.patientKeys.add(patientKey);
        entry.unitsSold += units;
        entry.grossBilled += gross;
        entry.customerReturns += ret;
        entry.netSales += net;
        if (entry.bills.length < 30) {
          entry.bills.push({
            sale_id: row.sale_id,
            invoice_number: row.invoice_number,
            branch_name: row.branch_name,
            patientName,
            sale_datetime: row.sale_datetime,
            payment_method: row.payment_method,
            gross_billed: Number(gross.toFixed(2)),
            returned_total: Number(ret.toFixed(2)),
            net_total: net,
          });
        }
      }

      const doctors = Array.from(doctorMap.values())
        .map((d) => ({
          doctorKey: d.doctorKey,
          doctorName: d.doctorName,
          isWalkIn: d.isWalkIn,
          branchName: Array.from(d.branchNames).join(", "),
          billCount: d.billCount,
          patientCount: d.patientKeys.size,
          unitsSold: d.unitsSold,
          grossBilled: Number(d.grossBilled.toFixed(2)),
          customerReturns: Number(d.customerReturns.toFixed(2)),
          netSales: Number(d.netSales.toFixed(2)),
          lastSaleDate: d.lastSaleDate,
          bills: d.bills,
        }))
        .sort((a, b) => {
          if (a.isWalkIn !== b.isWalkIn) return a.isWalkIn ? 1 : -1;
          return b.netSales - a.netSales;
        });

      const summary = doctors.reduce(
        (acc, d) => {
          if (!d.isWalkIn) acc.doctorCount += 1;
          acc.totalBills += d.billCount;
          acc.grossBilled += d.grossBilled;
          acc.customerReturns += d.customerReturns;
          acc.netSales += d.netSales;
          return acc;
        },
        { doctorCount: 0, totalBills: 0, grossBilled: 0, customerReturns: 0, netSales: 0 }
      );
      summary.grossBilled = Number(summary.grossBilled.toFixed(2));
      summary.customerReturns = Number(summary.customerReturns.toFixed(2));
      summary.netSales = Number(summary.netSales.toFixed(2));

      res.json({
        success: true,
        period,
        branchId: effectiveBranchId,
        summary,
        doctors,
      });
    } catch (error) {
      console.error("Doctor sales report error:", error.message);
      res.status(500).json({
        success: false,
        message: "Unable to load doctor-wise sales report.",
      });
    }
  }
);

module.exports = router;
