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

  await seedConsistentDemoV2(conn, branchRows, userByBranch, fallbackUserId);
  await seedConsistentDemoV3(conn, branchRows, userByBranch, fallbackUserId);
  await seedConsistentDemoV4(conn, branchRows, userByBranch, fallbackUserId);
}

async function adjustInventoryUnits(conn, branchId, batchId, deltaUnits) {
  const [rows] = await conn.execute(
    `SELECT i.quantity, i.loose_quantity, p.units_per_stock_unit
     FROM inventory i
     JOIN batches ba ON ba.batch_id = i.batch_id AND ba.branch_id = i.branch_id
     JOIN products p ON p.product_id = ba.product_id
     WHERE i.branch_id = ? AND i.batch_id = ? LIMIT 1`,
    [branchId, batchId]
  );
  if (!rows.length) return;
  const packSize = Math.max(1, Number(rows[0].units_per_stock_unit || 1));
  const currentTotal =
    Number(rows[0].quantity || 0) * packSize + Number(rows[0].loose_quantity || 0);
  const nextTotal = Math.max(0, currentTotal + deltaUnits);
  await conn.execute(
    `UPDATE inventory SET quantity = ?, loose_quantity = ? WHERE branch_id = ? AND batch_id = ?`,
    [Math.floor(nextTotal / packSize), nextTotal % packSize, branchId, batchId]
  );
}

async function seedConsistentDemoV2(conn, branchRows, userByBranch, fallbackUserId) {
  const [already] = await conn.query(
    `SELECT sale_id FROM sales WHERE invoice_number LIKE '%-DEMO-201' LIMIT 1`
  );
  if (already.length > 0) return;

  const [calRows] = await conn.query(`SELECT DAY(CURDATE()) AS dom, WEEKDAY(CURDATE()) AS wd`);
  const dom = Math.max(1, Number(calRows?.[0]?.dom || 1));
  const wd = Math.max(0, Number(calRows?.[0]?.wd || 0));
  const weekDaysAgo1 = Math.min(1, wd);
  const weekDaysAgo2 = Math.min(2, wd);
  const monthDaysAgo1 = Math.min(6, dom - 1);
  const monthDaysAgo2 = Math.min(10, dom - 1);
  const monthDaysAgo3 = Math.min(14, dom - 1);

  const [allProds] = await conn.query(
    `SELECT product_id, product_name, units_per_stock_unit, default_hsn_code, default_gst_rate
     FROM products WHERE is_active = TRUE ORDER BY product_id ASC LIMIT 20`
  );
  if (allProds.length < 12) return;

  // Products 4..7 -> low stock targets across every branch (4 real low-stock medicines)
  const lowStockProducts = allProds.slice(3, 7);
  // Products 8..11 -> upcoming 1-month expiry batches (+4, +11, +19, +26 days)
  const soonExpProducts = allProds.slice(7, 11);
  const lowStockIds = new Set(lowStockProducts.map((p) => Number(p.product_id)));

  // Clean up old helper LOWSTK-* batch on Dolo 650 if unreferenced
  await conn.query(`
    DELETE i FROM inventory i
    JOIN batches b ON b.batch_id = i.batch_id AND b.branch_id = i.branch_id
    LEFT JOIN sale_items si ON si.batch_id = b.batch_id
    LEFT JOIN purchase_items pi ON pi.batch_id = b.batch_id
    LEFT JOIN supplier_return_items sri ON sri.batch_id = b.batch_id
    WHERE b.batch_number LIKE 'LOWSTK-%'
      AND si.sale_item_id IS NULL AND pi.purchase_item_id IS NULL AND sri.supplier_return_item_id IS NULL
  `);
  await conn.query(`
    DELETE b FROM batches b
    LEFT JOIN inventory i ON i.batch_id = b.batch_id
    WHERE b.batch_number LIKE 'LOWSTK-%' AND i.batch_id IS NULL
  `);

  const lowTargets = [0, 3, 6, 9];
  const expiryDaysTargets = [4, 11, 19, 26];

  for (const branch of branchRows) {
    const userId = userByBranch.get(Number(branch.branch_id)) || fallbackUserId;
    const prefix = branch.invoice_prefix || "KM";

    // Assign racks to branch_products that lack a rack_id
    const [rackRows] = await conn.execute(
      `SELECT rack_id FROM racks WHERE branch_id = ? ORDER BY rack_id ASC LIMIT 3`,
      [branch.branch_id]
    );
    if (rackRows.length) {
      await conn.execute(
        `UPDATE branch_products SET rack_id = ? WHERE branch_id = ? AND rack_id IS NULL`,
        [rackRows[0].rack_id, branch.branch_id]
      );
    }

    // 1. Set 4 genuine low-stock products per branch (all usable batches updated consistently)
    for (let idx = 0; idx < lowStockProducts.length; idx++) {
      const prod = lowStockProducts[idx];
      const targetUnits = lowTargets[idx];
      const [invRows] = await conn.execute(
        `SELECT i.batch_id
         FROM inventory i
         JOIN batches ba ON ba.batch_id = i.batch_id AND ba.branch_id = i.branch_id
         WHERE i.branch_id = ? AND ba.product_id = ?
           AND (ba.expiry_date IS NULL OR ba.expiry_date >= CURDATE())
         ORDER BY ba.batch_id ASC`,
        [branch.branch_id, prod.product_id]
      );
      for (let bIdx = 0; bIdx < invRows.length; bIdx++) {
        const unitsForThisBatch = bIdx === 0 ? targetUnits : 0;
        await conn.execute(
          `UPDATE inventory SET quantity = 0, loose_quantity = ? WHERE branch_id = ? AND batch_id = ?`,
          [unitsForThisBatch, branch.branch_id, invRows[bIdx].batch_id]
        );
      }
    }

    // 2. Seed 4 batches expiring within 1 month (0..30 days) per branch
    for (let idx = 0; idx < soonExpProducts.length; idx++) {
      const prod = soonExpProducts[idx];
      const daysAhead = expiryDaysTargets[idx];
      const batchNo = `SOONEXP${idx + 1}-${branch.branch_code}`;
      const [bExists] = await conn.execute(
        `SELECT batch_id FROM batches WHERE branch_id = ? AND product_id = ? AND batch_number = ? LIMIT 1`,
        [branch.branch_id, prod.product_id, batchNo]
      );
      if (!bExists.length) {
        const mrp = 65 + idx * 18;
        const purchase = Number((mrp * 0.7).toFixed(2));
        const selling = Number((mrp * 0.9).toFixed(2));
        const [bRes] = await conn.execute(
          `INSERT INTO batches (branch_id, product_id, batch_number, expiry_date, mrp, purchase_price)
           VALUES (?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, ?)`,
          [branch.branch_id, prod.product_id, batchNo, daysAhead, mrp, purchase]
        );
        await conn.execute(
          `INSERT INTO inventory (branch_id, batch_id, quantity, loose_quantity, selling_price)
           VALUES (?, ?, ?, 0, ?)`,
          [branch.branch_id, bRes.insertId, 3 + idx, selling]
        );
      }
    }

    // 3. Gather healthy high-stock batches (excluding low-stock and soon-expiring) for consistent sales & purchases
    const [healthyBatches] = await conn.execute(
      `SELECT ba.batch_id, ba.product_id, ba.batch_number, ba.expiry_date, ba.mrp, ba.purchase_price,
              i.selling_price, i.quantity, p.product_name, p.units_per_stock_unit,
              p.default_hsn_code, p.default_gst_rate
       FROM batches ba
       JOIN inventory i ON i.batch_id = ba.batch_id AND i.branch_id = ba.branch_id
       JOIN products p ON p.product_id = ba.product_id
       WHERE ba.branch_id = ?
         AND (ba.expiry_date IS NULL OR ba.expiry_date > DATE_ADD(CURDATE(), INTERVAL 60 DAY))
         AND i.quantity >= 8
       ORDER BY ba.batch_id ASC LIMIT 10`,
      [branch.branch_id]
    );
    const sellable = healthyBatches.filter((b) => !lowStockIds.has(Number(b.product_id)));
    if (sellable.length < 2) continue;

    // 4. Add 3 consistent purchases (Today, This Week, Earlier This Month) + update inventory
    const [supRows] = await conn.execute(
      `SELECT supplier_id FROM suppliers WHERE branch_id = ? AND is_active = TRUE ORDER BY supplier_id ASC LIMIT 4`,
      [branch.branch_id]
    );
    if (supRows.length) {
      const purConfigs = [
        { supId: supRows[0].supplier_id, inv: `PUR2-${branch.branch_code}-01`, pay: "CASH", daysAgo: 0, packs: 6, batch: sellable[0] },
        { supId: (supRows[1] || supRows[0]).supplier_id, inv: `PUR2-${branch.branch_code}-02`, pay: "CHEQUE", daysAgo: weekDaysAgo2, packs: 5, batch: sellable[1] },
        { supId: (supRows[2] || supRows[0]).supplier_id, inv: `PUR2-${branch.branch_code}-03`, pay: "CASH", daysAgo: monthDaysAgo2, packs: 8, batch: sellable[2] || sellable[0] },
      ];
      for (const pc of purConfigs) {
        const packSize = Math.max(1, Number(pc.batch.units_per_stock_unit || 1));
        const units = pc.packs * packSize;
        const lineTotal = Number((Number(pc.batch.purchase_price) * pc.packs).toFixed(2));
        const [pRes] = await conn.execute(
          `INSERT INTO purchases (
             branch_id, supplier_id, supplier_invoice_number, purchase_datetime, payment_method,
             subtotal, discount_total, taxable_total, cgst_total, sgst_total, grand_total,
             status, client_transaction_id, notes, created_by
           ) VALUES (?, ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?, ?, 0, 0, 0, 0, ?, 'FINALIZED', ?, 'Consistent v2 purchase', ?)`,
          [branch.branch_id, pc.supId, pc.inv, pc.daysAgo, pc.pay, lineTotal, lineTotal, randomUUID(), userId]
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
            pc.batch.product_id,
            pc.batch.batch_id,
            pc.batch.batch_number,
            toDateStr(pc.batch.expiry_date),
            pc.packs,
            units,
            pc.batch.purchase_price,
            pc.batch.mrp,
            pc.batch.selling_price,
            pc.batch.default_hsn_code || "30049099",
            pc.batch.default_gst_rate || 5,
            lineTotal,
          ]
        );
        await adjustInventoryUnits(conn, branch.branch_id, pc.batch.batch_id, units);
      }
    }

    // 5. Add 9 Billed Sales + 2 Unbilled Sales across Today, This Week, This Month + deduct inventory
    const [patRows] = await conn.execute(
      `SELECT patient_id, full_name, mobile FROM patients WHERE branch_id = ? ORDER BY patient_id ASC LIMIT 4`,
      [branch.branch_id]
    );
    const [docRows] = await conn.execute(
      `SELECT doctor_id, full_name FROM doctors WHERE branch_id = ? ORDER BY doctor_id ASC LIMIT 2`,
      [branch.branch_id]
    );

    const v2Sales = [
      { inv: `${prefix}-DEMO-201`, patIdx: 0, pay: "UPI", daysAgo: 0, qty1: 12, qty2: 6, type: "BILLED" },
      { inv: `${prefix}-DEMO-202`, patIdx: 1, pay: "CASH", daysAgo: 0, qty1: 9, qty2: 5, type: "BILLED" },
      { inv: `${prefix}-DEMO-203`, patIdx: 2, pay: "CARD", daysAgo: 0, qty1: 10, qty2: 4, type: "BILLED" },
      { inv: `${prefix}-DEMO-204`, patIdx: 3, pay: "CASH", daysAgo: weekDaysAgo1, qty1: 8, qty2: 5, type: "BILLED" },
      { inv: `${prefix}-DEMO-205`, patIdx: 0, pay: "UPI", daysAgo: weekDaysAgo2, qty1: 15, qty2: 6, type: "BILLED" },
      { inv: `${prefix}-DEMO-206`, patIdx: 1, pay: "CARD", daysAgo: weekDaysAgo2, qty1: 7, qty2: 5, type: "BILLED" },
      { inv: `${prefix}-DEMO-207`, patIdx: 2, pay: "UPI", daysAgo: monthDaysAgo1, qty1: 11, qty2: 6, type: "BILLED" },
      { inv: `${prefix}-DEMO-208`, patIdx: 3, pay: "CASH", daysAgo: monthDaysAgo2, qty1: 14, qty2: 8, type: "BILLED" },
      { inv: `${prefix}-DEMO-209`, patIdx: 0, pay: "CARD", daysAgo: monthDaysAgo3, qty1: 10, qty2: 5, type: "BILLED" },
      { inv: null, patIdx: -1, pay: "NOT_RECORDED", daysAgo: 0, qty1: 4, qty2: 0, type: "UNBILLED" },
      { inv: null, patIdx: -1, pay: "NOT_RECORDED", daysAgo: monthDaysAgo1, qty1: 5, qty2: 0, type: "UNBILLED" },
    ];

    const createdForReturn = [];
    for (let sIdx = 0; sIdx < v2Sales.length; sIdx++) {
      const sc = v2Sales[sIdx];
      const pat = sc.patIdx >= 0 ? patRows[sc.patIdx % Math.max(1, patRows.length)] : null;
      const doc = docRows[sIdx % Math.max(1, docRows.length)] || null;
      const b1 = sellable[sIdx % sellable.length];
      const b2 = sellable[(sIdx + 1) % sellable.length];
      const lines = [{ batch: b1, qty: sc.qty1 }];
      if (sc.qty2 > 0 && b2 && b2.batch_id !== b1.batch_id) {
        lines.push({ batch: b2, qty: sc.qty2 });
      }

      let subtotal = 0;
      let taxableTotal = 0;
      let cgstTotal = 0;
      let sgstTotal = 0;
      const prepared = lines.map((ln) => {
        const packSize = Math.max(1, Number(ln.batch.units_per_stock_unit || 1));
        const unitPrice = Number((Number(ln.batch.selling_price) / packSize).toFixed(2));
        const lineTotal = Number((unitPrice * ln.qty).toFixed(2));
        const gst = Number(ln.batch.default_gst_rate || 5);
        const taxable = Number((lineTotal / (1 + gst / 100)).toFixed(2));
        const tax = Number((lineTotal - taxable).toFixed(2));
        const cgst = Number((tax / 2).toFixed(2));
        const sgst = Number((tax - cgst).toFixed(2));
        subtotal += lineTotal;
        taxableTotal += taxable;
        cgstTotal += cgst;
        sgstTotal += sgst;
        return { ...ln, unitPrice, lineTotal, gst, taxable, cgst, sgst };
      });

      const grandTotal = Number(subtotal.toFixed(2));
      const notes = pat
        ? `Patient: ${pat.full_name} | Age: ${28 + (sIdx % 20)} | Mobile: ${pat.mobile || "N/A"} | Gender: ${sIdx % 2 === 0 ? "MALE" : "FEMALE"} | Doctor: ${doc?.full_name || "Self"}`
        : "Counter unbilled sale";

      const [sRes] = await conn.execute(
        `INSERT INTO sales (
           branch_id, patient_id, doctor_id, sale_type, status, invoice_number,
           client_transaction_id, sale_datetime, payment_method, subtotal, discount_total,
           taxable_total, cgst_total, sgst_total, igst_total, grand_total, notes, created_by
         ) VALUES (?, ?, ?, ?, 'FINALIZED', ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
        [
          branch.branch_id,
          pat?.patient_id || null,
          doc?.doctor_id || null,
          sc.type,
          sc.inv,
          randomUUID(),
          sc.daysAgo,
          sc.pay,
          grandTotal,
          Number(taxableTotal.toFixed(2)),
          Number(cgstTotal.toFixed(2)),
          Number(sgstTotal.toFixed(2)),
          grandTotal,
          notes,
          userId,
        ]
      );

      for (let lIdx = 0; lIdx < prepared.length; lIdx++) {
        const pl = prepared[lIdx];
        const [siRes] = await conn.execute(
          `INSERT INTO sale_items (
             sale_id, branch_id, batch_id, product_name_snapshot, batch_number_snapshot,
             expiry_date_snapshot, quantity, mrp, unit_selling_price, discount_amount,
             hsn_code, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?)`,
          [
            sRes.insertId,
            branch.branch_id,
            pl.batch.batch_id,
            pl.batch.product_name,
            pl.batch.batch_number,
            toDateStr(pl.batch.expiry_date),
            pl.qty,
            pl.batch.mrp,
            pl.unitPrice,
            pl.batch.default_hsn_code || "30049099",
            pl.gst,
            pl.taxable,
            pl.cgst,
            pl.sgst,
            pl.lineTotal,
          ]
        );
        await adjustInventoryUnits(conn, branch.branch_id, pl.batch.batch_id, -pl.qty);
        await conn.execute(
          `INSERT INTO stock_transactions (
             branch_id, batch_id, transaction_type, quantity_delta, source_type,
             source_key, idempotency_key, notes, occurred_at, created_by
           ) VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?)`,
          [
            branch.branch_id,
            pl.batch.batch_id,
            -pl.qty,
            sc.type === "BILLED" ? "BILLED_SALE" : "UNBILLED_SALE",
            sc.inv || `UNBILLED-${sRes.insertId}`,
            randomUUID(),
            notes,
            sc.daysAgo,
            userId,
          ]
        );

        if ((sc.inv === `${prefix}-DEMO-201` || sc.inv === `${prefix}-DEMO-207`) && lIdx === 0) {
          createdForReturn.push({
            saleId: sRes.insertId,
            daysAgo: sc.daysAgo,
            saleItemId: siRes.insertId,
            batchId: pl.batch.batch_id,
            unitPrice: pl.unitPrice,
            lineTotal: pl.lineTotal,
            soldQty: pl.qty,
            retQty: 2,
          });
        }
      }
    }

    // 6. Consistent customer returns + restock inventory
    for (let rIdx = 0; rIdx < createdForReturn.length; rIdx++) {
      const cr = createdForReturn[rIdx];
      const refund = Number(((cr.lineTotal / cr.soldQty) * cr.retQty).toFixed(2));
      const cnNo = `CN-${branch.branch_code}-DEMO-20${rIdx + 1}`;
      const [crRes] = await conn.execute(
        `INSERT INTO customer_returns (
           branch_id, sale_id, return_datetime, credit_note_number,
           return_total, client_transaction_id, notes, created_by
         ) VALUES (?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?, ?, ?, 'Consistent demo return', ?)`,
        [branch.branch_id, cr.saleId, cr.daysAgo, cnNo, refund, randomUUID(), userId]
      );
      await conn.execute(
        `INSERT INTO customer_return_items (
           customer_return_id, branch_id, sale_item_id, batch_id, quantity, refund_amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [crRes.insertId, branch.branch_id, cr.saleItemId, cr.batchId, cr.retQty, refund]
      );
      await adjustInventoryUnits(conn, branch.branch_id, cr.batchId, cr.retQty);
      await conn.execute(
        `INSERT INTO stock_transactions (
           branch_id, batch_id, transaction_type, quantity_delta, source_type,
           source_key, idempotency_key, notes, occurred_at, created_by
         ) VALUES (?, ?, 'CUSTOMER_RETURN', ?, 'CUSTOMER_RETURN', ?, ?, 'Consistent return restock', DATE_SUB(NOW(3), INTERVAL ? DAY), ?)`,
        [branch.branch_id, cr.batchId, cr.retQty, cnNo, randomUUID(), cr.daysAgo, userId]
      );
    }
  }
  console.log("[MIGRATE] Seeded consistent v2 demo dataset (alerts, bills, purchases, returns, inventory).");
}

async function seedConsistentDemoV3(conn, branchRows, userByBranch, fallbackUserId) {
  const [already] = await conn.query(
    `SELECT sale_id FROM sales WHERE invoice_number LIKE '%-DEMO-301' LIMIT 1`
  );
  if (already.length > 0) return;

  const [calRows] = await conn.query(`SELECT DAY(CURDATE()) AS dom`);
  const dom = Math.max(1, Number(calRows?.[0]?.dom || 1));
  const monthDaysAgoA = Math.min(8, dom - 1);
  const monthDaysAgoB = Math.min(12, dom - 1);

  for (const branch of branchRows) {
    const userId = userByBranch.get(Number(branch.branch_id)) || fallbackUserId;
    const prefix = branch.invoice_prefix || "KM";

    const [patRows] = await conn.execute(
      `SELECT patient_id, full_name, mobile FROM patients WHERE branch_id = ? ORDER BY patient_id ASC LIMIT 4`,
      [branch.branch_id]
    );
    const [docRows] = await conn.execute(
      `SELECT doctor_id, full_name FROM doctors WHERE branch_id = ? ORDER BY doctor_id ASC LIMIT 2`,
      [branch.branch_id]
    );
    const [sellable] = await conn.execute(
      `SELECT ba.batch_id, ba.product_id, ba.batch_number, ba.expiry_date, ba.mrp, ba.purchase_price,
              i.selling_price, p.product_name, p.units_per_stock_unit, p.default_hsn_code, p.default_gst_rate
       FROM batches ba
       JOIN inventory i ON i.batch_id = ba.batch_id AND i.branch_id = ba.branch_id
       JOIN products p ON p.product_id = ba.product_id
       WHERE ba.branch_id = ?
         AND (ba.expiry_date IS NULL OR ba.expiry_date > DATE_ADD(CURDATE(), INTERVAL 60 DAY))
         AND i.quantity >= 6
       ORDER BY i.quantity DESC, ba.batch_id ASC LIMIT 4`,
      [branch.branch_id]
    );
    if (sellable.length < 2) continue;

    const extraSales = [
      { inv: `${prefix}-DEMO-301`, patIdx: 1, pay: "UPI", daysAgo: monthDaysAgoA, qty1: 20, qty2: 15 },
      { inv: `${prefix}-DEMO-302`, patIdx: 3, pay: "CASH", daysAgo: monthDaysAgoB, qty1: 18, qty2: 12 },
    ];

    for (let idx = 0; idx < extraSales.length; idx++) {
      const sc = extraSales[idx];
      const pat = patRows[sc.patIdx % Math.max(1, patRows.length)] || null;
      const doc = docRows[idx % Math.max(1, docRows.length)] || null;
      const b1 = sellable[idx % sellable.length];
      const b2 = sellable[(idx + 1) % sellable.length];
      const lines = [{ batch: b1, qty: sc.qty1 }];
      if (b2 && b2.batch_id !== b1.batch_id) lines.push({ batch: b2, qty: sc.qty2 });

      let subtotal = 0;
      let taxableTotal = 0;
      let cgstTotal = 0;
      let sgstTotal = 0;
      const prepared = lines.map((ln) => {
        const packSize = Math.max(1, Number(ln.batch.units_per_stock_unit || 1));
        const unitPrice = Number((Number(ln.batch.selling_price) / packSize).toFixed(2));
        const lineTotal = Number((unitPrice * ln.qty).toFixed(2));
        const gst = Number(ln.batch.default_gst_rate || 5);
        const taxable = Number((lineTotal / (1 + gst / 100)).toFixed(2));
        const tax = Number((lineTotal - taxable).toFixed(2));
        const cgst = Number((tax / 2).toFixed(2));
        const sgst = Number((tax - cgst).toFixed(2));
        subtotal += lineTotal;
        taxableTotal += taxable;
        cgstTotal += cgst;
        sgstTotal += sgst;
        return { ...ln, unitPrice, lineTotal, gst, taxable, cgst, sgst };
      });

      const grandTotal = Number(subtotal.toFixed(2));
      const notes = pat
        ? `Patient: ${pat.full_name} | Age: ${32 + idx} | Mobile: ${pat.mobile || "N/A"} | Gender: ${idx === 0 ? "FEMALE" : "MALE"} | Doctor: ${doc?.full_name || "Self"}`
        : "Counter billed sale";

      const [sRes] = await conn.execute(
        `INSERT INTO sales (
           branch_id, patient_id, doctor_id, sale_type, status, invoice_number,
           client_transaction_id, sale_datetime, payment_method, subtotal, discount_total,
           taxable_total, cgst_total, sgst_total, igst_total, grand_total, notes, created_by
         ) VALUES (?, ?, ?, 'BILLED', 'FINALIZED', ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
        [
          branch.branch_id,
          pat?.patient_id || null,
          doc?.doctor_id || null,
          sc.inv,
          randomUUID(),
          sc.daysAgo,
          sc.pay,
          grandTotal,
          Number(taxableTotal.toFixed(2)),
          Number(cgstTotal.toFixed(2)),
          Number(sgstTotal.toFixed(2)),
          grandTotal,
          notes,
          userId,
        ]
      );

      for (const pl of prepared) {
        await conn.execute(
          `INSERT INTO sale_items (
             sale_id, branch_id, batch_id, product_name_snapshot, batch_number_snapshot,
             expiry_date_snapshot, quantity, mrp, unit_selling_price, discount_amount,
             hsn_code, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?)`,
          [
            sRes.insertId,
            branch.branch_id,
            pl.batch.batch_id,
            pl.batch.product_name,
            pl.batch.batch_number,
            toDateStr(pl.batch.expiry_date),
            pl.qty,
            pl.batch.mrp,
            pl.unitPrice,
            pl.batch.default_hsn_code || "30049099",
            pl.gst,
            pl.taxable,
            pl.cgst,
            pl.sgst,
            pl.lineTotal,
          ]
        );
        await adjustInventoryUnits(conn, branch.branch_id, pl.batch.batch_id, -pl.qty);
        await conn.execute(
          `INSERT INTO stock_transactions (
             branch_id, batch_id, transaction_type, quantity_delta, source_type,
             source_key, idempotency_key, notes, occurred_at, created_by
           ) VALUES (?, ?, 'SALE', ?, 'BILLED_SALE', ?, ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?)`,
          [
            branch.branch_id,
            pl.batch.batch_id,
            -pl.qty,
            sc.inv,
            randomUUID(),
            notes,
            sc.daysAgo,
            userId,
          ]
        );
      }
    }
  }
  console.log("[MIGRATE] Seeded consistent v3 monthly bills for positive monthly profit.");
}

async function seedConsistentDemoV4(conn, branchRows, userByBranch, fallbackUserId) {
  const [already] = await conn.query(
    `SELECT sale_id FROM sales WHERE invoice_number LIKE '%-DEMO-401' LIMIT 1`
  );
  if (already.length > 0) return;

  const [calRows] = await conn.query(`SELECT DAY(CURDATE()) AS dom, WEEKDAY(CURDATE()) AS wd`);
  const dom = Math.max(1, Number(calRows?.[0]?.dom || 1));

  const extraDocNames = ["Dr. Suresh Nair", "Dr. Priya Deshmukh"];

  for (let bIdx = 0; bIdx < branchRows.length; bIdx++) {
    const branch = branchRows[bIdx];
    const userId = userByBranch.get(Number(branch.branch_id)) || fallbackUserId;
    const prefix = branch.invoice_prefix || "KM";

    // Ensure extra prescribing doctors exist for this branch
    for (const dName of extraDocNames) {
      const [dFound] = await conn.execute(
        `SELECT doctor_id FROM doctors WHERE branch_id = ? AND LOWER(TRIM(full_name)) = LOWER(?) LIMIT 1`,
        [branch.branch_id, dName]
      );
      if (!dFound.length) {
        await conn.execute(
          `INSERT INTO doctors (branch_id, full_name) VALUES (?, ?)`,
          [branch.branch_id, dName]
        );
      }
    }

    const [patRows] = await conn.execute(
      `SELECT patient_id, full_name, mobile FROM patients WHERE branch_id = ? ORDER BY patient_id ASC LIMIT 4`,
      [branch.branch_id]
    );
    const [docRows] = await conn.execute(
      `SELECT doctor_id, full_name FROM doctors WHERE branch_id = ? ORDER BY doctor_id ASC LIMIT 4`,
      [branch.branch_id]
    );
    const [supRows] = await conn.execute(
      `SELECT supplier_id FROM suppliers WHERE branch_id = ? AND is_active = TRUE ORDER BY supplier_id ASC LIMIT 3`,
      [branch.branch_id]
    );

    // Pick high-value, long-expiry batches so 12 monthly bills hit ~35k for BR001 (~24k BR002, ~19k BR003)
    const [sellable] = await conn.execute(
      `SELECT ba.batch_id, ba.product_id, ba.batch_number, ba.expiry_date, ba.mrp, ba.purchase_price,
              i.selling_price, p.product_name, p.units_per_stock_unit, p.default_hsn_code, p.default_gst_rate
       FROM batches ba
       JOIN inventory i ON i.batch_id = ba.batch_id AND i.branch_id = ba.branch_id
       JOIN products p ON p.product_id = ba.product_id
       WHERE ba.branch_id = ?
         AND (ba.expiry_date IS NULL OR ba.expiry_date > DATE_ADD(CURDATE(), INTERVAL 90 DAY))
         AND i.quantity >= 5
       ORDER BY ba.mrp DESC, ba.batch_id ASC LIMIT 6`,
      [branch.branch_id]
    );
    if (sellable.length < 3) continue;

    // 1. Restock plenty of packs first via 3 consistent purchases so inventory stays healthy & purchases scale cleanly
    const restockPacks = bIdx === 0 ? 35 : bIdx === 1 ? 24 : 18;
    if (supRows.length) {
      const purDays = [0, Math.min(4, dom - 1), Math.min(11, dom - 1)];
      for (let pIdx = 0; pIdx < 3; pIdx++) {
        const batch = sellable[pIdx % sellable.length];
        const packs = Math.max(8, Math.round(restockPacks / 3));
        const packSize = Math.max(1, Number(batch.units_per_stock_unit || 1));
        const addUnits = packs * packSize;
        const lineTotal = Number((Number(batch.purchase_price) * packs).toFixed(2));
        const invNo = `PUR4-${branch.branch_code}-0${pIdx + 1}`;
        const supId = supRows[pIdx % supRows.length].supplier_id;

        const [pRes] = await conn.execute(
          `INSERT INTO purchases (
             branch_id, supplier_id, supplier_invoice_number, purchase_datetime, payment_method,
             subtotal, discount_total, taxable_total, cgst_total, sgst_total, grand_total,
             status, client_transaction_id, notes, created_by
           ) VALUES (?, ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?, ?, 0, 0, 0, 0, ?, 'FINALIZED', ?, 'Monthly high-volume restock', ?)`,
          [branch.branch_id, supId, invNo, purDays[pIdx], pIdx === 1 ? "CHEQUE" : "CASH", lineTotal, lineTotal, randomUUID(), userId]
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
            batch.product_id,
            batch.batch_id,
            batch.batch_number,
            toDateStr(batch.expiry_date),
            packs,
            addUnits,
            batch.purchase_price,
            batch.mrp,
            batch.selling_price,
            batch.default_hsn_code || "30049099",
            batch.default_gst_rate || 5,
            lineTotal,
          ]
        );
        await adjustInventoryUnits(conn, branch.branch_id, batch.batch_id, addUnits);
      }
    }

    // 2. Seed 12 realistic billed sales distributed across the current month (~₹2,800 avg per bill for BR001 -> ~35k total)
    const daysOffsets = [0, 0, 1, 2, 3, 5, 7, 9, 12, 15, 18, 21];
    const payCycle = ["UPI", "CARD", "CASH"];
    const scaleFactor = bIdx === 0 ? 1 : bIdx === 1 ? 0.72 : 0.56;

    for (let sIdx = 0; sIdx < daysOffsets.length; sIdx++) {
      const daysAgo = Math.min(daysOffsets[sIdx], dom - 1);
      const pat = patRows[sIdx % Math.max(1, patRows.length)] || null;
      const doc = docRows[sIdx % Math.max(1, docRows.length)] || null;
      const pay = payCycle[sIdx % payCycle.length];
      const inv = `${prefix}-DEMO-${401 + sIdx}`;

      const lineDefs = [0, 1, 2].map((offset) => {
        const batch = sellable[(sIdx + offset) % sellable.length];
        const packSize = Math.max(1, Number(batch.units_per_stock_unit || 1));
        const unitPrice = Number((Number(batch.selling_price) / packSize).toFixed(2));
        // Target ~₹950 per line item for BR001 so 3 lines ≈ ₹2,850 per bill
        const targetLineAmount = 950 * scaleFactor;
        const qty = Math.max(4, Math.min(packSize * 8, Math.round(targetLineAmount / Math.max(1, unitPrice))));
        return { batch, unitPrice, qty };
      });

      // Deduplicate by batch_id in case sellable.length < 3
      const mergedByBatch = new Map();
      for (const ld of lineDefs) {
        if (!mergedByBatch.has(ld.batch.batch_id)) mergedByBatch.set(ld.batch.batch_id, ld);
      }

      let subtotal = 0;
      let taxableTotal = 0;
      let cgstTotal = 0;
      let sgstTotal = 0;
      const prepared = Array.from(mergedByBatch.values()).map((ln) => {
        const lineTotal = Number((ln.unitPrice * ln.qty).toFixed(2));
        const gst = Number(ln.batch.default_gst_rate || 5);
        const taxable = Number((lineTotal / (1 + gst / 100)).toFixed(2));
        const tax = Number((lineTotal - taxable).toFixed(2));
        const cgst = Number((tax / 2).toFixed(2));
        const sgst = Number((tax - cgst).toFixed(2));
        subtotal += lineTotal;
        taxableTotal += taxable;
        cgstTotal += cgst;
        sgstTotal += sgst;
        return { ...ln, lineTotal, gst, taxable, cgst, sgst };
      });

      const grandTotal = Number(subtotal.toFixed(2));
      const notes = pat
        ? `Patient: ${pat.full_name} | Age: ${30 + (sIdx % 25)} | Mobile: ${pat.mobile || "N/A"} | Gender: ${sIdx % 2 === 0 ? "MALE" : "FEMALE"} | Doctor: ${doc?.full_name || "Self"}`
        : `Doctor: ${doc?.full_name || "Self"}`;

      const [sRes] = await conn.execute(
        `INSERT INTO sales (
           branch_id, patient_id, doctor_id, sale_type, status, invoice_number,
           client_transaction_id, sale_datetime, payment_method, subtotal, discount_total,
           taxable_total, cgst_total, sgst_total, igst_total, grand_total, notes, created_by
         ) VALUES (?, ?, ?, 'BILLED', 'FINALIZED', ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
        [
          branch.branch_id,
          pat?.patient_id || null,
          doc?.doctor_id || null,
          inv,
          randomUUID(),
          daysAgo,
          pay,
          grandTotal,
          Number(taxableTotal.toFixed(2)),
          Number(cgstTotal.toFixed(2)),
          Number(sgstTotal.toFixed(2)),
          grandTotal,
          notes,
          userId,
        ]
      );

      for (const pl of prepared) {
        await conn.execute(
          `INSERT INTO sale_items (
             sale_id, branch_id, batch_id, product_name_snapshot, batch_number_snapshot,
             expiry_date_snapshot, quantity, mrp, unit_selling_price, discount_amount,
             hsn_code, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?)`,
          [
            sRes.insertId,
            branch.branch_id,
            pl.batch.batch_id,
            pl.batch.product_name,
            pl.batch.batch_number,
            toDateStr(pl.batch.expiry_date),
            pl.qty,
            pl.batch.mrp,
            pl.unitPrice,
            pl.batch.default_hsn_code || "30049099",
            pl.gst,
            pl.taxable,
            pl.cgst,
            pl.sgst,
            pl.lineTotal,
          ]
        );
        await adjustInventoryUnits(conn, branch.branch_id, pl.batch.batch_id, -pl.qty);
        await conn.execute(
          `INSERT INTO stock_transactions (
             branch_id, batch_id, transaction_type, quantity_delta, source_type,
             source_key, idempotency_key, notes, occurred_at, created_by
           ) VALUES (?, ?, 'SALE', ?, 'BILLED_SALE', ?, ?, ?, DATE_SUB(NOW(3), INTERVAL ? DAY), ?)`,
          [
            branch.branch_id,
            pl.batch.batch_id,
            -pl.qty,
            inv,
            randomUUID(),
            notes,
            daysAgo,
            userId,
          ]
        );
      }
    }
  }
  console.log("[MIGRATE] Seeded ~35k/month v4 demo dataset with daily trends and doctor attribution.");
}

module.exports = { ensureSchemaReady, splitSqlStatements };
