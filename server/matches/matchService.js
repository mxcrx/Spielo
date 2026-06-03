const matchRepository = require("./matchRepository");

async function saveMatch(game) {
  try {
    const startedAt = new Date(game.startedAt);
    const endedAt = new Date();

    const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

    let winnerId = game.winnerId || null;

    if (winnerId && isNaN(Number(winnerId))) {
      winnerId = null;
    }

    const players = (game.players || []).map((p) => {
      let pUserId = p.userId || null;

      if (pUserId && isNaN(Number(pUserId))) {
        pUserId = null;
      }
      return {
        userId: pUserId,
        username: p.username,
        placement: p.placement || (p.userId === winnerId ? 1 : 2),
      };
    });

    const matchData = {
      gameType: game.gameType,
      winnerId: winnerId,
      startedAt,
      endedAt,
      durationSeconds,
      players,
    };

    const matchId = await matchRepository.createMatchRecord(matchData);
    console.log(
      `[Match History] Match #${matchId} (${matchData.gameType}) erfolgreich gespeichert.`,
    );
    return matchId;
  } catch (error) {
    console.error("[Match History] Fehler beim Speichern des Matches:", error);
  }
}

module.exports = {
  saveMatch,
};
