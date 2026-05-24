const {
    createRoom,
    joinRoom,
    getRoomByUserId,
    handleDisconnect,
    leaveRoom,
    getRoom,
    startRoomGame
} = require("../game/roomManager");
const { processAction } = require("../game/gameEngine");
const { createGuestUser } = require("../auth/guestAuth.js");

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
            currentRoomId: activeRoom.id
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
            socketId: socket.id
        });
    }

    socket.on("create_room", () => {
        const id = createRoom(socket.user);
        socket.join(id);

        const room = getRoom(id);

        socket.emit("room_created", { roomId: id, room: room });
    });

    socket.on("join_room", (id) => {
        const res = joinRoom(id, socket.user);
        if (!res.success) return socket.emit("error_message", res.message);

        socket.join(id);
        io.to(id).emit("room_updated", res.room);
    });

    socket.on("start_game", (roomId) => {
        const game = startRoomGame(roomId);
        io.to(roomId).emit("game_started", game);
    });

    socket.on("game_action", ({ roomId, action }) => {
        const room = getRoom(roomId);
        if (!room?.game) return;

        const result = processAction(room.game, action);

        if (result.error) {
            socket.emit("error_message", result.error);
            return;
        }

        room.game = result.game;

        if (result.chooseColor) {
            socket.emit("choose_color", {
                reason: result.chooseColorReason
            });
        }

        if (result.gameUpdated) {
            io.to(roomId).emit("game_updated", {
                game: room.game,
                lastDraw: result.lastDraw,
                lastPlayed: result.lastPlayed,
                currentPlayer: result.currentPlayer || room.game.players[room.game.currentPlayerIndex].userId
            });
        }

        if (result.gameOver) {
            io.to(roomId).emit("game_over", {
                winner: result.winner || "unknown"
            });

            room.game = null;

            setTimeout(() => {
                io.to(roomId).emit("room_updated", room);
            }, 4500);
        }
    });

    socket.on("disconnect", () => {
        const disconnectRes = handleDisconnect(socket.user.userId, socket.id);

        if (disconnectRes.success) {
            if (!disconnectRes.room.game) {
                io.to(disconnectRes.roomId).emit("room_updated", disconnectRes.room);
            }

            setTimeout(() => {
                const checkRoom = getRoom(disconnectRes.roomId);
                const player = checkRoom?.players.find(p => p.userId === socket.user.userId);

                if (player && !player.connected) {
                    const res = leaveRoom(socket.user.userId);

                    if (res.success && !res.roomDeleted) {
                        io.to(res.roomId).emit("room_updated", res.room);

                        if (res.gameAborted) {
                            io.to(res.roomId).emit("game_aborted", {
                                message: `${res.leftPlayerName} hat das Spiel verlassen. Das Spiel wurde abgebrochen.`
                            });
                        }
                    }
                }
            }, 15000);
        }
    });
}

module.exports = { registerSocket };