const pool = require("../database/db");

async function createMatchRecord({
  gameType,
  winnerId,
  startedAt,
  endedAt,
  durationSeconds,
  players,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    console.log("DB-INSERT VERSUCH MIT:", {
      gameType,
      winnerId,
      startedAt,
      endedAt,
      durationSeconds,
    });
    const [matchResult] = await connection.execute(
      `INSERT INTO matches (game_type, winner_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?, ?)`,
      [gameType, winnerId, startedAt, endedAt, durationSeconds],
    );

    const matchId = matchResult.insertId;

    const playerQueries = players.map((player) => {
      return connection.execute(
        `INSERT INTO match_players (match_id, user_id, username, placement) VALUES (?, ?, ?, ?)`,
        [matchId, player.userId || null, player.username, player.placement],
      );
    });

    await Promise.all(playerQueries);

    await connection.commit();
    return matchId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createMatchRecord,
};
