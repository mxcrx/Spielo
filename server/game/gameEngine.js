const {
  drawCard,
  nextTurn,
  getCurrentPlayer,
  playCard,
  applyCardEffect,
  drawMultipleCards,
  checkWinner,
} = require("./unoGame");
const matchService = require("../matches/matchService");

function canPlayAnyCard(game, playerId) {
  const hand = game.hands[playerId] || [];
  const topCard = game.discardPile.at(-1);

  return hand.some((card) => {
    if (!topCard) return true;

    if (topCard.value === "wild" || topCard.value === "+4") {
      return (
        card.value !== "wild" &&
        card.value !== "+4" &&
        card.color === game.currentColor
      );
    }

    if (card.value === "wild" || card.value === "+4") return true;

    if (game.currentColor && card.color === game.currentColor) return true;

    return topCard.color === card.color || topCard.value === card.value;
  });
}

function resolveAfterDraw(game, playerId) {
  if (canPlayAnyCard(game, playerId)) {
    game.turnState = "drawn";
    return getCurrentPlayer(game);
  }

  game.turnState = "idle";
  return nextTurn(game);
}

function getWinnerName(game, playerId) {
  const winner = game.players.find((player) => player.userId === playerId);
  return winner?.username || "unknown";
}

function handlePlayCard(game, action) {
  const { playerId, payload = {} } = action;
  const cardIndex = payload.cardIndex;

  if (game.players[game.currentPlayerIndex]?.userId !== playerId) {
    return { game, error: "Not your turn" };
  }

  if (game.turnState === "played" || game.turnState === "choosing_color") {
    return { game, error: "Du hast diesen Zug bereits abgeschlossen" };
  }

  const result = playCard(game, playerId, cardIndex, payload.chosenColor);

  if (!result.success) {
    return { game, error: result.message };
  }

  if ((game.hands[playerId] || []).length !== 1) {
    game.unoDeclared[playerId] = false;
  }

  const card = result.playedCard;
  const needsColorChoice = card.value === "wild" || card.value === "+4";

  game.turnState = needsColorChoice ? "choosing_color" : "played";

  const steps = applyCardEffect(game, card);

  if (card.value === "+2") {
    game.pendingDraw += 2;
  }

  if (card.value === "+4") {
    game.pendingDraw += 4;
  }

  const response = {
    game,
    lastPlayed: card,
    currentPlayer: getCurrentPlayer(game),
    gameUpdated: !needsColorChoice,
  };

  if (needsColorChoice) {
    response.chooseColor = true;
    response.chooseColorReason = card.value;
  } else {
    response.currentPlayer = nextTurn(game, steps);
    game.turnState = "idle";
  }

  if (checkWinner(game, playerId)) {
    response.gameOver = true;
    response.winner = getWinnerName(game, playerId);
    handleGameEnd(game, playerId);
  }

  game.lastActionAt = Date.now();
  return response;
}

function handleDrawCard(game, action) {
  const { playerId } = action;

  if (game.players[game.currentPlayerIndex]?.userId !== playerId) {
    return { game, error: "Not your turn" };
  }

  if (game.turnState !== "idle") {
    return { game, error: "Du kannst nur einmal pro Zug ziehen" };
  }

  let drawnCard = null;

  if (game.pendingDraw > 0) {
    drawMultipleCards(game, playerId, game.pendingDraw);
    game.pendingDraw = 0;
  } else {
    drawnCard = drawCard(game, playerId);
  }

  if ((game.hands[playerId] || []).length !== 1) {
    game.unoDeclared[playerId] = false;
  }

  const currentPlayer = resolveAfterDraw(game, playerId);

  return {
    game,
    lastDraw: drawnCard,
    currentPlayer,
    gameUpdated: true,
  };
}

function handleEndTurn(game, action) {
  const { playerId } = action;

  if (game.players[game.currentPlayerIndex]?.userId !== playerId) {
    return { game, error: "Not your turn" };
  }

  if (game.turnState === "choosing_color") {
    return { game, error: "Bitte zuerst eine Farbe wählen" };
  }

  if (game.turnState === "idle") {
    return { game, error: "Du musst eine Karte spielen oder ziehen" };
  }

  game.turnState = "idle";

  return {
    game,
    currentPlayer: nextTurn(game),
    gameUpdated: true,
  };
}

function handleChooseColor(game, action) {
  const { playerId, payload = {} } = action;
  const { color } = payload;

  if (game.players[game.currentPlayerIndex]?.userId !== playerId) {
    return { game, error: "Not your turn" };
  }

  if (game.turnState !== "choosing_color") {
    return { game, error: "Not your turn" };
  }

  game.currentColor = color;

  const topCard = game.discardPile.at(-1);

  if (topCard && (topCard.value === "wild" || topCard.value === "+4")) {
    topCard.color = color;
  }

  if (checkWinner(game, playerId)) {
    handleGameEnd(game, playerId);
    return {
      game,
      gameOver: true,
      winner: getWinnerName(game, playerId),
    };
  }

  if (game.pendingDraw > 0 && topCard?.value === "+4") {
    const drawAmount = game.pendingDraw;
    const nextPlayer = nextTurn(game);

    drawMultipleCards(game, nextPlayer, drawAmount);
    game.pendingDraw = 0;

    const currentPlayer = resolveAfterDraw(game, nextPlayer);

    return {
      game,
      currentPlayer,
      gameUpdated: true,
    };
  }

  game.turnState = "idle";

  return {
    game,
    currentPlayer: nextTurn(game),
    gameUpdated: true,
  };
}

function handleCallUno(game, action) {
  const now = Date.now();
  const GRACE_PERIOD_MS = 1000;

  const hand = game.hands[action.playerId] || [];

  if (hand.length !== 1) {
    return { game, error: "Du kannst jetzt kein UNO rufen!" };
  }

  if (game.lastActionAt && now - game.lastActionAt > GRACE_PERIOD_MS) {
    return { game, error: "Du kannst jetzt kein UNO mehr rufen!" };
  }

  game.unoDeclared[action.playerId] = true;

  return {
    game,
    gameUpdated: true,
  };
}

function handleChallengeUno(game, action) {
  const now = Date.now();
  const GRACE_PERIOD_MS = 1000;

  if (game.lastActionAt && now - game.lastActionAt < GRACE_PERIOD_MS) {
    return { game, error: "Du musst noch kurz warten!" };
  }

  let violatorId = null;

  for (const p of game.players) {
    const hand = game.hands[p.userId] || [];
    if (hand.length === 1 && !game.unoDeclared[p.userId]) {
      violatorId = p.userId;
      break;
    }
  }

  if (violatorId) {
    drawMultipleCards(game, violatorId, 2);
    game.unoDeclared[violatorId] = false;
    return {
      game,
      gameUpdated: true,
      challengedPlayer: violatorId,
    };
  }
  return { game, error: "Niemand hat vergessen, UNO zu rufen!" };
}

function processAction(game, action = {}) {
  switch (action.type) {
    case "PLAY_CARD":
      return handlePlayCard(game, action);

    case "DRAW_CARD":
      return handleDrawCard(game, action);

    case "END_TURN":
      return handleEndTurn(game, action);

    case "CHOOSE_COLOR":
      return handleChooseColor(game, action);

    case "CHALLENGE_UNO":
      return handleChallengeUno(game, action);

    case "CALL_UNO":
      return handleCallUno(game, action);

    default:
      return { game, error: "Unknown action" };
  }
}

function handleGameEnd(game, winnerId) {
  if (game.winnerId) return;
  game.winnerId = winnerId;

  game.players.forEach((player) => {
    if (player.userId === winnerId) {
      player.placement = 1;
    } else {
      player.placement = 2;
    }
  });

  matchService.saveMatch(game).catch((err) => {
    console.error("[Match History] Fehler beim Hintergrund-Speichern:", err);
  });
}

module.exports = {
  processAction,
};
