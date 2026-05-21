const {
    createRoom,
    joinRoom,
    leaveRoom,
    getRoom,
    startRoomGame
} = require("../game/roomManager");
const { processAction } = require("../game/gameEngine");

function registerSocket(io, socket) {

    socket.on("create_room", () => {
        const id = createRoom(socket.id);
        socket.join(id);
        socket.emit("room_created", { roomId: id });
    });

    socket.on("join_room", (id) => {
        const res = joinRoom(id, socket.id);
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
                currentPlayer: result.currentPlayer || room.game.players[room.game.currentPlayerIndex].id
            });
        }

        if (result.gameOver) {
            io.to(roomId).emit("game_over", {
                winner: result.winner || "unknown"
            });
        }
    });

    socket.on("disconnect", () => {
        const res = leaveRoom(socket.id);

        if (res.success && !res.roomDeleted) {
            io.to(res.roomId).emit("room_updated", res.room);

            if (res.gameAborted) {
                io.to(res.roomId).emit("game_aborted", {
                    message: `${res.leftPlayerName} hat das Spiel verlassen. Das Spiel wurde abgebrochen.`
                });
            }
        }
    });
}

module.exports = { registerSocket };