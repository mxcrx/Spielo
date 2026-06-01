const {
  createRoom,
  joinRoom,
  getRoomByUserId,
  handleDisconnect,
  leaveRoom,
  getRoom,
  startRoomGame,
  updatePlayerIdentity,
} = require("../game/roomManager");
const { processAction } = require("../game/gameEngine");
const { createGuestUser } = require("../auth/guestAuth.js");
const config = require("../config");
const {
  isAllowedColor,
  isAllowedGameActionType,
  normalizeAuthUsername,
  normalizeAuthCredentials,
  normalizeAuthToken,
  normalizeGameAction,
  normalizeRoomCode,
  isPlainObject,
} = require("../utils/inputValidation");
const { createToken, verifyToken } = require("../auth/jwtService");
const { login, createUser } = require("../auth/userService");
const { createSocketAuthLimiter } = require("../utils/rateLimit");

const MAX_EVENT_PAYLOAD_BYTES = 2048;
const checkAuthAttempt = createSocketAuthLimiter({
  limit: config.socketAuthLimit,
});

function emitInvalidInput(socket, message) {
  socket.emit("error_message", message);
}

function emitAuthRateLimit(socket) {
  socket.emit(
    "error_message",
    "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
  );
}

function restoreRoomState(io, socket) {
  const activeRoom = getRoomByUserId(socket.user.userId);

  if (!activeRoom) {
    return;
  }

  socket.user.socketId = socket.id;
  socket.join(activeRoom.id);
  joinRoom(activeRoom.id, socket.user);

  if (activeRoom.game) {
    socket.emit("game_started", {
      roomId: activeRoom.id,
      game: activeRoom.game,
    });
  } else {
    io.to(activeRoom.id).emit("room_updated", activeRoom);
  }
}

function consumeAuthAttempt(socket) {
  const result = checkAuthAttempt(socket);

  if (!result.allowed) {
    emitAuthRateLimit(socket);
    return false;
  }

  return true;
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
      socket.emit("game_started", {
        roomId: activeRoom.id,
        game: activeRoom.game,
      });
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
  socket.on("auth_with_token", (token) => {
    if (!consumeAuthAttempt(socket)) {
      return;
    }

    const normalizedToken = normalizeAuthToken(token);

    if (!normalizedToken) {
      return emitInvalidInput(socket, "Ungültige Sitzung");
    }

    const decoded = verifyToken(normalizedToken);
    if (decoded) {
      socket.user = {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
        socketId: socket.id,
      };

      socket.emit("auth_success", {
        ...socket.user,
        currentRoomId: getRoomByUserId(socket.user.userId)?.id || null,
      });
      restoreRoomState(io, socket);
    } else {
      socket.emit("auth_failed", "Sitzung abgelaufen. Bitte neu anmelden.");
    }
  });

  socket.on("set_guest_name", (name) => {
    try {
      if (typeof name !== "string" || name.trim().length === 0) {
        return socket.emit("guest_name_set", {
          userId: socket.user.userId,
          username: socket.user.username,
        });
      }

      const normalized = normalizeAuthUsername(name);
      if (!normalized) {
        return emitInvalidInput(socket, "Ungültiger Benutzername für Gast");
      }

      socket.user.username = normalized;

      socket.emit("guest_name_set", {
        userId: socket.user.userId,
        username: socket.user.username,
      });
    } catch (err) {
      socket.emit("error_message", "Serverfehler beim Setzen des Gastnamens");
    }
  });

  socket.on("login", async (credentials) => {
    if (!consumeAuthAttempt(socket)) {
      return;
    }

    try {
      const previousUserId = socket.user.userId;
      const normalizedCredentials = normalizeAuthCredentials(credentials, {
        maxBytes: MAX_EVENT_PAYLOAD_BYTES,
      });

      if (normalizedCredentials?.error) {
        return socket.emit("error_message", normalizedCredentials.error);
      }

      const user = await login(
        normalizedCredentials.username,
        normalizedCredentials.password,
      );
      if (user) {
        const token = createToken(user);
        socket.user = {
          userId: user.id.toString(),
          username: user.username,
          role: user.role,
          socketId: socket.id,
        };

        updatePlayerIdentity(previousUserId, {
          ...socket.user,
          socketId: socket.id,
        });

        socket.emit("login_success", {
          user: socket.user,
          token,
          currentRoomId: getRoomByUserId(socket.user.userId)?.id || null,
        });

        restoreRoomState(io, socket);
      } else {
        socket.emit("error_message", "Falscher Benutzername oder Passwort.");
      }
    } catch (error) {
      socket.emit(
        "error_message",
        "Ein serverseitiger Fehler ist aufgetreten.",
      );
    }
  });

  socket.on("register", async (credentials) => {
    if (!consumeAuthAttempt(socket)) {
      return;
    }

    try {
      const previousUserId = socket.user.userId;
      const normalizedCredentials = normalizeAuthCredentials(credentials, {
        maxBytes: MAX_EVENT_PAYLOAD_BYTES,
      });

      if (normalizedCredentials?.error) {
        return socket.emit("error_message", normalizedCredentials.error);
      }

      const newUser = await createUser(
        normalizedCredentials.username,
        normalizedCredentials.password,
      );
      const token = createToken(newUser);

      socket.user = {
        userId: newUser.id.toString(),
        username: newUser.username,
        role: newUser.role,
        socketId: socket.id,
      };

      updatePlayerIdentity(previousUserId, {
        ...socket.user,
        socketId: socket.id,
      });

      socket.emit("login_success", {
        user: socket.user,
        token,
        currentRoomId: getRoomByUserId(socket.user.userId)?.id || null,
      });

      restoreRoomState(io, socket);
    } catch (error) {
      socket.emit(
        "error_message",
        error.message || "Fehler bei der Registrierung.",
      );
    }
  });

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
    io.to(sanitizedRoomId).emit("game_started", {
      roomId: sanitizedRoomId,
      game,
    });
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
      }, config.maxIdleTime);
    }
  });
}

module.exports = { registerSocket };
