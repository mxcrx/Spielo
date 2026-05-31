const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const GUEST_USER_ID_PATTERN = /^guest_[a-z0-9]{10}$/;
const AUTH_USERNAME_PATTERN = /^[\p{L}\p{N}._-]{3,32}$/u;
const GAME_COLORS = new Set(["red", "green", "blue", "yellow"]);
const GAME_ACTION_TYPES = new Set([
  "PLAY_CARD",
  "DRAW_CARD",
  "END_TURN",
  "CHOOSE_COLOR",
  "CHALLENGE_UNO",
  "CALL_UNO",
]);

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function estimatePayloadSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isPayloadWithinLimit(value, maxBytes) {
  return estimatePayloadSize(value) <= maxBytes;
}

function normalizeRoomCode(roomCode) {
  if (typeof roomCode !== "string") {
    return null;
  }

  const normalized = roomCode.trim().toUpperCase();

  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

function normalizeGuestUserId(userId) {
  if (typeof userId !== "string") {
    return null;
  }

  const normalized = userId.trim();

  return GUEST_USER_ID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeAuthUsername(username) {
  if (typeof username !== "string") {
    return null;
  }

  const normalized = username.trim();

  return AUTH_USERNAME_PATTERN.test(normalized) ? normalized : null;
}

function normalizeAuthPassword(password) {
  if (typeof password !== "string") {
    return null;
  }

  if (password.length < 6 || password.length > 128) {
    return null;
  }

  return password;
}

function normalizeAuthToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const normalized = token.trim();

  return normalized.length > 0 && normalized.length <= 4096 ? normalized : null;
}

function normalizeAuthCredentials(credentials, { maxBytes = 2048 } = {}) {
  if (
    !isPlainObject(credentials) ||
    !isPayloadWithinLimit(credentials, maxBytes)
  ) {
    return null;
  }

  const username = normalizeAuthUsername(credentials.username);
  const password = normalizeAuthPassword(credentials.password);

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

function parseStrictInteger(value) {
  if (Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  return null;
}

function isAllowedGameActionType(type) {
  return typeof type === "string" && GAME_ACTION_TYPES.has(type);
}

function normalizeGameAction(action, { maxBytes = 2048 } = {}) {
  if (!isPlainObject(action) || !isPayloadWithinLimit(action, maxBytes)) {
    return null;
  }

  if (!isAllowedGameActionType(action.type)) {
    return null;
  }

  const normalized = {
    type: action.type,
    playerId:
      typeof action.playerId === "string" ? action.playerId.trim() : null,
    payload: {},
  };

  if (action.payload !== undefined) {
    if (
      !isPlainObject(action.payload) ||
      !isPayloadWithinLimit(action.payload, maxBytes)
    ) {
      return null;
    }

    normalized.payload = { ...action.payload };
  }

  if (!normalized.playerId) {
    return null;
  }

  if (normalized.type === "PLAY_CARD") {
    if (!isPlainObject(normalized.payload)) {
      return null;
    }

    const cardIndex = parseStrictInteger(normalized.payload.cardIndex);

    if (cardIndex === null || cardIndex < 0) {
      return null;
    }

    const nextPayload = { cardIndex };

    if (normalized.payload.chosenColor !== undefined) {
      if (!GAME_COLORS.has(normalized.payload.chosenColor)) {
        return null;
      }

      nextPayload.chosenColor = normalized.payload.chosenColor;
    }

    normalized.payload = nextPayload;
  }

  if (normalized.type === "CHOOSE_COLOR") {
    if (!GAME_COLORS.has(normalized.payload.color)) {
      return null;
    }
  }

  if (normalized.type === "CALL_UNO" || normalized.type === "CHALLENGE_UNO") {
    normalized.payload = {};
  }

  return normalized;
}

function isAllowedColor(color) {
  return typeof color === "string" && GAME_COLORS.has(color);
}

module.exports = {
  GAME_COLORS,
  GAME_ACTION_TYPES,
  estimatePayloadSize,
  normalizeAuthCredentials,
  normalizeAuthPassword,
  normalizeAuthToken,
  normalizeAuthUsername,
  isAllowedColor,
  isAllowedGameActionType,
  isPayloadWithinLimit,
  isPlainObject,
  normalizeGameAction,
  normalizeGuestUserId,
  normalizeRoomCode,
};
