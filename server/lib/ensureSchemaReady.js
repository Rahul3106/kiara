const bcrypt = require("bcryptjs");

/**
 * Idempotently applies required schema updates (branch renames, SHOP_MANAGER role ENUM,
 * and default Shop Manager account) on a live MySQL database.
 */
async function ensureSchemaReady(pool) {
  if (!pool || (typeof pool.isMockMode === "function" && pool.isMockMode())) {
    return;
  }

  try {
    // 1. Ensure users.role ENUM includes SHOP_MANAGER (and convert any SHOP_WORKER rows to SHOP_USER)
    const [colRows] = await pool.query(`SHOW COLUMNS FROM users LIKE 'role'`);
    const colType = colRows?.[0]?.Type || "";
    if (!colType.includes("SHOP_MANAGER") || colType.includes("SHOP_WORKER")) {
      if (colType.includes("SHOP_WORKER")) {
        await pool.query(`UPDATE users SET role = 'SHOP_USER' WHERE role = 'SHOP_WORKER'`);
      }
      await pool.query(
        `ALTER TABLE users MODIFY COLUMN role ENUM('ADMIN', 'SHOP_USER', 'SHOP_MANAGER') NOT NULL DEFAULT 'SHOP_USER'`
      );
      console.log("[MIGRATE] Updated users.role ENUM to ADMIN, SHOP_USER, SHOP_MANAGER.");
    }

    // 2. Rename branches BR001/BR002/BR003 to Kiara Medicals A / B / C
    await pool.query(
      `UPDATE branches SET branch_name = 'Kiara Medicals A', legal_name = 'Kiara Medicals A Pvt Ltd', invoice_prefix = 'KM-A' WHERE (branch_code = 'BR001' OR branch_id = 1) AND branch_name <> 'Kiara Medicals A'`
    );
    await pool.query(
      `UPDATE branches SET branch_name = 'Kiara Medicals B', legal_name = 'Kiara Medicals B Pvt Ltd', invoice_prefix = 'KM-B' WHERE (branch_code = 'BR002' OR branch_id = 2) AND branch_name <> 'Kiara Medicals B'`
    );
    await pool.query(
      `UPDATE branches SET branch_name = 'Kiara Medicals C', legal_name = 'Kiara Medicals C Pvt Ltd', invoice_prefix = 'KM-C' WHERE (branch_code = 'BR003' OR branch_id = 3) AND branch_name <> 'Kiara Medicals C'`
    );

    // 3. Seed managera on Branch A if missing
    const [branchRows] = await pool.query(
      `SELECT branch_id FROM branches WHERE branch_code = 'BR001' OR branch_id = 1 ORDER BY branch_id ASC LIMIT 1`
    );
    if (branchRows.length > 0) {
      const br1 = branchRows[0].branch_id;
      const defaultAccounts = [
        {
          username: "managera",
          pass: "ManagerA@12345",
          name: "Test Shop Manager A",
          role: "SHOP_MANAGER",
        },
      ];

      for (const acc of defaultAccounts) {
        const [exists] = await pool.execute(
          `SELECT user_id FROM users WHERE username = ? LIMIT 1`,
          [acc.username]
        );
        if (exists.length === 0) {
          const hash = await bcrypt.hash(acc.pass, 12);
          await pool.execute(
            `INSERT INTO users (branch_id, full_name, username, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
            [br1, acc.name, acc.username, hash, acc.role]
          );
          console.log(`[MIGRATE] Created user: ${acc.username} (${acc.role})`);
        }
      }
    }
  } catch (err) {
    console.warn("[MIGRATE] Startup migration skipped/failed:", err.message);
  }
}

module.exports = { ensureSchemaReady };
