function createGuestUser(socketId, existingUserId = null) {
    return {
        userId: existingUserId || ("guest_" + Math.random().toString(36).substr(2, 10)),

        socketId,

        username: "Gast"
    };
}

module.exports = {
    createGuestUser
};