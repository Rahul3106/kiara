const pool = require("../server/db");
const { ensureSchemaReady } = require("../server/lib/ensureSchemaReady");

(async () => {
  try {
    // Allow boot connection check to settle briefly
    await new Promise((r) => setTimeout(r, 3000));
    if (pool.isMockMode()) {
      console.error("Cannot run migrations: MySQL database is not reachable (running in mock mode).");
      process.exitCode = 1;
      return;
    }
    await ensureSchemaReady(pool);
    console.log("Database migrations verified successfully.");
  } catch (err) {
    console.error("Migration error:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
