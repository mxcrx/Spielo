const { normalizeGuestUserId } = require("../utils/inputValidation");

function createGuestUser(socketId, existingUserId = null) {
  const sanitizedUserId = normalizeGuestUserId(existingUserId);

  return {
    userId:
      sanitizedUserId || "guest_" + Math.random().toString(36).substr(2, 10),

    socketId,

    username: "Gast",
  };
}

module.exports = {
  createGuestUser,
};
