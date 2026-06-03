const {
  normalizeAuthUsername,
  normalizeGuestUserId,
} = require("../utils/inputValidation");

const storedGuestNames = new Map();

function createGuestUser(socketId, existingUserId = null) {
  const sanitizedUserId = normalizeGuestUserId(existingUserId);
  const userId =
    sanitizedUserId || "guest_" + Math.random().toString(36).substr(2, 10);

  return {
    userId,

    socketId,

    username: storedGuestNames.get(userId) || "Gast",
  };
}

function getStoredGuestName(userId) {
  const sanitizedUserId = normalizeGuestUserId(userId);

  if (!sanitizedUserId) {
    return null;
  }

  return storedGuestNames.get(sanitizedUserId) || null;
}

function setStoredGuestName(userId, username) {
  const sanitizedUserId = normalizeGuestUserId(userId);

  if (!sanitizedUserId) {
    return false;
  }

  const normalizedUsername = normalizeAuthUsername(username);

  if (!normalizedUsername) {
    storedGuestNames.delete(sanitizedUserId);
    return false;
  }

  storedGuestNames.set(sanitizedUserId, normalizedUsername);
  return true;
}

function clearStoredGuestName(userId) {
  const sanitizedUserId = normalizeGuestUserId(userId);

  if (!sanitizedUserId) {
    return false;
  }

  return storedGuestNames.delete(sanitizedUserId);
}

module.exports = {
  createGuestUser,
  getStoredGuestName,
  setStoredGuestName,
  clearStoredGuestName,
};
