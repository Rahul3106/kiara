const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");

function splitSqlStatements(sqlText) {
  const cleanedLines = sqlText
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

  return cleanedLines
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0 && !/^USE\s+[`a-zA-Z0-9_]+$/i.test(stmt));
}

async function runSqlFile(conn, relativePath) {
  const fullPath = path.resolve(__dirname, "../../", relativePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[MIGRATE] SQL file not found, skipping: ${relativePath}`);
    return;
  }
  const sql = fs.readFileSync(fullPath, "utf8");
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    await conn.query(stmt);
  }
  console.log(`[MIGRATE] Executed ${relativePath} (${statements.length} statements).`);
}

/**
 * Idempotently initializes an empty MySQL database from database/*.sql,
 * applies required schema updates (branch renames, SHOP_MANAGER role ENUM),
 * and ensures default Admin, Manager, and Shop User accounts exist.
 */
async function ensureSchemaReady(pool) {
  if (!pool || (typeof pool.isMockMode === "function" && pool.isMockMode())) {
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // 0. If database is completely empty (no branches table), run base schema + seeds
    const [tables] = await conn.query(`SHOW TABLES LIKE 'branches'`);
    if (!tables || tables.length === 0) {
      console.log("[MIGRATE] Empty database detected. Running initial schema and seed scripts...");
      await runSqlFile(conn, "database/schema.sql");
      await runSqlFile(conn, "database/seed.sql");
      await runSqlFile(conn, "database/migrations/002_purchases_returns_analytics.sql");
      await runSqlFile(conn, "database/migrations/003_extra_medicines_stock.sql");
      await runSqlFile(conn, "database/Adding_Medicine_Data.sql");
      await runSqlFile(conn, "database/Missing_Branch_Mappings.sql");
    }

    // 1. Ensure users.role ENUM includes SHOP_MANAGER (and convert any SHOP_WORKER rows to SHOP_USER)
    const [colRows] = await conn.query(`SHOW COLUMNS FROM users LIKE 'role'`);
    const colType = colRows?.[0]?.Type || "";
    if (!colType.includes("SHOP_MANAGER") || colType.includes("SHOP_WORKER")) {
      if (colType.includes("SHOP_WORKER")) {
        await conn.query(`UPDATE users SET role = 'SHOP_USER' WHERE role = 'SHOP_WORKER'`);
      }
      await conn.query(
        `ALTER TABLE users MODIFY COLUMN role ENUM('ADMIN', 'SHOP_USER', 'SHOP_MANAGER') NOT NULL DEFAULT 'SHOP_USER'`
      );
      console.log("[MIGRATE] Updated users.role ENUM to ADMIN, SHOP_USER, SHOP_MANAGER.");
    }

    // 2. Rename branches BR001/BR002/BR003 to Kiara Medicals A / B / C
    await conn.query(
      `UPDATE branches SET branch_name = 'Kiara Medicals A', legal_name = 'Kiara Medicals A Pvt Ltd', invoice_prefix = 'KM-A' WHERE (branch_code = 'BR001' OR branch_id = 1) AND branch_name <> 'Kiara Medicals A'`
    );
    await conn.query(
      `UPDATE branches SET branch_name = 'Kiara Medicals B', legal_name = 'Kiara Medicals B Pvt Ltd', invoice_prefix = 'KM-B' WHERE (branch_code = 'BR002' OR branch_id = 2) AND branch_name <> 'Kiara Medicals B'`
    );
    await conn.query(
      `UPDATE branches SET branch_name = 'Kiara Medicals C', legal_name = 'Kiara Medicals C Pvt Ltd', invoice_prefix = 'KM-C' WHERE (branch_code = 'BR003' OR branch_id = 3) AND branch_name <> 'Kiara Medicals C'`
    );

    // 3. Ensure default accounts exist (testadmin, managera, shopa, shopb, shopc)
    const [branchRows] = await conn.query(
      `SELECT branch_id, branch_code, invoice_prefix FROM branches WHERE is_active = TRUE`
    );
    const branchByCode = new Map(branchRows.map((b) => [b.branch_code, b.branch_id]));

    const defaultAccounts = [
      { username: "testadmin", pass: "Admin@12345", name: "Test Administrator", role: "ADMIN", branchCode: null },
      { username: "managera", pass: "ManagerA@12345", name: "Test Shop Manager A", role: "SHOP_MANAGER", branchCode: "BR001" },
      { username: "shopa", pass: "ShopA@12345", name: "Test Shop A User", role: "SHOP_USER", branchCode: "BR001" },
      { username: "shopb", pass: "ShopB@12345", name: "Test Shop B User", role: "SHOP_USER", branchCode: "BR002" },
      { username: "shopc", pass: "ShopC@12345", name: "Test Shop C User", role: "SHOP_USER", branchCode: "BR003" },
    ];

    for (const acc of defaultAccounts) {
      const [exists] = await conn.execute(
        `SELECT user_id FROM users WHERE username = ? LIMIT 1`,
        [acc.username]
      );
      if (exists.length === 0) {
        const branchId = acc.branchCode ? branchByCode.get(acc.branchCode) || null : null;
        if (acc.branchCode && !branchId) continue;
        const hash = await bcrypt.hash(acc.pass, 12);
        await conn.execute(
          `INSERT INTO users (branch_id, full_name, username, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
          [branchId, acc.name, acc.username, hash, acc.role]
        );
        console.log(`[MIGRATE] Created user: ${acc.username} (${acc.role})`);
      }
    }

    // 4. Clean up unreferenced exact-duplicate suppliers (e.g., accidental double-submit)
    await conn.query(`
      UPDATE suppliers s1
      JOIN suppliers s2
        ON s1.branch_id = s2.branch_id
       AND LOWER(TRIM(s1.supplier_name)) = LOWER(TRIM(s2.supplier_name))
       AND COALESCE(NULLIF(TRIM(s1.phone), ''), '') = COALESCE(NULLIF(TRIM(s2.phone), ''), '')
       AND s1.supplier_id > s2.supplier_id
      LEFT JOIN purchases p ON p.supplier_id = s1.supplier_id
      LEFT JOIN supplier_returns sr ON sr.supplier_id = s1.supplier_id
      SET s1.is_active = FALSE
      WHERE s1.is_active = TRUE
        AND s2.is_active = TRUE
        AND p.purchase_id IS NULL
        AND sr.supplier_return_id IS NULL
    `);

    // 5. Seed comprehensive demo/test data across branches if operational tables are empty
    await seedDemoOperationalData(conn, branchRows);
  } catch (err) {
    console.warn("[MIGRATE] Startup migration skipped/failed:", err.message);
  } finally {
    if (conn && typeof conn.release === "function") {
      conn.release();
    }
  }
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
  }
  const match = String(val).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

async function seedDemoOperationalData(conn, branchRows) {
  if (!Array.isArray(branchRows) || branchRows.length === 0) return;

  const [adminRows] = await conn.query(
    `SELECT user_id, branch_id, role FROM users WHERE is_active = TRUE`
  );
  const userByBranch = new Map();
  let fallbackUserId = null;
  for (const u of adminRows) {
    if (!fallbackUserId) fallbackUserId = u.user_id;
    if (u.branch_id != null && !userByBranch.has(Number(u.branch_id))) {
      userByBranch.set(Number(u.branch_id), u.user_id);
    }
  }
  if (!fallbackUserId) return;

  // 5a. Ensure multiple distinct suppliers per branch (with phone, GSTIN, address)
  const sampleSuppliers = [
    {
      name: "MedPlus Wholesale Depot",
      phone: "9845011223",
      gstin: "29AABCM1234D1Z5",
      address: "Jayanagar 4th Block, Bengaluru",
    },
    {
      name: "Apollo Pharma Distributors",
      phone: "9845099887",
      gstin: "29AABCA5678E1Z2",
      address: "Rajajinagar Industrial Estate, Bengaluru",
    },
    {
      name: "Cipla Direct Supply",
      phone: "9880123456",
      gstin: "29AABCC9012F1Z8",
      address: "Peenya 2nd Stage, Bengaluru",
    },
  ];

  for (const branch of branchRows) {
    for (const sup of sampleSuppliers) {
      const [found] = await conn.execute(
        `SELECT supplier_id FROM suppliers WHERE branch_id = ? AND LOWER(TRIM(supplier_name)) = LOWER(?) LIMIT 1`,
        [branch.branch_id, sup.name]
      );
      if (found.length === 0) {
        await conn.execute(
          `INSERT INTO suppliers (branch_id, supplier_name, phone, gstin, address) VALUES (?, ?, ?, ?, ?)`,
          [branch.branch_id, sup.name, sup.phone, sup.gstin, sup.address]
        );
      }
    }
  }

  // 5b. Sample patients & doctors per branch (if patients table is empty)
  const [patientCount] = await conn.query(`SELECT COUNT(*) AS c FROM patients`);
  if (Number(patientCount?.[0]?.c || 0) === 0) {
    const samplePatients = [
      { name: "Ramesh Sharma", mobile: "9876543210" },
      { name: "Pooja Patel", mobile: "9812345678" },
      { name: "Amit Verma", mobile: "9823456789" },
      { name: "Sneha Reddy", mobile: "9834567890" },
    ];
    for (const branch of branchRows) {
      for (const pat of samplePatients) {
        await conn.execute(
          `INSERT INTO patients (branch_id, full_name, mobile) VALUES (?, ?, ?)`,
          [branch.branch_id, pat.name, pat.mobile]
        );
      }
      await conn.execute(
        `INSERT INTO doctors (branch_id, full_name) VALUES (?, ?), (?, ?)`,
        [branch.branch_id, "Dr. Arvind Mehta", branch.branch_id, "Dr. Kavita Rao"]
      );
    }
    console.log("[MIGRATE] Seeded sample patients and doctors across all branches.");
  }

  // 5c. Alert & Supplier Return test batches (low-stock, near-expiry, expired)
  const [prodRows] = await conn.query(
    `SELECT product_id, product_name, units_per_stock_unit, default_hsn_code, default_gst_rate
     FROM products WHERE is_active = TRUE ORDER BY product_id ASC LIMIT 12`
  );
  if (prodRows.length >= 3) {
    for (const branch of branchRows) {
      const alertConfigs = [
        {
          product: prodRows[0],
          batchNo: `LOWSTK-${branch.branch_code}`,
          expirySql: `DATE_ADD(CURDATE(), INTERVAL 180 DAY)`,
          qty: 0,
          loose: 3,
          mrp: 60.0,
          purchase: 42.0,
          selling: 54.0,
        },
        {
          product: prodRows[1],
          batchNo: `SOONEXP-${branch.branch_code}`,
          expirySql: `DATE_ADD(CURDATE(), INTERVAL 20 DAY)`,
          qty: 4,
          loose: 0,
          mrp: 80.0,
          purchase: 56.0,
          selling: 72.0,
        },
        {
          product: prodRows[2],
          batchNo: `EXPIRED-${branch.branch_code}`,
          expirySql: `DATE_SUB(CURDATE(), INTERVAL 15 DAY)`,
          qty: 5,
          loose: 0,
          mrp: 95.0,
          purchase: 66.5,
          selling: 85.5,
        },
      ];

      for (const cfg of alertConfigs) {
        const [bExists] = await conn.execute(
          `SELECT batch_id FROM batches WHERE branch_id = ? AND product_id = ? AND batch_number = ? LIMIT 1`,
          [branch.branch_id, cfg.product.product_id, cfg.batchNo]
        );
        if (bExists.length === 0) {
          const [bRes] = await conn.execute(
            `INSERT INTO batches (branch_id, product_id, batch_number, expiry_date, mrp, purchase_price)
             VALUES (?, ?, ?, ${cfg.expirySql}, ?, ?)`,
            [branch.branch_id, cfg.product.product_id, cfg.batchNo, cfg.mrp, cfg.purchase]
          );
          await conn.execute(
            `INSERT INTO inventory (branch_id, batch_id, quantity, loose_quantity, selling_price)
             VALUES (?, ?, ?, ?, ?)`,
            [branch.branch_id, bRes.insertId, cfg.qty, cfg.loose, cfg.selling]
          );
        }
      }
    }
  }

  // 5d. Sample purchases across branches (if purchases table is empty)
  const [purchCount] = await conn.query(`SELECT COUNT(*) AS c FROM purchases`);
  if (Number(purchCount?.[0]?.c || 0) === 0 && prodRows.length >= 2) {
    for (const branch of branchRows) {
      const userId = userByBranch.get(Number(branch.branch_id)) || fallbackUserId;
      const [supRows] = await conn.execute(
        `SELECT supplier_id FROM suppliers WHERE branch_id = ? AND is_active = TRUE ORDER BY supplier_id ASC LIMIT 2`,
        [branch.branch_id]
      );
      const sup1 = supRows[0]?.supplier_id;
      const sup2 = supRows[1]?.supplier_id || sup1;
      if (!sup1) continue;

      const [batchRows] = await conn.execute(
        `SELECT ba.batch_id, ba.product_id, ba.batch_number, ba.expiry_date, ba.mrp, ba.purchase_price,
                i.selling_price, p.units_per_stock_unit, p.default_hsn_code, p.default_gst_rate
         FROM batches ba
         JOIN inventory i ON i.batch_id = ba.batch_id AND i.branch_id = ba.branch_id
         JOIN products p ON p.product_id = ba.product_id
         WHERE ba.branch_id = ? AND (ba.expiry_date IS NULL OR ba.expiry_date > CURDATE())
         ORDER BY ba.batch_id ASC LIMIT 2`,
        [branch.branch_id]
      );
      if (!batchRows.length) continue;

      const pDefs = [
        { supId: sup1, inv: `PUR-${branch.branch_code}-1001`, pay: "CASH", daysAgo: 0, packs: 5, batch: batchRows[0] },
        { supId: sup2, inv: `PUR-${branch.branch_code}-1002`, pay: "CHEQUE", daysAgo: 2, packs: 4, batch: batchRows[1] || batchRows[0] },
      ];

      for (const pd of pDefs) {
        const lineTotal = Number((Number(pd.batch.purchase_price) * pd.packs).toFixed(2));
        const units = pd.packs * Number(pd.batch.units_per_stock_unit || 1);
        const [pRes] = await conn.execute(
          `INSERT INTO purchases (
             branch_id, supplier_id, supplier_invoice_number, purchase_datetime, payment_method,
             subtotal, discount_total, taxable_total, cgst_total, sgst_total, grand_total,
             status, client_transaction_id, notes, created_by
           ) VALUES (?, ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?, ?, 0, 0, 0, 0, ?, 'FINALIZED', ?, 'Demo purchase entry', ?)`,
          [branch.branch_id, pd.supId, pd.inv, pd.daysAgo, pd.pay, lineTotal, lineTotal, randomUUID(), userId]
        );
        await conn.execute(
          `INSERT INTO purchase_items (
             purchase_id, branch_id, product_id, batch_id, batch_number, expiry_date,
             quantity_packs, quantity_smallest_units, purchase_price, mrp, selling_price,
             hsn_code, gst_rate, line_total
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pRes.insertId,
            branch.branch_id,
            pd.batch.product_id,
            pd.batch.batch_id,
            pd.batch.batch_number,
            toDateStr(pd.batch.expiry_date),
            pd.packs,
            units,
            pd.batch.purchase_price,
            pd.batch.mrp,
            pd.batch.selling_price,
            pd.batch.default_hsn_code || "30049099",
            pd.batch.default_gst_rate || 5,
            lineTotal,
          ]
        );
      }
    }
    console.log("[MIGRATE] Seeded sample purchases across all branches.");
  }

  // 5e. Sample billed sales, unbilled sales, customer returns & supplier returns
  const [salesCount] = await conn.query(`SELECT COUNT(*) AS c FROM sales`);
  if (Number(salesCount?.[0]?.c || 0) === 0) {
    for (const branch of branchRows) {
      const userId = userByBranch.get(Number(branch.branch_id)) || fallbackUserId;
      const [patRows] = await conn.execute(
        `SELECT patient_id, full_name, mobile FROM patients WHERE branch_id = ? ORDER BY patient_id ASC LIMIT 4`,
        [branch.branch_id]
      );
      const [docRows] = await conn.execute(
        `SELECT doctor_id, full_name FROM doctors WHERE branch_id = ? ORDER BY doctor_id ASC LIMIT 1`,
        [branch.branch_id]
      );
      const [sellable] = await conn.execute(
        `SELECT ba.batch_id, ba.batch_number, ba.expiry_date, ba.mrp, ba.purchase_price,
                i.selling_price, p.product_name, p.units_per_stock_unit, p.default_hsn_code, p.default_gst_rate
         FROM batches ba
         JOIN inventory i ON i.batch_id = ba.batch_id AND i.branch_id = ba.branch_id
         JOIN products p ON p.product_id = ba.product_id
         WHERE ba.branch_id = ?
           AND (ba.expiry_date IS NULL OR ba.expiry_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY))
           AND i.quantity >= 5
         ORDER BY ba.batch_id ASC LIMIT 4`,
        [branch.branch_id]
      );
      if (sellable.length < 2) continue;

      const doc = docRows[0] || null;
      const saleConfigs = [
        {
          invoice: `${branch.invoice_prefix || "KM"}-DEMO-101`,
          patient: patRows[0],
          pay: "UPI",
          daysAgo: 0,
          qty1: 10,
          qty2: 5,
          saleType: "BILLED",
        },
        {
          invoice: `${branch.invoice_prefix || "KM"}-DEMO-102`,
          patient: patRows[1] || patRows[0],
          pay: "CASH",
          daysAgo: 0,
          qty1: 8,
          qty2: 4,
          saleType: "BILLED",
        },
        {
          invoice: `${branch.invoice_prefix || "KM"}-DEMO-103`,
          patient: patRows[2] || patRows[0],
          pay: "CARD",
          daysAgo: 2,
          qty1: 6,
          qty2: 6,
          saleType: "BILLED",
        },
        {
          invoice: null,
          patient: null,
          pay: "NOT_RECORDED",
          daysAgo: 0,
          qty1: 3,
          qty2: 0,
          saleType: "UNBILLED",
        },
      ];

      let firstSaleForReturn = null;
      let firstSaleItemForReturn = null;

      for (const sc of saleConfigs) {
        const b1 = sellable[0];
        const b2 = sellable[1];
        const lines = [{ batch: b1, qty: sc.qty1 }];
        if (sc.qty2 > 0 && b2) lines.push({ batch: b2, qty: sc.qty2 });

        let subtotal = 0;
        let taxableTotal = 0;
        let cgstTotal = 0;
        let sgstTotal = 0;
        const prepared = lines.map((ln) => {
          const packSize = Number(ln.batch.units_per_stock_unit || 1);
          const unitPrice = Number(ln.batch.selling_price) / packSize;
          const total = Number((unitPrice * ln.qty).toFixed(2));
          const gst = Number(ln.batch.default_gst_rate || 5);
          const taxable = Number((total / (1 + gst / 100)).toFixed(2));
          const tax = Number((total - taxable).toFixed(2));
          const cgst = Number((tax / 2).toFixed(2));
          const sgst = Number((tax - cgst).toFixed(2));
          subtotal += total;
          taxableTotal += taxable;
          cgstTotal += cgst;
          sgstTotal += sgst;
          return { ...ln, unitPrice, total, gst, taxable, cgst, sgst };
        });

        const notes = sc.patient
          ? `Patient: ${sc.patient.full_name} | Age: 34 | Mobile: ${sc.patient.mobile || "N/A"} | Gender: MALE | Doctor: ${doc?.full_name || "Self"}`
          : "Walk-in counter unbilled sale";

        const [sRes] = await conn.execute(
          `INSERT INTO sales (
             branch_id, patient_id, doctor_id, sale_type, status, invoice_number,
             client_transaction_id, sale_datetime, payment_method, subtotal, discount_total,
             taxable_total, cgst_total, sgst_total, igst_total, grand_total, notes, created_by
           ) VALUES (?, ?, ?, ?, 'FINALIZED', ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
          [
            branch.branch_id,
            sc.patient?.patient_id || null,
            doc?.doctor_id || null,
            sc.saleType,
            sc.invoice,
            randomUUID(),
            sc.daysAgo,
            sc.pay,
            Number(subtotal.toFixed(2)),
            Number(taxableTotal.toFixed(2)),
            Number(cgstTotal.toFixed(2)),
            Number(sgstTotal.toFixed(2)),
            Number(subtotal.toFixed(2)),
            notes,
            userId,
          ]
        );

        for (const pLine of prepared) {
          const [siRes] = await conn.execute(
            `INSERT INTO sale_items (
               sale_id, branch_id, batch_id, product_name_snapshot, batch_number_snapshot,
               expiry_date_snapshot, quantity, mrp, unit_selling_price, discount_amount,
               hsn_code, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?)`,
            [
              sRes.insertId,
              branch.branch_id,
              pLine.batch.batch_id,
              pLine.batch.product_name,
              pLine.batch.batch_number,
              toDateStr(pLine.batch.expiry_date),
              pLine.qty,
              pLine.batch.mrp,
              Number(pLine.unitPrice.toFixed(2)),
              pLine.batch.default_hsn_code || "30049099",
              pLine.gst,
              pLine.taxable,
              pLine.cgst,
              pLine.sgst,
              pLine.total,
            ]
          );

          await conn.execute(
            `INSERT INTO stock_transactions (
               branch_id, batch_id, transaction_type, quantity_delta, source_type,
               source_key, idempotency_key, notes, occurred_at, created_by
             ) VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?)`,
            [
              branch.branch_id,
              pLine.batch.batch_id,
              -pLine.qty,
              sc.saleType === "BILLED" ? "BILLED_SALE" : "UNBILLED_SALE",
              sc.invoice || `UNBILLED-${sRes.insertId}`,
              randomUUID(),
              notes,
              sc.daysAgo,
              userId,
            ]
          );

          if (sc.saleType === "BILLED" && !firstSaleForReturn) {
            firstSaleForReturn = { saleId: sRes.insertId, invoice: sc.invoice };
            firstSaleItemForReturn = {
              saleItemId: siRes.insertId,
              batchId: pLine.batch.batch_id,
              unitPrice: pLine.unitPrice,
              qty: 2,
            };
          }
        }
      }

      // Seed one partial customer return per branch (2 units out of 10)
      if (firstSaleForReturn && firstSaleItemForReturn) {
        const refund = Number(
          (firstSaleItemForReturn.unitPrice * firstSaleItemForReturn.qty).toFixed(2)
        );
        const cnNo = `CN-${branch.branch_code}-DEMO-1`;
        const [crRes] = await conn.execute(
          `INSERT INTO customer_returns (
             branch_id, sale_id, return_datetime, credit_note_number,
             return_total, client_transaction_id, notes, created_by
           ) VALUES (?, ?, NOW(3), ?, ?, ?, 'Demo partial return', ?)`,
          [branch.branch_id, firstSaleForReturn.saleId, cnNo, refund, randomUUID(), userId]
        );
        await conn.execute(
          `INSERT INTO customer_return_items (
             customer_return_id, branch_id, sale_item_id, batch_id, quantity, refund_amount
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            crRes.insertId,
            branch.branch_id,
            firstSaleItemForReturn.saleItemId,
            firstSaleItemForReturn.batchId,
            firstSaleItemForReturn.qty,
            refund,
          ]
        );
        await conn.execute(
          `INSERT INTO stock_transactions (
             branch_id, batch_id, transaction_type, quantity_delta, source_type,
             source_key, idempotency_key, notes, occurred_at, created_by
           ) VALUES (?, ?, 'CUSTOMER_RETURN', ?, 'CUSTOMER_RETURN', ?, ?, 'Demo customer return restock', NOW(3), ?)`,
          [
            branch.branch_id,
            firstSaleItemForReturn.batchId,
            firstSaleItemForReturn.qty,
            cnNo,
            randomUUID(),
            userId,
          ]
        );
      }

      // Seed one supplier return per branch against the expired demo batch
      const [supRows] = await conn.execute(
        `SELECT supplier_id FROM suppliers WHERE branch_id = ? AND is_active = TRUE ORDER BY supplier_id ASC LIMIT 1`,
        [branch.branch_id]
      );
      const [expBatch] = await conn.execute(
        `SELECT ba.batch_id, ba.purchase_price, p.units_per_stock_unit
         FROM batches ba
         JOIN products p ON p.product_id = ba.product_id
         WHERE ba.branch_id = ? AND ba.batch_number = ? LIMIT 1`,
        [branch.branch_id, `EXPIRED-${branch.branch_code}`]
      );
      if (supRows.length && expBatch.length) {
        const eb = expBatch[0];
        const packSize = Number(eb.units_per_stock_unit || 1);
        const retUnits = packSize;
        const credit = Number(eb.purchase_price);
        const refNo = `RGA-${branch.branch_code}-DEMO-1`;
        const [srRes] = await conn.execute(
          `INSERT INTO supplier_returns (
             branch_id, supplier_id, return_datetime, reference_number,
             return_total, reason, client_transaction_id, created_by
           ) VALUES (?, ?, NOW(3), ?, ?, 'Expired batch return', ?, ?)`,
          [branch.branch_id, supRows[0].supplier_id, refNo, credit, randomUUID(), userId]
        );
        await conn.execute(
          `INSERT INTO supplier_return_items (
             supplier_return_id, branch_id, batch_id, quantity, purchase_price, line_total
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [srRes.insertId, branch.branch_id, eb.batch_id, retUnits, eb.purchase_price, credit]
        );
      }
    }
    console.log("[MIGRATE] Seeded sample sales, unbilled sales, and returns across all branches.");
  }
}

module.exports = { ensureSchemaReady, splitSqlStatements };
