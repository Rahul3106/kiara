const mysql = require("mysql2/promise");
const { env } = require("./config/env");
const { executeMockQuery, createMockConnection } = require("./mockDb");
const { ensureSchemaReady } = require("./lib/ensureSchemaReady");

let isMockMode = env.db.useMock;

const rawPool = isMockMode
  ? null
  : mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.name,
      waitForConnections: true,
      connectionLimit: env.db.connectionLimit,
      connectTimeout: env.db.connectTimeout,
      queueLimit: 0,
      ...(env.db.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    });

// Test connection on boot
if (!isMockMode) {
  (async () => {
    try {
      const conn = await Promise.race([
        rawPool.getConnection(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Database connection timed out")),
            env.db.connectTimeout
          )
        ),
      ]);
      conn.release();
      console.log("Connected to MySQL successfully!");
      ensureSchemaReady(poolWrapper);
    } catch (err) {
      console.warn(
        `MySQL not available (${err.message}). Using local store fallback.`
      );
      isMockMode = true;
    }
  })();
} else {
  console.log("DB_USE_MOCK=true -> Using local mock data store.");
}

const poolWrapper = {
  isMockMode() {
    return isMockMode;
  },

  async execute(sql, params) {
    if (isMockMode) {
      return executeMockQuery(sql, params);
    }
    try {
      return await rawPool.execute(sql, params);
    } catch (err) {
      console.warn(`MySQL error (${err.message}), falling back to local store.`);
      isMockMode = true;
      return executeMockQuery(sql, params);
    }
  },

  async query(sql, params) {
    if (isMockMode) {
      return executeMockQuery(sql, params);
    }
    try {
      return await rawPool.query(sql, params);
    } catch (err) {
      console.warn(`MySQL error (${err.message}), falling back to local store.`);
      isMockMode = true;
      return executeMockQuery(sql, params);
    }
  },

  async getConnection() {
    if (isMockMode) {
      return createMockConnection();
    }
    try {
      return await rawPool.getConnection();
    } catch (err) {
      console.warn(`MySQL error (${err.message}), falling back to local connection.`);
      isMockMode = true;
      return createMockConnection();
    }
  },

  async end() {
    if (!rawPool) return;
    try {
      await rawPool.end();
    } catch (_) {}
  },
};

module.exports = poolWrapper;
