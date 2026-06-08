const pool = require("../database/db");

function formatPlaytime(totalSeconds) {
  const safeSeconds = Number(totalSeconds) || 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} Min`;
  }

  if (minutes === 0) {
    return `${hours} Std`;
  }

  return `${hours} Std ${minutes} Min`;
}

async function getUserProfileData(userId) {
  const [userRows] = await pool.execute(
    `SELECT u.id, u.username, u.created_at, p.display_name, p.avatar_url, p.bio FROM users u LEFT JOIN profiles p ON u.id = p.user_id WHERE u.id = ?`,
    [userId],
  );

  if (userRows.length === 0) return null;
  const user = userRows[0];

  const [gameCountRows] = await pool.execute(
    `SELECT COUNT(*) as totalGames FROM match_players WHERE user_id = ?`,
    [userId],
  );

  const [winCountRows] = await pool.execute(
    `SELECT COUNT(*) as totalWins FROM match_players WHERE user_id = ? AND placement = 1`,
    [userId],
  );

  const [playtimeRows] = await pool.execute(
    `SELECT COALESCE(SUM(m.duration_seconds), 0) AS totalPlaytimeSeconds FROM matches m INNER JOIN match_players mp ON m.id = mp.match_id WHERE mp.user_id = ?`,
    [userId],
  );

  const totalPlaytimeSeconds = Number(
    playtimeRows[0]?.totalPlaytimeSeconds || 0,
  );

  return {
    userId: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    bio: user.bio || "",
    avatarUrl: user.avatar_url || "",
    memberSince: user.created_at,
    totalGames: gameCountRows[0].totalGames,
    totalWins: winCountRows[0].totalWins,
    totalPlaytime: formatPlaytime(totalPlaytimeSeconds),
    totalPlaytimeSeconds,
  };
}

async function updateUserProfile(userId, displayName, bio, avatarUrl) {
  await pool.execute(
    `INSERT INTO profiles (user_id, display_name, bio, avatar_url) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), bio = VALUES(bio), avatar_url = VALUES(avatar_url)`,
    [userId, displayName, bio, avatarUrl],
  );

  return { displayName, bio, avatarUrl };
}

module.exports = {
  getUserProfileData,
  updateUserProfile,
};
