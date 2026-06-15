const pool = require("../database/db");

async function getFriendship(user1, user2) {
  const [rows] = await pool.execute(
    `SELECT * FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`,
    [user1, user2, user2, user1],
  );
  return rows[0] || null;
}

async function createRequest(requesterId, receiverId) {
  const [result] = await pool.execute(
    `INSERT INTO friends (requester_id, receiver_id, status) VALUES (?, ?, 'pending')`,
    [requesterId, receiverId],
  );
  return result.insertId;
}

async function updateStatus(requesterId, receiverId, status) {
  await pool.execute(
    `UPDATE friends SET status = ? WHERE requester_id = ? AND receiver_id = ?`,
    [status, requesterId, receiverId],
  );
}

async function deleteFriendship(user1, user2) {
  await pool.execute(
    `DELETE FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`,
    [user1, user2, user2, user1],
  );
}

async function getFriends(userId) {
  const [rows] = await pool.execute(
    `SELECT CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END as friend_id FROM friends WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'`,
    [userId, userId, userId],
  );
  return rows.map((row) => row.friend_id);
}

async function getPendingRequests(userId) {
  const [rows] = await pool.execute(
    `SELECT requester_id FROM friends WHERE receiver_id = ? AND status = 'pending'`,
    [userId],
  );
  return rows.map((row) => row.requester_id);
}

module.exports = {
  getFriendship,
  createRequest,
  updateStatus,
  deleteFriendship,
  getFriends,
  getPendingRequests,
};
