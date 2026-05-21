const {
    createRoom,
    joinRoom,
    leaveRoom,
    getRoom,
    startRoomGame
} = require("../game/roomManager");

const {
    drawCard,
    nextTurn,
    getCurrentPlayer,
    playCard,
    applyCardEffect,
    drawMultipleCards,
    checkWinner,
    isDrawStackCard,
} = require("../game/unoGame");

function canPlayAnyCard(game, playerId) {
    const hand = game.hands[playerId] || [];
    const topCard = game.discardPile.at(-1);

    return hand.some(card => {
        if (!topCard) return true;

        if (card.value === "wild" || card.value === "+4") return true;

        if (game.currentColor && card.color === game.currentColor) return true;

        return topCard.color === card.color || topCard.value === card.value;
    });
}

function finishTurnAfterDraw(io, roomId, game, playerId, drawnCard) {
    if (canPlayAnyCard(game, playerId)) {
        game.turnState = "drawn";

        io.to(roomId).emit("game_updated", {
            game,
            lastDraw: drawnCard,
            currentPlayer: getCurrentPlayer(game)
        });

        return true;
    }

    game.turnState = "idle";

    const next = nextTurn(game);

    io.to(roomId).emit("game_updated", {
        game,
        lastDraw: drawnCard,
        currentPlayer: next
    });

    return true;
}

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

    socket.on("draw_card", (roomId) => {
        const room = getRoom(roomId);
        if (!room?.game) return;

        const game = room.game;

        if (getCurrentPlayer(game) !== socket.id) return;

        if (game.turnState !== "idle") {
            socket.emit("error_message", "Du kannst nur einmal pro Zug ziehen");
            return;
        }

        let card = null;

        if (game.pendingDraw > 0) {
            drawMultipleCards(game, socket.id, game.pendingDraw);
            game.pendingDraw = 0;
        } else {
            card = drawCard(game, socket.id);
        }

        finishTurnAfterDraw(io, roomId, game, socket.id, card);
    });

    socket.on("play_card", ({ roomId, cardIndex, chosenColor }) => {
        const room = getRoom(roomId);
        if (!room?.game) return;

        const game = room.game;

        if (getCurrentPlayer(game) !== socket.id) return;

        if (game.turnState === "played" || game.turnState === "choosing_color") {
            socket.emit("error_message", "Du hast diesen Zug bereits abgeschlossen");
            return;
        }

        const result = playCard(game, socket.id, cardIndex, chosenColor);
        if (!result.success) {
            return socket.emit("error_message", result.message);
        }

        const card = result.playedCard;

        const needsColorChoice = card.value === "wild" || card.value === "+4";

        game.turnState = needsColorChoice ? "choosing_color" : "played";

        let steps = applyCardEffect(game, card);

        if (card.value === "+2") {
            game.pendingDraw += 2;
        }

        if (card.value === "+4") {
            game.pendingDraw += 4;
        }

        if (card.value === "+4" || card.value === "wild") {
            io.to(socket.id).emit("choose_color", {
                reason: card.value
            });
        }

        if (!needsColorChoice) {
            const next = nextTurn(game, steps);

            game.turnState = "idle";

            io.to(roomId).emit("game_updated", {
                game,
                lastPlayed: card,
                currentPlayer: next
            });

            const won = checkWinner(game, socket.id);

            if (won) {
                const p = game.players.find(x => x.id === socket.id);

                io.to(roomId).emit("game_over", {
                    winner: p?.name || "unknown"
                });

                return;
            }

            return;
        }

        const won = checkWinner(game, socket.id);

        if (won) {
            const p = game.players.find(x => x.id === socket.id);

            io.to(roomId).emit("game_over", {
                winner: p?.name || "unknown"
            });
        }
    });

    socket.on("end_turn", (roomId) => {
        const room = getRoom(roomId);
        if (!room?.game) return;

        const game = room.game;

        if (getCurrentPlayer(game) !== socket.id) return;

        if (game.turnState === "choosing_color") {
            socket.emit("error_message", "Bitte zuerst eine Farbe wählen");
            return;
        }

        if (game.turnState === "idle") {
            socket.emit("error_message", "Du musst eine Karte spielen oder ziehen");
            return;
        }

        game.turnState = "idle";

        const next = nextTurn(game);

        io.to(roomId).emit("game_updated", {
            game,
            currentPlayer: next
        });
    });

    socket.on("choose_color", ({ roomId, color }) => {
        const room = getRoom(roomId);
        if (!room?.game) return;

        const game = room.game;

        if (getCurrentPlayer(game) !== socket.id) return;

        if (game.turnState !== "choosing_color") return;

        game.currentColor = color;

        const topCard = game.discardPile.at(-1);

        if (topCard && (topCard.value === "wild" || topCard.value === "+4")) {
            topCard.color = color;
        }

        const hasWon = game.hands[socket.id].length === 0;

        if (hasWon) {
            io.to(roomId).emit("game_over", {
                winner: game.players.find(x => x.id === socket.id)?.name || "unknown"
            });

            return;
        }

        if (game.pendingDraw > 0 && topCard?.value === "+4") {
            const drawAmount = game.pendingDraw;
            const nextPlayer = nextTurn(game);

            drawMultipleCards(game, nextPlayer, drawAmount);
            game.pendingDraw = 0;

            if (canPlayAnyCard(game, nextPlayer)) {
                game.turnState = "drawn";
            } else {
                game.turnState = "idle";
                nextTurn(game);
            }
        } else {
            nextTurn(game);
            game.turnState = "idle";
        }

        game.turnState = "idle";

        io.to(roomId).emit("game_updated", {
            game,
            currentPlayer: getCurrentPlayer(game)
        });
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