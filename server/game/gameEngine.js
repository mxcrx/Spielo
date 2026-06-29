const {
  drawCard,
  nextTurn,
  getCurrentPlayer,
  playCard,
  applyCardEffect,
  drawMultipleCards,
  checkWinner,
  canPlay,
} = require("./unoGame");
const matchService = require("../matches/matchService");

function canPlayAnyCard(game, playerId) {
  const hand = game.hands[playerId] || [];
  const topCard = game.discardPile.at(-1);

  return hand.some((card) =>
    canPlay(topCard, card, game.currentColor, game.settings, game.pendingDraw),
  );
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

function handleZeroRule(game) {
  const numPlayers = game.players.length;
  if (numPlayers <= 1) return;

  const newHands = {};
  for (let i = 0; i < numPlayers; i++) {
    const currentId = game.players[i].userId;
    const nextIndex = (i + game.direction + numPlayers) % numPlayers;
    const nextId = game.players[nextIndex].userId;
    newHands[nextId] = game.hands[currentId];
  }
  game.hands = newHands;
}

function handlePlayCard(game, action) {
  const { playerId, payload = {} } = action;
  const cardIndex = payload.cardIndex;

  const isCurrentTurn =
    game.players[game.currentPlayerIndex]?.userId === playerId;
  let isJumpIn = false;

  if (!isCurrentTurn) {
    if (!game.settings.jumpIn) {
      return { game, error: "Du bist nicht am Zug" };
    }

    const hand = game.hands[playerId];
    const card = hand[cardIndex];
    const topCard = game.discardPile.at(-1);

    if (
      !card ||
      !topCard ||
      card.color !== topCard.color ||
      card.value !== topCard.value
    ) {
      return { game, error: "Du kannst nur die gleiche Karte spielen!" };
    }
    isJumpIn = true;
  }

  if (
    game.turnState === "played" ||
    game.turnState === "choosing_color" ||
    game.turnState === "choosing_swap_target"
  ) {
    return { game, error: "Du hast diesen Zug bereits abgeschlossen" };
  }

  const topCard = game.discardPile.at(-1);
  const result = playCard(
    game,
    playerId,
    cardIndex,
    payload.chosenColor,
    isJumpIn,
  );

  if (!result.success) {
    return { game, error: result.message };
  }

  if (isJumpIn) {
    const jumperIndex = game.players.findIndex((p) => p.userId === playerId);
    game.currentPlayerIndex = jumperIndex;
    game.turnState = "played";
  }

  if ((game.hands[playerId] || []).length !== 1) {
    game.unoDeclared[playerId] = false;
  }

  const card = result.playedCard;
  const needsColorChoice = card.value === "wild" || card.value === "+4";
  const needsSwapTarget = game.settings.sevenZero && card.value === 7;

  game.turnState = needsColorChoice ? "choosing_color" : "played";
  game.turnState = needsSwapTarget ? "choosing_swap_target" : game.turnState;

  const steps = applyCardEffect(game, card);

  if (card.value === "+2") {
    game.pendingDraw += 2;
  }

  if (card.value === "+4") {
    game.pendingDraw += 4;
  }

  if (game.settings.sevenZero && card.value === 0) {
    handleZeroRule(game);
  }

  const response = {
    game,
    lastPlayed: card,
    currentPlayer: getCurrentPlayer(game),
    gameUpdated: !needsColorChoice,
  };

  if (topCard.value === 6 && card.value === 7) {
    if (Math.random() < 0.067) {
      response.sixSeven = true;
    }
  }

  if (needsColorChoice) {
    game.previousColor = game.currentColor;
    response.chooseColor = true;
    response.chooseColorReason = card.value;
  } else if (needsSwapTarget) {
    response.chooseSwapTarget = true;
  } else {
    response.currentPlayer = nextTurn(game, steps);
    game.turnState = "idle";
  }

  if (checkWinner(game, playerId)) {
    response.gameOver = true;
    response.winner = getWinnerName(game, playerId);
    handleGameEnd(game, playerId);
  }

  if (!needsColorChoice) game.lastActionAt = Date.now();

  return response;
}

function handleDrawCard(game, action) {
  const { playerId } = action;

  if (game.players[game.currentPlayerIndex]?.userId !== playerId) {
    return { game, error: "Du bist nicht am Zug" };
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
    return { game, error: "Du bist nicht am Zug" };
  }

  if (game.turnState === "choosing_color") {
    return { game, error: "Bitte zuerst eine Farbe wählen" };
  }

  if (game.turnState === "idle") {
    return { game, error: "Du musst eine Karte spielen oder ziehen" };
  }

  if (game.settings.forcePlay && game.turnState === "drawn") {
    const hand = game.hands[playerId];
    const drawnCard = hand[hand.length - 1];
    const topCard = game.discardPile.at(-1);

    if (
      canPlay(
        topCard,
        drawnCard,
        game.currentColor,
        game.settings,
        game.pendingDraw,
      )
    ) {
      return { game, error: "Du musst die gezogene Karte spielen" };
    }
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
    return { game, error: "Du bist nicht am Zug" };
  }

  if (game.turnState !== "choosing_color") {
    return { game, error: "Du bist nicht am Zug" };
  }

  game.lastActionAt = Date.now();

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
    if (!game.settings.drawStacking || !game.settings.wildOnWild) {
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
  const GRACE_PERIOD_MS = 1500;

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
  const GRACE_PERIOD_MS = 1500;

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

function handleCancelColorChoice(game, action) {
  const { playerId } = action;

  if (game.players[game.currentPlayerIndex]?.userId !== playerId) {
    return { game, error: "Du bist nicht am Zug" };
  }

  if (game.turnState !== "choosing_color") {
    return { game, error: "Du bist nicht am Zug" };
  }

  const cancelledCard = game.discardPile.pop();

  if (cancelledCard) {
    if (!game.hands[playerId]) game.hands[playerId] = [];
    game.hands[playerId].push(cancelledCard);

    if (cancelledCard.value === "+4") {
      game.pendingDraw -= 4;
    }

    if (game.previousColor) {
      game.currentColor = game.previousColor;
      delete game.previousColor;
    }
  }

  game.turnState = "idle";
  game.lastActionAt = Date.now();

  return {
    game,
    gameUpdated: true,
  };
}

function handleChooseSwapTarget(game, action) {
  const { playerId, payload = {} } = action;
  const { targetId } = payload;

  if (game.players[game.currentPlayerIndex]?.userId !== playerId) {
    return { game, error: "Du bist nicht am Zug" };
  }

  if (game.turnState !== "choosing_swap_target") {
    return { game, error: "Du bist nicht am Zug" };
  }

  if (!targetId || !game.hands[targetId]) {
    return { game, error: "Ungültiger Tauschpartner" };
  }

  const myHand = [...game.hands[playerId]];
  const targetHand = [...game.hands[targetId]];

  game.hands[playerId] = targetHand;
  game.hands[targetId] = myHand;

  game.lastActionAt = Date.now();

  if (checkWinner(game, playerId) || checkWinner(game, targetId)) {
    const winnderId = checkWinner(game, playerId) ? playerId : targetId;
    handleGameEnd(game, winnderId);
    return {
      game,
      gameOver: true,
      winner: getWinnerName(game, winnderId),
    };
  }

  game.turnState = "idle";

  return {
    game,
    currentPlayer: nextTurn(game),
    gameUpdated: true,
  };
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

    case "CANCEL_COLOR_CHOICE":
      return handleCancelColorChoice(game, action);

    case "CHOOSE_SWAP_TARGET":
      return handleChooseSwapTarget(game, action);

    default:
      return { game, error: "Unknown action" };
  }
}

function handleGameEnd(game, winnerId) {
  if (game.winnerId) return;
  game.winnerId = winnerId;

  const onlyOnePlayer = game.players.length === 1;

  game.players.forEach((player) => {
    if (onlyOnePlayer) {
      player.placement = 2;
      return;
    }
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
