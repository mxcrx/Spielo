const rooms = {};
const { createUnoGame, startGame } = require("./unoGame");

function createRoom(hostUser) {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    rooms[roomId] = {
        id: roomId,
        host: hostUser.userId,
        players: [{ userId: hostUser.userId, socketId: hostUser.socketId, username: hostUser.username, connected: true }],
        game: null
    };

    return roomId;
}

function joinRoom(roomId, user) {
    const room = rooms[roomId];
    if (!room) return { success: false, message: "Raum existiert nicht" };

    const existingPlayer = room.players.find(player => player.userId === user.userId);

    if (existingPlayer) {
        existingPlayer.socketId = user.socketId;
        existingPlayer.username = user.username || existingPlayer.username;
        existingPlayer.connected = true;
    } else {
        room.players.push({
            userId: user.userId,
            socketId: user.socketId,
            username: user.username || `Spieler ${room.players.length + 1}`,
            connected: true
        });
    }

    return { success: true, room };
}

function getRoomByUserId(userId) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.players.some(player => player.userId === userId)) {
            return room;
        }
    }
    return null;
}

function handleDisconnect(userId, socketId) {
    const room = getRoomByUserId(userId);
    if (!room) return { success: false };

    const player = room.players.find(p => p.userId === userId);
    if (player && (!socketId || player.socketId === socketId)) {
        player.connected = false;
        return { success: true, roomId: room.id, room };
    }

    return { success: false, staleDisconnect: true, roomId: room.id, room };
}

function leaveRoom(userId) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const playerIndex = room.players.findIndex(player => player.userId === userId);

        if (playerIndex !== -1) {
            const [removed] = room.players.splice(playerIndex, 1);
            const leftPlayerName = removed?.username || "unknown";

            let gameAborted = false;

            if (room.players.length === 0) {
                delete rooms[roomId];
                return { success: true, roomId, roomDeleted: true, leftPlayerName, gameAborted: true };
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
    getRoomByUserId,
    handleDisconnect,
    leaveRoom,
    getRoom,
    startRoomGame
};