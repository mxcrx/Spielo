const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const GUEST_USER_ID_PATTERN = /^guest_[a-z0-9]{10}$/;
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

    const cardIndex = Number.parseInt(normalized.payload.cardIndex, 10);

    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
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
  isAllowedColor,
  isAllowedGameActionType,
  isPayloadWithinLimit,
  isPlainObject,
  normalizeGameAction,
  normalizeGuestUserId,
  normalizeRoomCode,
};
