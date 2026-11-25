
const express = require("express");
const pool = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { requireShopUser } = require("../middleware/requireShopUser");
const { resolveBranchId } = require("../lib/stockHelpers");

const router = express.Router();

// List racks configured for the current branch
router.get("/racks", authenticateToken, async (req, res) => {
  try {
    const branchId = resolveBranchId(req.user, req.query.branchId);
    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch context is required to list racks.",
      });
    }

    const [racks] = await pool.execute(
      `SELECT rack_id, rack_code
       FROM racks
       WHERE branch_id = ?
       ORDER BY rack_code ASC`,
      [branchId]
    );

    res.json({ success: true, racks });
  } catch (error) {
    console.error("List racks error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to list branch racks.",
    });
  }
});

// Change or assign the rack for a medicine in the current branch
router.put("/rack", authenticateToken, requireShopUser, async (req, res) => {
  try {
    const branchId = resolveBranchId(req.user);
    const { productId, rackId = null, rackCode = "" } = req.body || {};
    const parsedProductId = Number(productId);

    if (!Number.isSafeInteger(parsedProductId) || parsedProductId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid productId is required.",
      });
    }

    const [prodRows] = await pool.execute(
      `SELECT product_id, product_name FROM products WHERE product_id = ? LIMIT 1`,
      [parsedProductId]
    );
    if (!prodRows.length) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found.",
      });
    }

    let finalRackId = null;
    let finalRackCode = null;
    const trimmedCode = typeof rackCode === "string" ? rackCode.trim().toUpperCase() : "";

    if (trimmedCode) {
      if (trimmedCode.length > 20) {
        return res.status(400).json({
          success: false,
          message: "Rack code must be 20 characters or fewer.",
        });
      }

      const [existingRack] = await pool.execute(
        `SELECT rack_id, rack_code FROM racks WHERE branch_id = ? AND UPPER(rack_code) = ? LIMIT 1`,
        [branchId, trimmedCode]
      );

      if (existingRack.length) {
        finalRackId = existingRack[0].rack_id;
        finalRackCode = existingRack[0].rack_code;
      } else {
        const [insRack] = await pool.execute(
          `INSERT INTO racks (branch_id, rack_code) VALUES (?, ?)`,
          [branchId, trimmedCode]
        );
        finalRackId = insRack.insertId;
        finalRackCode = trimmedCode;
      }
    } else if (rackId != null && rackId !== "") {
      const parsedRackId = Number(rackId);
      if (!Number.isSafeInteger(parsedRackId) || parsedRackId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid rackId.",
        });
      }
      const [rackRows] = await pool.execute(
        `SELECT rack_id, rack_code FROM racks WHERE rack_id = ? AND branch_id = ? LIMIT 1`,
        [parsedRackId, branchId]
      );
      if (!rackRows.length) {
        return res.status(404).json({
          success: false,
          message: "Selected rack not found for this branch.",
        });
      }
      finalRackId = rackRows[0].rack_id;
      finalRackCode = rackRows[0].rack_code;
    }

    await pool.execute(
      `INSERT INTO branch_products (branch_id, product_id, rack_id, low_stock_threshold)
       VALUES (?, ?, ?, 10)
       ON DUPLICATE KEY UPDATE rack_id = VALUES(rack_id)`,
      [branchId, parsedProductId, finalRackId]
    );

    res.json({
      success: true,
      productId: parsedProductId,
      rackId: finalRackId,
      rackCode: finalRackCode,
      message: finalRackCode
        ? `${prodRows[0].product_name} moved to rack ${finalRackCode}.`
        : `Rack cleared for ${prodRows[0].product_name}.`,
    });
  } catch (error) {
    console.error("Update rack error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to update medicine rack.",
    });
  }
});

// Must be registered before GET "/" — supplier return batch search (includes expired stock).
router.get(
  "/batches-for-return",
  authenticateToken,
  requireShopUser,
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";

      if (search.length < 2) {
        return res.json({ success: true, count: 0, medicines: [] });
      }

      const searchTerm = `%${search}%`;

      const [medicines] = await pool.execute(
        `SELECT
           p.product_id,
           p.product_name,
           p.brand,
           s.salt_name,
           p.stock_unit_label,
           p.smallest_unit_label,
           p.units_per_stock_unit,
           ba.batch_id,
           ba.batch_number,
           ba.expiry_date,
           ba.mrp,
           ba.purchase_price,
           i.selling_price,
           (
             i.quantity * COALESCE(p.units_per_stock_unit, 1) + i.loose_quantity
           ) AS available_smallest_units
         FROM inventory i
         JOIN batches ba
           ON ba.batch_id = i.batch_id AND ba.branch_id = i.branch_id
         JOIN products p ON p.product_id = ba.product_id
         LEFT JOIN salts s ON s.salt_id = p.salt_id
         WHERE i.branch_id = ?
           AND p.is_active = TRUE
           AND (
             p.product_name LIKE ?
             OR p.brand LIKE ?
             OR s.salt_name LIKE ?
             OR ba.batch_number LIKE ?
           )
           AND (i.quantity > 0 OR i.loose_quantity > 0)
         ORDER BY ba.expiry_date ASC, p.product_name ASC
         LIMIT 100`,
        [branchId, searchTerm, searchTerm, searchTerm, searchTerm]
      );

      res.json({ success: true, count: medicines.length, medicines });
    } catch (error) {
      console.error("Return batch search error:", error.message);
      res.status(500).json({
        success: false,
        message: "Unable to search batches for supplier return.",
      });
    }
  }
);

// GET /api/inventory
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Branch ID comes from the authenticated user's token,
    // never from the query string.
    const branchId = req.user.branchId;

    if (
  ["SHOP_USER", "SHOP_MANAGER"].includes(req.user.role) &&
  !branchId
) {
  return res.status(403).json({
    success: false,
    message: "No branch assigned to this account.",
  });
}

    const search = typeof req.query.search === "string"
      ? req.query.search.trim()
      : "";

    const searchTerm = `%${search}%`;

    let sql = `
      SELECT
        b.branch_id,
        b.branch_name,
        p.product_id,
        p.product_name,
        p.brand,
        s.salt_name,
        bp.rack_id,
        r.rack_code,
        bp.low_stock_threshold,
        (
          SELECT SUM(
            inv.quantity * COALESCE(p2.units_per_stock_unit, 1) + inv.loose_quantity
          )
          FROM inventory inv
          JOIN batches b2 ON b2.batch_id = inv.batch_id AND b2.branch_id = inv.branch_id
          JOIN products p2 ON p2.product_id = b2.product_id
          WHERE inv.branch_id = i.branch_id AND b2.product_id = ba.product_id
        ) AS product_total_smallest_units,
        ba.batch_id,
        ba.batch_number,
        ba.expiry_date,
        ba.mrp,
        ba.purchase_price,
        i.quantity,
        i.loose_quantity,
        i.selling_price,
        CASE
          WHEN ba.expiry_date IS NOT NULL
            AND ba.expiry_date >= CURDATE()
            AND ba.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          THEN TRUE
          ELSE FALSE
        END AS expiry_alert,
        CASE
          WHEN (
            SELECT SUM(
              CASE
                WHEN b2.expiry_date IS NULL OR b2.expiry_date >= CURDATE()
                THEN inv.quantity * COALESCE(p2.units_per_stock_unit, 1) + inv.loose_quantity
                ELSE 0
              END
            )
            FROM inventory inv
            JOIN batches b2 ON b2.batch_id = inv.batch_id AND b2.branch_id = inv.branch_id
            JOIN products p2 ON p2.product_id = b2.product_id
            WHERE inv.branch_id = i.branch_id AND b2.product_id = ba.product_id
          ) <= COALESCE(bp.low_stock_threshold, 10)
          THEN TRUE
          ELSE FALSE
        END AS low_stock_alert
      FROM inventory i
      JOIN batches ba
        ON ba.batch_id = i.batch_id
       AND ba.branch_id = i.branch_id
      JOIN products p
        ON p.product_id = ba.product_id
      JOIN branches b
        ON b.branch_id = i.branch_id
      JOIN branch_products bp
        ON bp.branch_id = i.branch_id
       AND bp.product_id = ba.product_id
      LEFT JOIN salts s
        ON s.salt_id = p.salt_id
      LEFT JOIN racks r
        ON r.rack_id = bp.rack_id
       AND r.branch_id = bp.branch_id
      WHERE (
        p.product_name LIKE ?
        OR p.brand LIKE ?
        OR s.salt_name LIKE ?
        OR ba.batch_number LIKE ?
      )
    `;

    const params = [
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
    ];

    // Shop users: assigned branch only. Admin: optional branch filter (read-only).
    if (req.user.role !== "ADMIN") {
      sql += " AND i.branch_id = ?";
      params.push(branchId);
    } else {
      const filterBranchId =
        typeof req.query.branchId === "string"
          ? req.query.branchId.trim()
          : "";

      if (filterBranchId) {
        if (!/^\d+$/.test(filterBranchId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid branchId filter.",
          });
        }
        sql += " AND i.branch_id = ?";
        params.push(filterBranchId);
      }
    }

    sql += " ORDER BY ba.expiry_date ASC, p.product_name ASC LIMIT 200";

    const [rows] = await pool.query(sql, params);

    res.json({
      success: true,
      count: rows.length,
      inventory: rows,
    });
  } catch (error) {
    console.error("Fetch inventory error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to fetch inventory.",
    });
  }
});

module.exports = router;
