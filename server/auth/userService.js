const bcrypt = require("bcrypt");
const pool = require("../database/db");

async function createUser(username, password) {
  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
      [username, passwordHash],
    );

    const userId = result.insertId;

    await pool.execute(
      `INSERT INTO profiles (user_id, display_name) VALUES (?, ?)`,
      [userId, username],
    );
    return { id: result.insertId, username, role: "user" };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      throw new Error("Dieser Benutzername ist bereits vergeben,");
    }
    throw err;
  }
}

async function login(username, password) {
  const [rows] = await pool.execute(`SELECT * FROM users WHERE username = ?`, [
    username,
  ]);

  if (rows.length === 0) {
    return null;
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);

  if (valid) {
    return { id: user.id, username: user.username, role: user.role };
  }
  return null;
}

async function updateUser(userId, newRole, isBanned) {
  try {
    await pool.execute(
      `UPDATE users SET role = ?, is_banned = ? WHERE id = ?`,
      [newRole, isBanned ? 1 : 0, userId],
    );
  } catch (err) {
    throw err;
  }
}

async function getAllUsers() {
  try {
    const [users] = await pool.execute(
      `SELECT id, username, role, is_banned, created_at FROM users ORDER BY created_at ASC`,
    );
    return users;
  } catch (err) {
    throw err;
  }
}

module.exports = {
  createUser,
  login,
  updateUser,
  getAllUsers,
};
