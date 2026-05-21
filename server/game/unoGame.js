function createUnoGame(players) {
    return {
        players,
        hands: {},
        deck: createDeck(),
        discardPile: [],
        currentPlayerIndex: 0,
        direction: 1,
        pendingDraw: 0,
        turnState: "idle",
        currentColor: null
    };
}

function createDeck() {
    const colors = ["red", "green", "blue", "yellow"];
    const deck = [];

    for (const color of colors) {
        deck.push({ color, value: 0 });
        for (let i = 1; i <= 9; i++) {
            deck.push({ color, value: i });
            deck.push({ color, value: i });
        }

        deck.push({ color, value: "skip" });
        deck.push({ color, value: "skip" });

        deck.push({ color, value: "reverse" });
        deck.push({ color, value: "reverse" });

        deck.push({ color, value: "+2" });
        deck.push({ color, value: "+2" });
    }

    for (let i = 0; i < 4; i++) {
        deck.push({ color: null, value: "wild" });
        deck.push({ color: null, value: "+4" });
    }

    return shuffleDeck(deck);
}

function startGame(game) {
    for (const p of game.players) {
        game.hands[p.id] = game.deck.splice(0, 5);
    }

    game.discardPile.push(game.deck.pop());

    return game;
}

function drawCard(game, playerId) {
    if (game.deck.length === 0) {
        recycleDeck(game);
    }

    const card = game.deck.pop();
    if (card) {
        game.hands[playerId].push(card);
    }
    return card;
}

function drawMultipleCards(game, playerId, amount) {
    for (let i = 0; i < amount; i++) {
        drawCard(game, playerId);
    }
}

function nextTurn(game, steps = 1) {
    const n = game.players.length;

    game.currentPlayerIndex =
        (game.currentPlayerIndex + steps * game.direction + n) % n;

    return game.players[game.currentPlayerIndex].id;
}

function getCurrentPlayer(game) {
    return game.players[game.currentPlayerIndex].id;
}

function canPlay(top, card, currentColor) {
    if (card.value === "wild" || card.value === "+4") return true;

    if (card.value === "+2") {
        return top.value === "+2" || (currentColor ? card.color === currentColor : top.color === card.color);
    }

    if (currentColor) {
        if (card.color === currentColor) return true;
    }

    return top.color === card.color || top.value === card.value;
}

function playCard(game, playerId, index, chosenColor) {
    const hand = game.hands[playerId];
    const card = hand[index];

    if (!card) return { success: false, message: "Karte existiert nicht" };

    const top = game.discardPile.at(-1);

    if (!canPlay(top, card, game.currentColor)) return { success: false, message: "Ungültig" };

    if (game.pendingDraw > 0 && card.value !== "+2") return { success: false, message: "Du musst eine +2-Karte spielen oder ziehen" };

    hand.splice(index, 1);

    if ((card.value === "wild" || card.value === "+4") && chosenColor) {
        card.color = chosenColor;
        game.currentColor = chosenColor;
    } else {
        game.currentColor = card.color;
    }

    game.discardPile.push(card);

    return { success: true, playedCard: card };
}

function applyCardEffect(game, card) {
    switch (card.value) {
        case "skip":
            return 2;

        case "reverse":
            if (game.players.length === 2) return 2;
            game.direction *= -1;
            return 1;

        case "+2":
            return 1;

        default:
            return 1;
    }
}

function isDrawStackCard(card) {
    return card.value === "+2";
}

function checkWinner(game, playerId) {
    return game.hands[playerId].length === 0;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i +1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function recycleDeck(game) {
    if (game.discardPile.length <= 1) return;

    const topCard = game.discardPile.pop();

    const oldCards = game.discardPile.map(card => {
        if (card.value === "wild" || card.value === "+4") {
            return { ...card, color: null };
        }
        return card;
    });
    game.deck = shuffleDeck(oldCards);

    game.discardPile = [topCard];
}

module.exports = {
    createUnoGame,
    startGame,
    drawCard,
    drawMultipleCards,
    nextTurn,
    getCurrentPlayer,
    playCard,
    applyCardEffect,
    isDrawStackCard,
    checkWinner,
};