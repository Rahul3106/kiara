const mysql = require("mysql2/promise");
const { env } = require("./config/env");
const { executeMockQuery, createMockConnection } = require("./mockDb");
const { ensureSchemaReady } = require("./lib/ensureSchemaReady");

let isMockMode = env.db.useMock;
let dbConnected = false;
let lastDbError = null;

function isConnectionError(err) {
  const code = err?.code || "";
  return [
    "ETIMEDOUT",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EHOSTUNREACH",
    "ECONNRESET",
    "PROTOCOL_CONNECTION_LOST",
  ].includes(code) || /timed out|ETIMEDOUT|ECONNREFUSED/i.test(err?.message || "");
}

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
      const conn = await rawPool.getConnection();
      conn.release();
      dbConnected = true;
      lastDbError = null;
      console.log("Connected to MySQL successfully!");
      ensureSchemaReady(poolWrapper);
    } catch (err) {
      dbConnected = false;
      lastDbError = `${err.code || "ERR"}: ${err.message}`;
      if (env.db.allowMockFallback) {
        console.warn(
          `MySQL not available (${err.message}). Using local store fallback.`
        );
        isMockMode = true;
      } else {
        console.error(
          `MySQL connection error (${lastDbError}). Check DB credentials, DB_CONNECT_TIMEOUT_MS (${env.db.connectTimeout}ms), or Aiven Allowed IP Addresses.`
        );
      }
    }
  })();
} else {
  console.log("DB_USE_MOCK=true -> Using local mock data store.");
}

const poolWrapper = {
  isMockMode() {
    return isMockMode;
  },

  getStatus() {
    if (isMockMode) return { mode: "mock", connected: true, error: lastDbError };
    return { mode: "mysql", connected: dbConnected, error: lastDbError };
  },

  async execute(sql, params) {
    if (isMockMode) {
      return executeMockQuery(sql, params);
    }
    try {
      const res = await rawPool.execute(sql, params);
      dbConnected = true;
      lastDbError = null;
      return res;
    } catch (err) {
      if (isConnectionError(err)) {
        dbConnected = false;
        lastDbError = `${err.code || "ERR"}: ${err.message}`;
        if (env.db.allowMockFallback) {
          console.warn(`MySQL error (${err.message}), falling back to local store.`);
          isMockMode = true;
          return executeMockQuery(sql, params);
        }
      }
      throw err;
    }
  },

  async query(sql, params) {
    if (isMockMode) {
      return executeMockQuery(sql, params);
    }
    try {
      const res = await rawPool.query(sql, params);
      dbConnected = true;
      lastDbError = null;
      return res;
    } catch (err) {
      if (isConnectionError(err)) {
        dbConnected = false;
        lastDbError = `${err.code || "ERR"}: ${err.message}`;
        if (env.db.allowMockFallback) {
          console.warn(`MySQL error (${err.message}), falling back to local store.`);
          isMockMode = true;
          return executeMockQuery(sql, params);
        }
      }
      throw err;
    }
  },

  async getConnection() {
    if (isMockMode) {
      return createMockConnection();
    }
    try {
      const conn = await rawPool.getConnection();
      dbConnected = true;
      lastDbError = null;
      return conn;
    } catch (err) {
      if (isConnectionError(err)) {
        dbConnected = false;
        lastDbError = `${err.code || "ERR"}: ${err.message}`;
        if (env.db.allowMockFallback) {
          console.warn(`MySQL error (${err.message}), falling back to local connection.`);
          isMockMode = true;
          return createMockConnection();
        }
      }
      throw err;
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
