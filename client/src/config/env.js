/**
 * Centralized frontend environment configuration.
 * Vite exposes only variables prefixed with VITE_.
 */
const rawApiUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

export const ENV = Object.freeze({
  API_URL: rawApiUrl || (import.meta.env.PROD ? "" : "http://localhost:5001"),
  APP_NAME: (import.meta.env.VITE_APP_NAME || "Kiara Medicals").trim(),
  APP_ENV: import.meta.env.MODE || (import.meta.env.PROD ? "production" : "development"),
  IS_PROD: Boolean(import.meta.env.PROD),
  IS_DEV: Boolean(import.meta.env.DEV),
});

export default ENV;
