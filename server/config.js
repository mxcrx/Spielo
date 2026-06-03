require("dotenv").config();

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function requireEnv(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

module.exports = {
  port: toPositiveInteger(process.env.PORT, 3000),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  httpRateLimit: toPositiveInteger(process.env.HTTP_RATE_LIMIT_LIMIT, 100),
  socketAuthLimit: toPositiveInteger(process.env.SOCKET_AUTH_LIMIT, 5),
  socketMaxBufferSize: toPositiveInteger(
    process.env.SOCKET_MAX_BUFFER_SIZE,
    8192,
  ),
  reconnectGraceTimeMs: toPositiveInteger(
    process.env.RECONNECT_GRACE_TIME_MS,
    15000,
  ),
  dbHost: process.env.DB_HOST || "localhost",
  dbPort: toPositiveInteger(process.env.DB_PORT, 3306),
  dbUser: requireEnv("DB_USER"),
  dbPassword: requireEnv("DB_PASSWORD"),
  dbName: requireEnv("DB_NAME"),
  jwtSecret: requireEnv("JWT_SECRET"),
};
