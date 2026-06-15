const friendsRepository = require("./friendsRepository");
const { getProfile } = require("../profile/profileService");
const pool = require("../database/db");

async function sendFriendRequest(requesterId, targetUsername) {
  const [users] = await pool.execute(
    `SELECT id FROM users WHERE LOWER(username) = LOWER(?)`,
    [targetUsername],
  );
  const receiver = users[0];

  if (!receiver) {
    throw new Error("Benutzer nicht gefunden");
  }

  const receiverId = receiver.id;
  if (Number(requesterId) === Number(receiverId)) {
    throw new Error("Du kannst dir selbst keine Freundschaftsanfrage senden");
  }

  const existing = await friendsRepository.getFriendship(
    requesterId,
    receiverId,
  );
  if (existing) {
    if (existing.status === "accepted")
      throw new Error("Ihr seid bereits befreundet");
    if (existing.status === "pending") {
      if (Number(existing.requester_id) === Number(requesterId)) {
        throw new Error("Du hast bereits eine Freundschaftsanfrage gesendet");
      } else {
        throw new Error(
          "Du hast bereits eine Freundschaftsanfrage von diesem Benutzer erhalten",
        );
      }
    }
    if (existing.status === "blocked")
      throw new Error(
        "Du kannst diesem Benutzer keine Freundschaftsanfrage senden",
      );
  }

  await friendsRepository.createRequest(requesterId, receiverId);
  return receiverId;
}

async function acceptFriendRequest(receiverId, requesterId) {
  const friendship = await friendsRepository.getFriendship(
    requesterId,
    receiverId,
  );
  if (
    !friendship ||
    friendship.status !== "pending" ||
    Number(friendship.receiver_id) !== Number(receiverId)
  ) {
    throw new Error("Keine offene Freundschaftsanfrage gefunden");
  }
  await friendsRepository.updateStatus(requesterId, receiverId, "accepted");
}

async function declineFriendRequest(receiverId, requesterId) {
  const friendship = await friendsRepository.getFriendship(
    requesterId,
    receiverId,
  );
  if (
    !friendship ||
    friendship.status !== "pending" ||
    Number(friendship.receiver_id) !== Number(receiverId)
  ) {
    throw new Error("Keine offene Freundschaftsanfrage gefunden");
  }
  await friendsRepository.deleteFriendship(requesterId, receiverId);
}

async function removeFriend(userId, friendId) {
  const friendship = await friendsRepository.getFriendship(userId, friendId);
  if (!friendship || friendship.status !== "accepted") {
    throw new Error("Ihr seid nicht befreundet");
  }
  await friendsRepository.deleteFriendship(userId, friendId);
}

async function getFriendsListData(userId, io) {
  const friendsIds = await friendsRepository.getFriends(userId);
  const requestsIds = await friendsRepository.getPendingRequests(userId);

  const activeSockets = Array.from(io.sockets.sockets.values());

  const friends = await Promise.all(
    friendsIds.map(async (friendId) => {
      const profile = await getProfile(friendId);

      const isOnline = activeSockets.some(
        (socket) =>
          socket.user &&
          socket.user.userId &&
          Number(socket.user.userId) === Number(friendId),
      );

      let name = profile?.displayName;
      if (!name) {
        const [users] = await pool.execute(
          `SELECT username FROM users WHERE id = ?`,
          [friendId],
        );
        name = users[0]?.username || "Unbekannt";
      }

      return {
        userId: friendId.toString(),
        username: name,
        displayName: name,
        avatarUrl: profile?.avatarUrl || "",
        isOnline,
      };
    }),
  );

  const requests = await Promise.all(
    requestsIds.map(async (requesterId) => {
      const profile = await getProfile(requesterId);

      let name = profile?.displayName;
      if (!name) {
        const [userRows] = await pool.execute(
          `SELECT username FROM users WHERE id = ?`,
          [requesterId],
        );
        name = userRows[0]?.username || "Unbekannt";
      }

      return {
        userId: requesterId.toString(),
        username: name,
        displayName: name,
        avatarUrl: profile?.avatarUrl || "",
      };
    }),
  );

  return { friends, requests };
}

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  getFriendsListData,
};
