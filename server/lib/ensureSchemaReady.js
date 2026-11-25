const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

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
      `SELECT branch_id, branch_code FROM branches WHERE is_active = TRUE`
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
  } catch (err) {
    console.warn("[MIGRATE] Startup migration skipped/failed:", err.message);
  } finally {
    if (conn && typeof conn.release === "function") {
      conn.release();
    }
  }
}

module.exports = { ensureSchemaReady, splitSqlStatements };
