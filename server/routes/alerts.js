const express = require("express");
const pool = require("../db");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

const LOW_STOCK_UNITS = 10;
const EXPIRY_DAYS = 30;

router.get("/", authenticateToken, async (req, res) => {
  try {
    let branchFilter = null;

    if (["SHOP_USER", "SHOP_MANAGER"].includes(req.user.role)) {
      branchFilter = req.user.branchId;
    } else if (req.query.branchId) {
      branchFilter = String(req.query.branchId).trim();
      if (!/^\d+$/.test(branchFilter)) {
        return res.status(400).json({ success: false, message: "Invalid branchId." });
      }
    }

    let lowStockSql = `
      SELECT
        b.branch_id,
        b.branch_name,
        p.product_id,
        p.product_name,
        p.brand,
        p.strength,
        p.stock_unit_label,
        p.smallest_unit_label,
        p.units_per_stock_unit,
        r.rack_code,
        COALESCE(bp.low_stock_threshold, ?) AS low_stock_threshold,
        SUM(
          CASE
            WHEN ba.expiry_date IS NULL OR ba.expiry_date >= CURDATE()
            THEN i.quantity * COALESCE(p.units_per_stock_unit, 1) + i.loose_quantity
            ELSE 0
          END
        ) AS total_smallest_units
      FROM inventory i
      JOIN batches ba ON ba.batch_id = i.batch_id AND ba.branch_id = i.branch_id
      JOIN products p ON p.product_id = ba.product_id
      JOIN branches b ON b.branch_id = i.branch_id
      LEFT JOIN branch_products bp ON bp.branch_id = i.branch_id AND bp.product_id = p.product_id
      LEFT JOIN racks r ON r.rack_id = bp.rack_id AND r.branch_id = bp.branch_id
      WHERE p.is_active = TRUE
    `;
    const lowParams = [LOW_STOCK_UNITS];

    if (branchFilter) {
      lowStockSql += " AND i.branch_id = ?";
      lowParams.push(branchFilter);
    }

    lowStockSql += `
      GROUP BY
        b.branch_id, b.branch_name, p.product_id, p.product_name, p.brand,
        p.strength, p.stock_unit_label, p.smallest_unit_label, p.units_per_stock_unit,
        r.rack_code, bp.low_stock_threshold
      HAVING total_smallest_units <= COALESCE(bp.low_stock_threshold, ?)
      ORDER BY total_smallest_units ASC, p.product_name ASC
      LIMIT 100
    `;
    lowParams.push(LOW_STOCK_UNITS);

    const [lowStock] = await pool.query(lowStockSql, lowParams);

    let expirySql = `
      SELECT
        b.branch_id,
        b.branch_name,
        p.product_name,
        p.brand,
        p.strength,
        p.smallest_unit_label,
        ba.batch_id,
        ba.batch_number,
        ba.expiry_date,
        i.quantity,
        i.loose_quantity,
        (i.quantity * COALESCE(p.units_per_stock_unit, 1) + i.loose_quantity) AS available_units,
        DATEDIFF(ba.expiry_date, CURDATE()) AS days_to_expiry
      FROM inventory i
      JOIN batches ba ON ba.batch_id = i.batch_id AND ba.branch_id = i.branch_id
      JOIN products p ON p.product_id = ba.product_id
      JOIN branches b ON b.branch_id = i.branch_id
      WHERE ba.expiry_date IS NOT NULL
        AND ba.expiry_date >= CURDATE()
        AND ba.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        AND (i.quantity > 0 OR i.loose_quantity > 0)
    `;
    const expiryParams = [EXPIRY_DAYS];

    if (branchFilter) {
      expirySql += " AND i.branch_id = ?";
      expiryParams.push(branchFilter);
    }

    expirySql += " ORDER BY ba.expiry_date ASC LIMIT 100";

    const [expiryAlerts] = await pool.query(expirySql, expiryParams);

    res.json({
      success: true,
      thresholds: {
        lowStockSmallestUnits: LOW_STOCK_UNITS,
        expiryAlertDays: EXPIRY_DAYS,
      },
      lowStock,
      expiryAlerts,
    });
  } catch (error) {
    console.error("Alerts error:", error.message);
    res.status(500).json({ success: false, message: "Unable to load alerts." });
  }
});

module.exports = router;
