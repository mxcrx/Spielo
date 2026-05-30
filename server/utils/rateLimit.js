const { rateLimit } = require("express-rate-limit");

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function createHttpRateLimiter({ limit = 100 } = {}) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests. Please try again later.",
    },
  });
}

function createSocketAuthLimiter({ limit = 15 } = {}) {
  const attempts = new Map();

  return function socketAuthLimiter(socket) {
    const key =
      socket.handshake.address ||
      socket.conn?.remoteAddress ||
      socket.request?.socket?.remoteAddress ||
      socket.id;

    const now = Date.now();
    const current = attempts.get(key);

    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + FIFTEEN_MINUTES });
      return { allowed: true };
    }

    if (current.count >= limit) {
      return {
        allowed: false,
        retryAfterMs: current.resetAt - now,
      };
    }

    current.count += 1;
    attempts.set(key, current);

    return { allowed: true };
  };
}

module.exports = {
  FIFTEEN_MINUTES,
  createHttpRateLimiter,
  createSocketAuthLimiter,
};
