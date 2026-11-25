const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load server/.env.<NODE_ENV> (e.g. server/.env.production) first if present,
// then fall back to server/.env, without overriding host/container env vars.
const initialNodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();
const envModePath = path.resolve(__dirname, `../.env.${initialNodeEnv}`);
const envDefaultPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(envModePath)) {
  dotenv.config({ path: envModePath });
}
if (fs.existsSync(envDefaultPath)) {
  dotenv.config({ path: envDefaultPath });
}

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function toInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseCorsOrigins(rawValue) {
  if (!rawValue || rawValue.trim() === "" || rawValue.trim() === "*") {
    return "*";
  }
  const origins = rawValue
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();
const isProd = nodeEnv === "production";
const dbHost = (process.env.DB_HOST || "127.0.0.1").trim();

const env = Object.freeze({
  nodeEnv,
  isProd,
  isDev: !isProd,
  port: toInt(process.env.PORT, isProd ? 5000 : 5001),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN || process.env.CORS_ORIGINS),

  db: Object.freeze({
    host: dbHost,
    port: toInt(process.env.DB_PORT, 3306),
    user: (process.env.DB_USER || "root").trim(),
    password: process.env.DB_PASSWORD || "",
    name: (process.env.DB_NAME || "kiara_medicals").trim(),
    ssl: toBool(process.env.DB_SSL, /aivencloud\.com/i.test(dbHost)),
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
    connectTimeout: toInt(process.env.DB_CONNECT_TIMEOUT_MS, isProd ? 15000 : 3000),
    useMock: toBool(process.env.DB_USE_MOCK, false),
    allowMockFallback: toBool(process.env.DB_ALLOW_MOCK_FALLBACK, !isProd),
  }),

  jwt: Object.freeze({
    secret: process.env.JWT_SECRET || "",
    expiresIn: (process.env.JWT_EXPIRES_IN || "8h").trim(),
  }),
});

function validateEnv() {
  const warnings = [];
  const errors = [];

  if (!env.jwt.secret) {
    errors.push("JWT_SECRET is missing. Set JWT_SECRET in server/.env or environment.");
  } else if (
    env.isProd &&
    (/change_this|change_me|default|secret/i.test(env.jwt.secret) || env.jwt.secret.length < 24)
  ) {
    warnings.push("JWT_SECRET is weak or uses a placeholder value. Rotate it before public deployment.");
  }

  if (!env.db.useMock && (!process.env.DB_HOST || !process.env.DB_NAME)) {
    warnings.push("DB_HOST or DB_NAME not explicitly set; using fallback defaults.");
  }

  if (env.isProd && env.corsOrigins === "*") {
    warnings.push("CORS_ORIGIN is set to '*'. Restrict CORS_ORIGIN in production if frontend is on a separate domain.");
  }

  for (const w of warnings) {
    console.warn(`[ENV WARNING] ${w}`);
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[ENV ERROR] ${e}`);
    }
    throw new Error(`Environment validation failed: ${errors.join(" ")}`);
  }

  console.log(
    `[ENV] mode=${env.nodeEnv} port=${env.port} db=${env.db.useMock ? "mock" : `${env.db.host}:${env.db.port}/${env.db.name}`} ssl=${env.db.ssl}`
  );
}

module.exports = { env, validateEnv };
