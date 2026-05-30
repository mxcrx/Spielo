require("dotenv").config();

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

module.exports = {
  port: toPositiveInteger(process.env.PORT, 3000),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  httpRateLimit: toPositiveInteger(process.env.HTTP_RATE_LIMIT_LIMIT, 100),
  socketAuthLimit: toPositiveInteger(process.env.SOCKET_AUTH_LIMIT, 15),
  socketMaxBufferSize: toPositiveInteger(
    process.env.SOCKET_MAX_BUFFER_SIZE,
    8192,
  ),
};
