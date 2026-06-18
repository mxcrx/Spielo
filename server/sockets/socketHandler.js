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
const {
  createGuestUser,
  setStoredGuestName,
  clearStoredGuestName,
} = require("../auth/guestAuth.js");
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
const { getProfile, updateProfile } = require("../profile/profileService");
const {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  getFriendsListData,
} = require("../friends/friendsService");
const {
  createSocketAuthLimiter,
  createChatRateLimiter,
} = require("../utils/rateLimit");

const MAX_EVENT_PAYLOAD_BYTES = 2048;
const checkAuthAttempt = createSocketAuthLimiter({
  limit: config.socketAuthLimit,
});
const checkChatSpam = createChatRateLimiter({ limit: 5, windowMs: 10000 });

function emitInvalidInput(socket, message) {
  socket.emit("error_message", message);
}

function emitAuthRateLimit(socket) {
  socket.emit(
    "error_message",
    "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
  );
}

async function notifyFriendsStatusChange(io, userId) {
  if (!userId || isNaN(Number(userId))) return;

  try {
    const data = await getFriendsListData(userId, io);
    const friendIds = data.friends.map((friend) => Number(friend.userId));

    const activeSockets = Array.from(io.sockets.sockets.values());
    for (const socket of activeSockets) {
      if (
        socket.user &&
        socket.user.userId &&
        !isNaN(Number(socket.user.userId))
      ) {
        if (friendIds.includes(Number(socket.user.userId))) {
          const friendData = await getFriendsListData(socket.user.userId, io);
          socket.emit("friends_data", friendData);
        }
      }
    }
  } catch (err) {
    console.error("Fehler in notifyFriendsStatusChange:", err);
  }
}

async function sendDirectFriendsUpdate(io, userId) {
  if (!userId) return;

  const targetSockets = Array.from(io.sockets.sockets.values()).filter(
    (socket) => socket.user && Number(socket.user.userId) === Number(userId),
  );

  if (targetSockets.length > 0) {
    const data = await getFriendsListData(userId, io);
    for (const targetSocket of targetSockets) {
      targetSocket.emit("friends_data", data);
    }
  }
}
function broadcastChatMessage(io, roomId, messageObj) {
  const room = getRoom(roomId);
  if (!room) return;

  if (!room.chatHistory) room.chatHistory = [];
  room.chatHistory.push(messageObj);

  if (room.chatHistory.length > 50) room.chatHistory.shift();

  io.to(roomId).emit("chat_message", messageObj);
}

async function enrichPlayersWithDisplayNames(players = []) {
  return Promise.all(
    players.map(async (player) => {
      const profile = player?.userId ? await getProfile(player.userId) : null;

      return {
        ...player,
        displayName:
          profile?.displayName || player.displayName || player.username,
        avatarUrl: profile?.avatarUrl || player.avatarUrl || "",
      };
    }),
  );
}

async function enrichRoomPayload(room) {
  if (!room) {
    return room;
  }

  return {
    ...room,
    players: await enrichPlayersWithDisplayNames(room.players),
    game: room.game
      ? {
          ...room.game,
          players: await enrichPlayersWithDisplayNames(room.game.players),
        }
      : null,
  };
}

async function restoreRoomState(io, socket) {
  const activeRoom = getRoomByUserId(socket.user.userId);

  if (!activeRoom) {
    return;
  }

  socket.user.socketId = socket.id;
  socket.join(activeRoom.id);
  joinRoom(activeRoom.id, socket.user);

  socket.emit("chat_history", getRoom(activeRoom.id).chatHistory || []);

  if (activeRoom.game) {
    const enrichedGame = {
      ...activeRoom.game,
      players: await enrichPlayersWithDisplayNames(activeRoom.game.players),
    };

    socket.emit("game_started", {
      roomId: activeRoom.id,
      game: enrichedGame,
    });
  } else {
    io.to(activeRoom.id).emit(
      "room_updated",
      await enrichRoomPayload(activeRoom),
    );
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
      enrichPlayersWithDisplayNames(activeRoom.game.players).then((players) => {
        socket.emit("game_started", {
          roomId: activeRoom.id,
          game: {
            ...activeRoom.game,
            players,
          },
        });
      });
    } else {
      enrichRoomPayload(activeRoom).then((room) => {
        io.to(activeRoom.id).emit("room_updated", room);
      });
    }
  } else {
    socket.emit("session_ready", {
      userId: socket.user.userId,
      username: socket.user.username,
      socketId: socket.id,
    });
  }
  socket.on("auth_with_token", async (token) => {
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
      notifyFriendsStatusChange(io, socket.user.userId);
    } else {
      socket.emit("auth_failed", "Sitzung abgelaufen. Bitte neu anmelden.");
    }
  });

  socket.on("set_guest_name", async (name) => {
    try {
      if (typeof name !== "string" || name.trim().length === 0) {
        return socket.emit("guest_name_set", {
          userId: socket.user.userId,
          username: socket.user.username,
        });
      }

      const normalized = normalizeAuthUsername(name);
      if (!normalized) {
        return emitInvalidInput(
          socket,
          "Gastname muss 3–32 Zeichen enthalten (A–Z, 0–9, ., _, -).",
        );
      }

      socket.user.username = normalized;
      setStoredGuestName(socket.user.userId, normalized);

      const activeRoom = getRoomByUserId(socket.user.userId);
      if (activeRoom) {
        joinRoom(activeRoom.id, socket.user);

        if (activeRoom.game) {
          io.to(activeRoom.id).emit("game_updated", {
            roomId: activeRoom.id,
            game: {
              ...activeRoom.game,
              players: await enrichPlayersWithDisplayNames(
                activeRoom.game.players,
              ),
            },
            currentPlayer:
              activeRoom.game.players[activeRoom.game.currentPlayerIndex]
                ?.userId || null,
          });
        } else {
          io.to(activeRoom.id).emit(
            "room_updated",
            await enrichRoomPayload(activeRoom),
          );
        }
      }

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
        clearStoredGuestName(previousUserId);

        socket.emit("login_success", {
          user: socket.user,
          token,
          currentRoomId: getRoomByUserId(socket.user.userId)?.id || null,
        });

        restoreRoomState(io, socket);
        notifyFriendsStatusChange(io, socket.user.userId);
      } else {
        socket.emit("error_message", "Falscher Benutzername oder Passwort.");
      }
    } catch (error) {
      socket.emit(
        "error_message",
        "Ein serverseitiger Fehler ist aufgetreten.",
      );
      console.error("Login error:", error);
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
      clearStoredGuestName(previousUserId);

      socket.emit("login_success", {
        user: socket.user,
        token,
        currentRoomId: getRoomByUserId(socket.user.userId)?.id || null,
      });

      restoreRoomState(io, socket);
      notifyFriendsStatusChange(io, socket.user.userId);
    } catch (error) {
      socket.emit(
        "error_message",
        "Ein serverseitiger Fehler ist aufgetreten.",
      );
      console.error("Register error:", error);
    }
  });

  socket.on("create_room", async () => {
    if (socket.user.userId.length > 64) {
      return emitInvalidInput(socket, "Ungültige Sitzung");
    }

    const id = createRoom(socket.user);
    socket.join(id);

    const room = await enrichRoomPayload(getRoom(id));

    socket.emit("room_created", { roomId: id, room: room });
    socket.emit("chat_history", []);

    const profile = await getProfile(socket.user.userId);
    const senderName = profile?.displayName || socket.user.username;

    broadcastChatMessage(io, id, {
      sender: "System",
      text: `${senderName} ist dem Raum beigetreten.`,
      timestamp: Date.now(),
      isSystem: true,
    });
  });

  socket.on("join_room", async (id) => {
    const roomCode = normalizeRoomCode(id);

    if (!roomCode) {
      return emitInvalidInput(socket, "Ungültiger Raumcode");
    }

    const res = joinRoom(roomCode, socket.user);
    if (!res.success) return socket.emit("error_message", res.message);

    socket.join(roomCode);
    io.to(roomCode).emit("room_updated", await enrichRoomPayload(res.room));
    socket.emit("chat_history", getRoom(roomCode).chatHistory || []);

    const profile = await getProfile(socket.user.userId);
    const senderName = profile?.displayName || socket.user.username;

    broadcastChatMessage(io, roomCode, {
      sender: "System",
      text: `${senderName} ist dem Raum beigetreten.`,
      timestamp: Date.now(),
      isSystem: true,
    });
  });

  socket.on("leave_room", async (roomId) => {
    const sanitizedRoomId = normalizeRoomCode(roomId);

    if (!sanitizedRoomId) {
      return emitInvalidInput(socket, "Ungültiger Raumcode");
    }

    const profile = await getProfile(socket.user.userId);
    const displayName = profile?.displayName || socket.user.username;
    const res = leaveRoom(socket.user.userId);

    if (!res.success) return;

    socket.leave(sanitizedRoomId);
    broadcastChatMessage(io, res.roomId, {
      sender: "System",
      text: `${displayName} hat den Raum verlassen.`,
      timestamp: Date.now(),
      isSystem: true,
    });

    if (!res.roomDeleted) {
      io.to(res.roomId).emit("room_updated", await enrichRoomPayload(res.room));

      if (res.gameAborted) {
        io.to(res.roomId).emit("game_aborted", {
          message: `${displayName} hat den Raum verlassen. Das Spiel wurde abgebrochen.`,
        });
      }
    }
  });

  socket.on("start_game", async (roomId) => {
    const sanitizedRoomId = normalizeRoomCode(roomId);

    if (!sanitizedRoomId) {
      return emitInvalidInput(socket, "Ungültiger Raumcode");
    }

    const game = startRoomGame(sanitizedRoomId);
    const enrichedGame = {
      ...game,
      players: await enrichPlayersWithDisplayNames(game.players),
    };

    io.to(sanitizedRoomId).emit("game_started", {
      roomId: sanitizedRoomId,
      game: enrichedGame,
    });
  });

  socket.on("game_action", async (data) => {
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

    const allowedWhenNotCurrent =
      normalizedAction.type === "CALL_UNO" ||
      normalizedAction.type === "CHALLENGE_UNO";
    if (
      !allowedWhenNotCurrent &&
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
        game: {
          ...room.game,
          players: await enrichPlayersWithDisplayNames(room.game.players),
        },
        lastDraw: result.lastDraw,
        lastPlayed: result.lastPlayed,
        currentPlayer:
          result.currentPlayer ||
          room.game.players[room.game.currentPlayerIndex].userId,
      });
    }

    if (result.gameOver) {
      const enrichedPlayers = await enrichPlayersWithDisplayNames(
        room.game.players,
      );
      const winner =
        enrichedPlayers.find(
          (player) =>
            player.userId === result.winner ||
            player.username === result.winner,
        )?.displayName ||
        result.winner ||
        "unknown";

      io.to(sanitizedRoomId).emit("game_over", {
        winner,
      });

      room.game = null;

      setTimeout(async () => {
        io.to(sanitizedRoomId).emit(
          "room_updated",
          await enrichRoomPayload(room),
        );
      }, 5000);
    }
  });

  socket.on("disconnect", async () => {
    const disconnectRes = handleDisconnect(socket.user.userId, socket.id);
    const userId = socket.user?.userId;

    if (disconnectRes.success) {
      if (!disconnectRes.roomDeleted && !disconnectRes.room.game) {
        enrichRoomPayload(disconnectRes.room).then((room) => {
          io.to(disconnectRes.roomId).emit("room_updated", room);
        });
      }

      setTimeout(async () => {
        const checkRoom = getRoom(disconnectRes.roomId);
        const player = checkRoom?.players.find(
          (p) => p.userId === socket.user.userId,
        );

        if (player && !player.connected) {
          const profile = await getProfile(socket.user.userId);
          const displayName = profile?.displayName || socket.user.username;
          const res = leaveRoom(socket.user.userId);

          broadcastChatMessage(io, res.roomId, {
            sender: "System",
            text: `${displayName} hat den Raum verlassen.`,
            timestamp: Date.now(),
            isSystem: true,
          });

          if (res.success && !res.roomDeleted) {
            io.to(res.roomId).emit(
              "room_updated",
              await enrichRoomPayload(res.room),
            );

            if (res.gameAborted) {
              io.to(res.roomId).emit("game_aborted", {
                message: `${displayName} hat das Spiel verlassen. Das Spiel wurde abgebrochen.`,
              });
            }
          }
        }
      }, config.reconnectGraceTimeMs);
    }
    notifyFriendsStatusChange(io, userId);
  });

  socket.on("get_profile", async (targetUserId) => {
    const idToLoad = targetUserId || socket.user.userId;
    try {
      const profile = await getProfile(idToLoad);

      if (profile) {
        socket.emit("profile_data", profile);
      } else {
        socket.emit("error_message", "Profil konnte nicht gefunden werden.");
      }
    } catch (err) {
      console.error("Error loading profile:", err);
      socket.emit("error_message", "Fehler beim Laden des Profils.");
    }
  });

  socket.on("update_profile", async (data) => {
    try {
      const userId = socket.user.userId;

      if (!userId || isNaN(Number(userId))) {
        return socket.emit("error_message", "Nicht autorisiert.");
      }

      const updatedData = await updateProfile(
        userId,
        data.displayName,
        data.bio,
        data.avatarUrl,
      );

      const activeRoom = getRoomByUserId(userId);
      if (activeRoom) {
        if (activeRoom.game) {
          io.to(activeRoom.id).emit("game_updated", {
            roomId: activeRoom.id,
            game: {
              ...activeRoom.game,
              players: await enrichPlayersWithDisplayNames(
                activeRoom.game.players,
              ),
            },
            currentPlayer:
              activeRoom.game.players[activeRoom.game.currentPlayerIndex]
                ?.userId || null,
          });
        } else {
          io.to(activeRoom.id).emit(
            "room_updated",
            await enrichRoomPayload(activeRoom),
          );
        }
      }

      socket.emit("profile_update_success", updatedData);
      notifyFriendsStatusChange(io, userId);
    } catch (err) {
      socket.emit("error_message", "Fehler beim Aktualisieren des Profils.");
    }
  });

  socket.on("chat_message", async (text) => {
    if (
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.length > 255
    )
      return;

    const spamCheck = checkChatSpam(socket);
    if (!spamCheck.allowed) {
      return socket.emit(
        "error_message",
        "Zu viele Nachrichten. Bitte kurz warten.",
      );
    }

    const activeRoom = getRoomByUserId(socket.user.userId);
    if (!activeRoom) return;

    const profile = await getProfile(socket.user.userId);
    const senderName = profile?.displayName || socket.user.username;

    broadcastChatMessage(io, activeRoom.id, {
      sender: senderName,
      text: text.trim(),
      timestamp: Date.now(),
      isSystem: false,
    });
  });

  socket.on("get_friends_data", async () => {
    if (!socket.user?.userId || isNaN(Number(socket.user.userId))) return;

    try {
      const data = await getFriendsListData(socket.user.userId, io);
      socket.emit("friends_data", data);
    } catch (err) {
      socket.emit("error_message", "Fehler beim Laden der Freundesliste.");
    }
  });

  socket.on("send_friend_request", async (targetUsername) => {
    if (!socket.user?.userId || isNaN(Number(socket.user.userId))) return;

    try {
      const receiverId = await sendFriendRequest(
        socket.user.userId,
        targetUsername,
      );

      socket.emit("friend_action_result", {
        success: true,
        text: `Anfrage an ${targetUsername} gesendet.`,
      });

      await sendDirectFriendsUpdate(io, receiverId);
      await sendDirectFriendsUpdate(io, socket.user.userId);
    } catch (err) {
      socket.emit("friend_action_result", {
        success: false,
        text: err.message || "Fehler beim Senden der Freundschaftsanfrage.",
      });
    }
  });

  socket.on("accept_friend_request", async (requesterId) => {
    if (!socket.user?.userId || isNaN(Number(socket.user.userId))) return;

    try {
      await acceptFriendRequest(socket.user.userId, requesterId);

      const reqSocket = Array.from(io.sockets.sockets.values()).find(
        (socket) =>
          socket.user && Number(socket.user.userId) === Number(requesterId),
      );
      if (reqSocket) {
        reqSocket.emit("friend_action_result", {
          success: true,
          text: `${socket.user.username} hat deine Freundschaftsanfrage akzeptiert.`,
        });
      }

      await sendDirectFriendsUpdate(io, requesterId);
      await sendDirectFriendsUpdate(io, socket.user.userId);
    } catch (err) {
      socket.emit("error_message", err.message);
    }
  });
  socket.on("decline_friend_request", async (requesterId) => {
    if (!socket.user?.userId || isNaN(Number(socket.user.userId))) return;

    try {
      await declineFriendRequest(socket.user.userId, requesterId);

      await sendDirectFriendsUpdate(io, requesterId);
      await sendDirectFriendsUpdate(io, socket.user.userId);
    } catch (err) {
      socket.emit("error_message", err.message);
    }
  });

  socket.on("remove_friend", async (friendId) => {
    if (!socket.user?.userId || isNaN(Number(socket.user.userId))) return;
    try {
      await removeFriend(socket.user.userId, friendId);

      await sendDirectFriendsUpdate(io, friendId);
      await sendDirectFriendsUpdate(io, socket.user.userId);
    } catch (err) {
      socket.emit("error_message", err.message);
    }
  });
}

module.exports = { registerSocket };
