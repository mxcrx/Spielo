const {
  createRoom,
  joinRoom,
  getRoomByUserId,
  handleDisconnect,
  leaveRoom,
  getRoom,
  startRoomGame,
} = require("../game/roomManager");
const { processAction } = require("../game/gameEngine");
const { createGuestUser } = require("../auth/guestAuth.js");
const {
  isAllowedColor,
  isAllowedGameActionType,
  normalizeGameAction,
  normalizeRoomCode,
  isPlainObject,
} = require("../utils/inputValidation");

const MAX_EVENT_PAYLOAD_BYTES = 2048;

function emitInvalidInput(socket, message) {
  socket.emit("error_message", message);
}

function registerSocket(io, socket) {
  const existingUserId = socket.handshake.auth?.userId;
  socket.user = createGuestUser(socket.id, existingUserId);

  const activeRoom = getRoomByUserId(socket.user.userId);

  if (activeRoom) {
    socket.join(activeRoom.id);

    joinRoom(activeRoom.id, socket.user);

    socket.emit("session_ready", {
      userId: socket.user.userId,
      username: socket.user.username,
      socketId: socket.id,
      currentRoomId: activeRoom.id,
    });

    if (activeRoom.game) {
      socket.emit("game_started", activeRoom.game);
    } else {
      io.to(activeRoom.id).emit("room_updated", activeRoom);
    }
  } else {
    socket.emit("session_ready", {
      userId: socket.user.userId,
      username: socket.user.username,
      socketId: socket.id,
    });
  }

  socket.on("create_room", () => {
    if (socket.user.userId.length > 64) {
      return emitInvalidInput(socket, "Ungültige Sitzung");
    }

    const id = createRoom(socket.user);
    socket.join(id);

    const room = getRoom(id);

    socket.emit("room_created", { roomId: id, room: room });
  });

  socket.on("join_room", (id) => {
    const roomCode = normalizeRoomCode(id);

    if (!roomCode) {
      return emitInvalidInput(socket, "Ungültiger Raumcode");
    }

    const res = joinRoom(roomCode, socket.user);
    if (!res.success) return socket.emit("error_message", res.message);

    socket.join(roomCode);
    io.to(roomCode).emit("room_updated", res.room);
  });

  socket.on("leave_room", (roomId) => {
    const sanitizedRoomId = normalizeRoomCode(roomId);

    if (!sanitizedRoomId) {
      return emitInvalidInput(socket, "Ungültiger Raumcode");
    }

    const res = leaveRoom(socket.user.userId);

    if (!res.success) return;

    socket.leave(sanitizedRoomId);

    if (!res.roomDeleted) {
      io.to(res.roomId).emit("room_updated", res.room);

      if (res.gameAborted) {
        io.to(res.roomId).emit("game_aborted", {
          message: `${res.leftPlayerName} hat den Raum verlassen. Das Spiel wurde abgebrochen.`,
        });
      }
    }
  });

  socket.on("start_game", (roomId) => {
    const sanitizedRoomId = normalizeRoomCode(roomId);

    if (!sanitizedRoomId) {
      return emitInvalidInput(socket, "Ungültiger Raumcode");
    }

    const game = startRoomGame(sanitizedRoomId);
    io.to(sanitizedRoomId).emit("game_started", game);
  });

  socket.on("game_action", (data) => {
    if (!isPlainObject(data)) {
      return emitInvalidInput(socket, "Ungültige Spielaktion");
    }

    const { roomId, action } = data;

    if (!isPlainObject(action) || !isAllowedGameActionType(action.type)) {
      return emitInvalidInput(socket, "Ungültige Spielaktion");
    }

    const sanitizedRoomId = normalizeRoomCode(roomId);
    if (!sanitizedRoomId) {
      return emitInvalidInput(socket, "Ungültiger Raumcode");
    }

    const normalizedAction = normalizeGameAction(action, {
      maxBytes: MAX_EVENT_PAYLOAD_BYTES,
    });

    if (!normalizedAction) {
      return emitInvalidInput(socket, "Ungültige Spielaktion");
    }

    if (normalizedAction.playerId !== socket.user.userId) {
      return emitInvalidInput(socket, "Ungültige Sitzung");
    }

    if (
      normalizedAction.type === "CHOOSE_COLOR" &&
      !isAllowedColor(normalizedAction.payload.color)
    ) {
      return emitInvalidInput(socket, "Ungültige Farbe");
    }

    const room = getRoom(sanitizedRoomId);
    if (!room?.game) return;

    if (
      room.game.players[room.game.currentPlayerIndex]?.userId !==
      normalizedAction.playerId
    ) {
      return emitInvalidInput(socket, "Nicht dein Zug");
    }

    const result = processAction(room.game, normalizedAction);

    if (result.error) {
      socket.emit("error_message", result.error);
      return;
    }

    room.game = result.game;

    if (result.chooseColor) {
      socket.emit("choose_color", {
        reason: result.chooseColorReason,
      });
    }

    if (result.gameUpdated) {
      io.to(sanitizedRoomId).emit("game_updated", {
        game: room.game,
        lastDraw: result.lastDraw,
        lastPlayed: result.lastPlayed,
        currentPlayer:
          result.currentPlayer ||
          room.game.players[room.game.currentPlayerIndex].userId,
      });
    }

    if (result.gameOver) {
      io.to(sanitizedRoomId).emit("game_over", {
        winner: result.winner || "unknown",
      });

      room.game = null;

      setTimeout(() => {
        io.to(sanitizedRoomId).emit("room_updated", room);
      }, 4500);
    }
  });

  socket.on("disconnect", () => {
    const disconnectRes = handleDisconnect(socket.user.userId, socket.id);

    if (disconnectRes.success) {
      if (!disconnectRes.roomDeleted && !disconnectRes.room.game) {
        io.to(disconnectRes.roomId).emit("room_updated", disconnectRes.room);
      }

      setTimeout(() => {
        const checkRoom = getRoom(disconnectRes.roomId);
        const player = checkRoom?.players.find(
          (p) => p.userId === socket.user.userId,
        );

        if (player && !player.connected) {
          const res = leaveRoom(socket.user.userId);

          if (res.success && !res.roomDeleted) {
            io.to(res.roomId).emit("room_updated", res.room);

            if (res.gameAborted) {
              io.to(res.roomId).emit("game_aborted", {
                message: `${res.leftPlayerName} hat das Spiel verlassen. Das Spiel wurde abgebrochen.`,
              });
            }
          }
        }
      }, 15000);
    }
  });
}

module.exports = { registerSocket };
