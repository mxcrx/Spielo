const rooms = {};
const { createUnoGame, startGame } = require("./unoGame");

const MAX_PLAYERS_MIN = 1;
const MAX_PLAYERS_MAX = 10;
const START_CARDS_MIN = 3;
const START_CARDS_MAX = 12;
const ALLOWED_TIMERS = new Set([0, 15, 30, 60]);
const ALLOWED_DECKS = new Set([1, 2, 3]);

function createRoom(hostUser) {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

  rooms[roomId] = {
    id: roomId,
    host: hostUser.userId,
    settings: {
      drawStacking: true,
      wildOnWild: false,
      jumpIn: false,
      sevenZero: false,
      forcePlay: false,
      maxPlayers: 10,
      startCards: 7,
      timer: 0,
      decks: 1,
    },
    players: [
      {
        userId: hostUser.userId,
        socketId: hostUser.socketId,
        username: hostUser.username,
        connected: true,
      },
    ],
    game: null,
  };

  return roomId;
}

function joinRoom(roomId, user) {
  const room = rooms[roomId];
  if (!room) return { success: false, message: "Raum existiert nicht" };

  const existingPlayer = room.players.find(
    (player) => player.userId === user.userId,
  );

  if (existingPlayer) {
    existingPlayer.socketId = user.socketId;
    existingPlayer.username = user.username || existingPlayer.username;
    existingPlayer.connected = true;
  } else {
    if (room.players.length >= room.settings.maxPlayers) {
      return { success: false, message: "Der Raum ist bereits voll." };
    }

    room.players.push({
      userId: user.userId,
      socketId: user.socketId,
      username: user.username || `Spieler ${room.players.length + 1}`,
      connected: true,
    });
  }

  return { success: true, room };
}

function updatePlayerIdentity(oldUserId, nextUser) {
  if (!oldUserId || !nextUser?.userId || oldUserId === nextUser.userId) {
    return { success: false };
  }

  const room = getRoomByUserId(oldUserId);
  if (!room) return { success: false };

  const player = room.players.find((p) => p.userId === oldUserId);
  if (!player) return { success: false };

  if (room.host === oldUserId) {
    room.host = nextUser.userId;
  }

  if (room.game) {
    if (room.game.hands[oldUserId]) {
      room.game.hands[nextUser.userId] = room.game.hands[oldUserId];
      delete room.game.hands[oldUserId];
    }

    if (room.game.unoDeclared[oldUserId] !== undefined) {
      room.game.unoDeclared[nextUser.userId] = room.game.unoDeclared[oldUserId];
      delete room.game.unoDeclared[oldUserId];
    }
  }

  player.userId = nextUser.userId;
  player.socketId = nextUser.socketId;
  player.username = nextUser.username || player.username;
  player.connected = true;

  return { success: true, room };
}

function getRoomByUserId(userId) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.players.some((player) => player.userId === userId)) {
      return room;
    }
  }
  return null;
}

function handleDisconnect(userId, socketId) {
  const room = getRoomByUserId(userId);
  if (!room) return { success: false };

  const player = room.players.find((p) => p.userId === userId);
  if (player && (!socketId || player.socketId === socketId)) {
    player.connected = false;

    return { success: true, roomId: room.id, room };
  }

  return { success: false, staleDisconnect: true, roomId: room.id, room };
}

function leaveRoom(userId) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const playerIndex = room.players.findIndex(
      (player) => player.userId === userId,
    );

    if (playerIndex !== -1) {
      const [removed] = room.players.splice(playerIndex, 1);
      const leftPlayerName = removed?.username || "unknown";

      let gameAborted = false;

      if (room.players.length === 0) {
        delete rooms[roomId];
        return {
          success: true,
          roomId,
          roomDeleted: true,
          leftPlayerName,
          gameAborted: true,
        };
      }

      if (room.host === userId) {
        room.host = room.players[0]?.userId;
      }

      if (room.game) {
        room.game = null;
        gameAborted = true;
      }

      return {
        success: true,
        roomId,
        roomDeleted: false,
        room,
        leftPlayerName,
        gameAborted,
      };
    }
  }

  return { success: false };
}

function getRoom(roomId) {
  return rooms[roomId];
}

function startRoomGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.game = startGame(createUnoGame(room.players, room.settings));
  return room.game;
}

function normalizeRoomSettings(room, newSettings) {
  if (!room) return { success: false, message: "Raum existiert nicht" };

  if (room.game) return { success: false, message: "Spiel läuft bereits" };

  if (
    !newSettings ||
    typeof newSettings !== "object" ||
    Array.isArray(newSettings)
  )
    return { success: false, message: "Ungültige Einstellungen" };

  const maxPlayers = Number(newSettings.maxPlayers);
  const startCards = Number(newSettings.startCards);
  const timer = Number(newSettings.timer);
  const decks = Number(newSettings.decks);

  if (
    !Number.isInteger(maxPlayers) ||
    maxPlayers < MAX_PLAYERS_MIN ||
    maxPlayers > MAX_PLAYERS_MAX
  ) {
    return { success: false, message: "Ungültige Spieleranzahl" };
  }

  if (maxPlayers < room.players.length) {
    return {
      success: false,
      message:
        "Maximale Spieleranzahl darf nicht unter der aktuellen Spieleranzahl sein",
    };
  }

  if (
    !Number.isInteger(startCards) ||
    startCards < START_CARDS_MIN ||
    startCards > START_CARDS_MAX
  ) {
    return { success: false, message: "Ungültige Startkartenanzahl" };
  }

  if (!ALLOWED_TIMERS.has(timer)) {
    return { success: false, message: "Ungültiger Timerwert" };
  }

  if (!ALLOWED_DECKS.has(decks)) {
    return { success: false, message: "Ungültige Deckanzahl" };
  }

  if (
    typeof newSettings.drawStacking !== "boolean" ||
    typeof newSettings.wildOnWild !== "boolean" ||
    typeof newSettings.jumpIn !== "boolean" ||
    typeof newSettings.sevenZero !== "boolean" ||
    typeof newSettings.forcePlay !== "boolean"
  ) {
    return { success: false, message: "Ungültige Spielregeln" };
  }

  room.settings = {
    drawStacking: newSettings.drawStacking,
    wildOnWild: newSettings.wildOnWild,
    jumpIn: newSettings.jumpIn,
    sevenZero: newSettings.sevenZero,
    forcePlay: newSettings.forcePlay,
    maxPlayers,
    startCards,
    timer,
    decks,
  };

  return { success: true, room };
}

function updateRoomSettings(roomId, userId, newSettings) {
  const room = rooms[roomId];
  if (!room || room.host !== userId) return { success: false };

  return normalizeRoomSettings(room, newSettings);
}

module.exports = {
  createRoom,
  joinRoom,
  updatePlayerIdentity,
  getRoomByUserId,
  handleDisconnect,
  leaveRoom,
  getRoom,
  startRoomGame,
  updateRoomSettings,
};
