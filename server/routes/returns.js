const express = require("express");
const pool = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { requireShopUser } = require("../middleware/requireShopUser");
const {
  getBatchStock,
  availableSmallestUnits,
  setStockUnits,
  recordStockMovement,
  resolveBranchId,
} = require("../lib/stockHelpers");

const router = express.Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Batches in branch stock for supplier returns (includes expired / damaged stock). */
router.get(
  "/supplier-batches",
  authenticateToken,
  requireShopUser,
  async (req, res) => {
    try {
      const branchId = resolveBranchId(req.user);
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
      console.error("Supplier batch search error:", error.message);
      res.status(500).json({
        success: false,
        message: "Unable to search batches for supplier return.",
      });
    }
  }
);

router.post("/customer", authenticateToken, requireShopUser, async (req, res) => {
  const connection = await pool.getConnection();
  let started = false;

  try {
    const branchId = resolveBranchId(req.user);
    const { saleId, clientTransactionId, items, notes = "" } = req.body || {};

    if (
      !Number.isSafeInteger(Number(saleId)) ||
      !UUID_RE.test(clientTransactionId || "") ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "saleId, items, and clientTransactionId are required.",
      });
    }

    await connection.beginTransaction();
    started = true;

    const [dup] = await connection.execute(
      `SELECT customer_return_id FROM customer_returns
       WHERE client_transaction_id = ? FOR UPDATE`,
      [clientTransactionId]
    );
    if (dup.length) {
      await connection.rollback();
      started = false;
      return res.json({
        success: true,
        duplicate: true,
        customerReturnId: dup[0].customer_return_id,
      });
    }

    const [sales] = await connection.execute(
      `SELECT sale_id, branch_id, invoice_number, sale_type, status
       FROM sales WHERE sale_id = ? AND branch_id = ? FOR UPDATE`,
      [Number(saleId), branchId]
    );
    if (!sales.length || sales[0].status !== "FINALIZED") {
      throw new Error("Original bill not found or not eligible for return.");
    }

    let returnTotal = 0;
    const creditNoteNumber = `CN-${branchId}-${Date.now()}`;

    const [returnHeader] = await connection.execute(
      `INSERT INTO customer_returns (
         branch_id, sale_id, return_datetime, credit_note_number,
         return_total, client_transaction_id, notes, created_by
       ) VALUES (?, ?, NOW(3), ?, 0, ?, ?, ?)`,
      [
        branchId,
        Number(saleId),
        creditNoteNumber,
        clientTransactionId,
        String(notes).trim(),
        req.user.userId,
      ]
    );
    const customerReturnId = returnHeader.insertId;

    for (const item of items) {
      const saleItemId = Number(item.saleItemId);
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(saleItemId) || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Each return line needs saleItemId and positive quantity.");
      }

      const [saleItems] = await connection.execute(
        `SELECT sale_item_id, batch_id, quantity, line_total, unit_selling_price
         FROM sale_items
         WHERE sale_item_id = ? AND sale_id = ? AND branch_id = ?`,
        [saleItemId, Number(saleId), branchId]
      );
      if (!saleItems.length) throw new Error(`Sale line ${saleItemId} not found.`);

      const line = saleItems[0];
      const [prevReturns] = await connection.execute(
        `SELECT COALESCE(SUM(quantity), 0) AS returned_qty
         FROM customer_return_items
         WHERE sale_item_id = ? AND branch_id = ?`,
        [saleItemId, branchId]
      );
      const alreadyReturned = Number(prevReturns[0]?.returned_qty || 0);
      const remainingReturnable = Math.max(0, Number(line.quantity) - alreadyReturned);

      if (quantity > remainingReturnable) {
        throw new Error(
          alreadyReturned > 0
            ? `Return quantity exceeds remaining returnable quantity (${remainingReturnable} left; ${alreadyReturned} already returned).`
            : "Return quantity exceeds sold quantity."
        );
      }

      const refundAmount = Number(
        ((Number(line.line_total) / Number(line.quantity)) * quantity).toFixed(2)
      );
      returnTotal += refundAmount;

      await connection.execute(
        `INSERT INTO customer_return_items (
           customer_return_id, branch_id, sale_item_id, batch_id, quantity, refund_amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          customerReturnId,
          branchId,
          saleItemId,
          line.batch_id,
          quantity,
          refundAmount,
        ]
      );

      const stock = await getBatchStock(connection, branchId, line.batch_id, true);
      if (!stock) throw new Error("Batch stock missing for return restock.");

      const newTotal = availableSmallestUnits(stock) + quantity;
      await setStockUnits(connection, branchId, line.batch_id, newTotal);

      await recordStockMovement(connection, {
        branchId,
        batchId: line.batch_id,
        quantityDelta: quantity,
        transactionType: "CUSTOMER_RETURN",
        sourceType: "CUSTOMER_RETURN",
        sourceKey: `CR-${customerReturnId}`,
        notes: `Return against sale ${sales[0].invoice_number || saleId}`,
        userId: req.user.userId,
      });
    }

    await connection.execute(
      `UPDATE customer_returns SET return_total = ? WHERE customer_return_id = ?`,
      [Number(returnTotal.toFixed(2)), customerReturnId]
    );

    await connection.commit();
    started = false;

    res.status(201).json({
      success: true,
      customerReturnId,
      creditNoteNumber,
      returnTotal: Number(returnTotal.toFixed(2)),
      message: "Customer return recorded and stock restored.",
    });
  } catch (error) {
    if (started) await connection.rollback();
    console.error("Customer return error:", error);
    res.status(/not found|exceeds|needs|eligible/i.test(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Customer return failed.",
    });
  } finally {
    connection.release();
  }
});

router.get("/supplier", authenticateToken, requireShopUser, async (req, res) => {
  try {
    const branchId = resolveBranchId(req.user);
    const [returns] = await pool.query(
      `SELECT
         sr.supplier_return_id,
         sr.supplier_id,
         sr.return_datetime,
         sr.reference_number,
         sr.return_total,
         sr.reason,
         s.supplier_name,
         s.phone AS supplier_phone
       FROM supplier_returns sr
       JOIN suppliers s ON s.supplier_id = sr.supplier_id
       WHERE sr.branch_id = ?
       ORDER BY sr.return_datetime DESC
       LIMIT 100`,
      [branchId]
    );

    const [itemRows] = await pool.query(
      `SELECT
         sri.supplier_return_item_id,
         sri.supplier_return_id,
         sri.batch_id,
         sri.quantity,
         sri.purchase_price,
         sri.line_total,
         ba.batch_number,
         p.product_name
       FROM supplier_return_items sri
       JOIN supplier_returns sr ON sr.supplier_return_id = sri.supplier_return_id
       JOIN batches ba ON ba.batch_id = sri.batch_id AND ba.branch_id = sri.branch_id
       JOIN products p ON p.product_id = ba.product_id
       WHERE sr.branch_id = ?
       ORDER BY sri.supplier_return_item_id ASC`,
      [branchId]
    );

    const itemsByReturn = new Map();
    for (const item of itemRows) {
      const id = Number(item.supplier_return_id);
      if (!itemsByReturn.has(id)) itemsByReturn.set(id, []);
      itemsByReturn.get(id).push(item);
    }

    const enriched = returns.map((r) => ({
      ...r,
      items: itemsByReturn.get(Number(r.supplier_return_id)) || [],
    }));

    res.json({ success: true, returns: enriched });
  } catch (error) {
    console.error("List supplier returns error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to load supplier returns.",
    });
  }
});

router.post("/supplier", authenticateToken, requireShopUser, async (req, res) => {
  const connection = await pool.getConnection();
  let started = false;

  try {
    const branchId = resolveBranchId(req.user);
    const {
      supplierId,
      referenceNumber,
      reason = "",
      clientTransactionId,
      items,
    } = req.body || {};

    if (
      !Number.isSafeInteger(Number(supplierId)) ||
      typeof referenceNumber !== "string" ||
      !referenceNumber.trim() ||
      !UUID_RE.test(clientTransactionId || "") ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "supplierId, referenceNumber, items, and clientTransactionId are required.",
      });
    }

    await connection.beginTransaction();
    started = true;

    const [dup] = await connection.execute(
      `SELECT supplier_return_id FROM supplier_returns
       WHERE client_transaction_id = ? FOR UPDATE`,
      [clientTransactionId]
    );
    if (dup.length) {
      await connection.rollback();
      started = false;
      return res.json({
        success: true,
        duplicate: true,
        supplierReturnId: dup[0].supplier_return_id,
      });
    }

    const [supplierCheck] = await connection.execute(
      `SELECT supplier_id FROM suppliers WHERE supplier_id = ? AND branch_id = ?`,
      [Number(supplierId), branchId]
    );
    if (!supplierCheck.length) throw new Error("Supplier not found.");

    let returnTotal = 0;

    const [header] = await connection.execute(
      `INSERT INTO supplier_returns (
         branch_id, supplier_id, return_datetime, reference_number,
         return_total, reason, client_transaction_id, created_by
       ) VALUES (?, ?, NOW(3), ?, 0, ?, ?, ?)`,
      [
        branchId,
        Number(supplierId),
        referenceNumber.trim(),
        String(reason).trim(),
        clientTransactionId,
        req.user.userId,
      ]
    );
    const supplierReturnId = header.insertId;

    for (const item of items) {
      const batchId = Number(item.batchId);
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(batchId) || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Each line needs batchId and positive quantity.");
      }

      const stock = await getBatchStock(connection, branchId, batchId, true);
      if (!stock) throw new Error(`Batch ${batchId} not in branch stock.`);

      const available = availableSmallestUnits(stock);
      if (quantity > available) {
        throw new Error(`Insufficient stock for batch ${stock.batch_number}.`);
      }

      const lineTotal = Number(
        (Number(stock.purchase_price) * (quantity / Number(stock.units_per_stock_unit || 1))).toFixed(2)
      );
      returnTotal += lineTotal;

      await connection.execute(
        `INSERT INTO supplier_return_items (
           supplier_return_id, branch_id, batch_id, quantity, purchase_price, line_total
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          supplierReturnId,
          branchId,
          batchId,
          quantity,
          stock.purchase_price,
          lineTotal,
        ]
      );

      await setStockUnits(connection, branchId, batchId, available - quantity);

      await recordStockMovement(connection, {
        branchId,
        batchId,
        quantityDelta: -quantity,
        transactionType: "SUPPLIER_RETURN",
        sourceType: "SUPPLIER_RETURN",
        sourceKey: `SR-${supplierReturnId}`,
        notes: reason || referenceNumber,
        userId: req.user.userId,
      });
    }

    await connection.execute(
      `UPDATE supplier_returns SET return_total = ? WHERE supplier_return_id = ?`,
      [Number(returnTotal.toFixed(2)), supplierReturnId]
    );

    await connection.commit();
    started = false;

    res.status(201).json({
      success: true,
      supplierReturnId,
      returnTotal: Number(returnTotal.toFixed(2)),
      message: "Supplier return recorded and stock reduced.",
    });
  } catch (error) {
    if (started) await connection.rollback();
    console.error("Supplier return error:", error);
    res.status(/Insufficient|not found|needs/i.test(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Supplier return failed.",
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
