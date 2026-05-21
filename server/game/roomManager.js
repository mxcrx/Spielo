const rooms = {};
const { createUnoGame, startGame } = require("./unoGame");

function createRoom(hostSocketId) {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    rooms[roomId] = {
        id: roomId,
        host: hostSocketId,
        players: [{ id: hostSocketId, name: "Spieler 1" }],
        game: null
    };

    return roomId;
}

function joinRoom(roomId, socketId) {
    const room = rooms[roomId];
    if (!room) return { success: false, message: "Raum existiert nicht" };

    if (!room.players.find(p => p.id === socketId)) {
        room.players.push({
            id: socketId,
            name: `Spieler ${room.players.length + 1}`
        });
    }

    return { success: true, room };
}

function leaveRoom(socketId) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const playerIndex = room.players.findIndex(p => p.id === socketId);

        if (playerIndex !== -1) {
            const [removed] = room.players.splice(playerIndex, 1);
            const leftPlayerName = removed?.name || "unknown";

            let gameAborted = false;

            if (room.players.length === 0) {
                delete rooms[roomId];
                return { success: true, roomId, roomDeleted: true, leftPlayerName, gameAborted: true };
            }

            if (room.host === socketId) {
                room.host = room.players[0]?.id;
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
                gameAborted
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

    room.game = startGame(createUnoGame(room.players));
    return room.game;
}

module.exports = {
    createRoom,
    joinRoom,
    leaveRoom,
    getRoom,
    startRoomGame
};