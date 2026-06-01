const socketUrl =
  window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin;

const savedUserId = localStorage.getItem("spielo_userId");
const savedToken = localStorage.getItem("spielo_token");

const socket = io(socketUrl, {
  auth: {
    userId: savedUserId,
  },
});

let currentRoom = null;
let myUserId = null;
let currentGame = null;
let currentPlayerId = null;
let statusResetTimer = null;
let currentScreen = "loginScreen";

function showScreen(screenId) {
  const screens = ["loginScreen", "lobbyScreen", "roomScreen", "gameScreen"];
  currentScreen = screenId;
  screens.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.hidden = id !== screenId;
    }
  });

  const playersContainer = document.getElementById("playersContainer");
  if (playersContainer) {
    playersContainer.hidden =
      screenId === "loginScreen" || screenId === "lobbyScreen";
  }
}

socket.on("connect", () => {
  if (savedToken) {
    socket.emit("auth_with_token", savedToken);
  }
});

socket.on("auth_success", (user) => {
  myUserId = user.userId;
  if (user.currentRoomId) {
    currentRoom = user.currentRoomId;
  }
  localStorage.setItem("spielo_userId", user.userId);
  showScreen("lobbyScreen");
  document.getElementById("status").innerText =
    `Eingeloggt als ${user.username}`;
});

socket.on("auth_failed", (msg) => {
  localStorage.removeItem("spielo_token");
  showScreen("loginScreen");
  showStatus(msg, "orange");
});

socket.on("login_success", (payload) => {
  const { user, token, currentRoomId } = payload || {};
  localStorage.setItem("spielo_token", token);
  myUserId = user.userId;
  if (currentRoomId) {
    currentRoom = currentRoomId;
  }
  localStorage.setItem("spielo_userId", user.userId);
  showScreen("lobbyScreen");
  document.getElementById("status").innerText =
    `Eingeloggt als ${user.username}`;
});

socket.on("session_ready", (data) => {
  if (data.currentRoomId) {
    currentRoom = data.currentRoomId;
  }

  if (!myUserId && !savedToken) {
    myUserId = data.userId;
    localStorage.setItem("spielo_userId", data.userId);
    showScreen("loginScreen");
    document.getElementById("status").innerText = "Bitte anmelden";
  }
});

socket.on("room_created", (data) => {
  currentRoom = data.roomId;
  document.getElementById("roomCodeDisplay").innerText = currentRoom;
  document.getElementById("status").innerText = "Raum erstellt: ";
  showScreen("roomScreen");

  toggleRoomHostUi(data.room);

  if (data.room && data.room.players) {
    renderPlayersList(data.room.players, null, {});
  }
});

socket.on("room_updated", (room) => {
  currentRoom = room.id;
  document.getElementById("roomCodeDisplay").innerText = room.id;
  document.getElementById("status").innerText = "Im Warteraum";
  showScreen("roomScreen");

  toggleRoomHostUi(room);

  renderPlayersList(room.players, null, {});
});

socket.on("error_message", (msg) => {
  const status = document.getElementById("status");
  const oldText = status.innerText;
  status.innerText = msg;
  status.style.color = "red";

  if (statusResetTimer) {
    clearTimeout(statusResetTimer);
  }

  statusResetTimer = setTimeout(() => {
    status.style.removeProperty("color");
    status.innerText = oldText;
  }, 1500);
});

socket.on("game_started", (game) => {
  currentRoom = game?.roomId || currentRoom;
  currentGame = game?.game || game;
  hideWinner();
  showScreen("gameScreen");
  document.getElementById("status").innerText = "Spiel läuft";

  currentPlayerId =
    currentGame.players[currentGame.currentPlayerIndex]?.userId ||
    currentGame.players[0].userId;

  renderHand(currentGame.hands[myUserId] || []);
  renderTopCard(currentGame.discardPile.at(-1));
  renderPlayersList(currentGame.players, currentPlayerId, currentGame.hands);
  updateTurnIndicator(currentPlayerId);
  updateUnoButtons();
});

socket.on("game_updated", (data) => {
  currentGame = data.game;
  currentRoom = data.roomId || currentRoom;
  showScreen("gameScreen");
  document.getElementById("status").innerText = "Spiel läuft";

  currentPlayerId = data.currentPlayer || currentPlayerId;

  renderHand(currentGame.hands[myUserId] || []);
  renderTopCard(currentGame.discardPile.at(-1));
  renderPlayersList(currentGame.players, currentPlayerId, currentGame.hands);
  updateTurnIndicator(currentPlayerId);
  updateUnoButtons();
});

socket.on("game_over", (data) => {
  showWinner(data.winner);

  document.getElementById("status").innerText = "Spiel beendet";
  setTimeout(() => {
    hideWinner();

    showScreen("roomScreen");
    document.getElementById("status").innerText = "Im Warteraum";

    document.getElementById("hand").innerHTML = "";
    document.getElementById("topCard").innerHTML = "";
    currentGame = null;
  }, 5000);
});

socket.on("choose_color", (data) => {
  const picker = document.getElementById("colorPicker");

  picker.style.display = "flex";
  picker.dataset.reason = data.reason;
});

socket.on("game_aborted", (data) => {
  showStatus(data.message, "orange");
  setTimeout(() => {
    currentGame = null;
    currentRoom = null;
    document.getElementById("players").innerHTML = "";
    showScreen("lobbyScreen");
    document.getElementById("status").innerText = "Bereit";
  }, 3000);
});

function createRoom() {
  socket.emit("create_room");
}

function joinRoom() {
  const code = document.getElementById("roomInput").value.trim().toUpperCase();
  if (code) {
    socket.emit("join_room", code);
  }
}

function startGame() {
  socket.emit("start_game", currentRoom);
}

function sendGameAction(type, payload = {}, options = {}) {
  const { allowWhenNotCurrent = false } = options;

  if (!myUserId || !currentPlayerId) return;

  if (!allowWhenNotCurrent && myUserId !== currentPlayerId) {
    showStatus("Du bist nicht am Zug!", "red");
    return;
  }

  socket.emit("game_action", {
    roomId: currentRoom,
    action: {
      type,
      playerId: myUserId,
      payload,
    },
  });
}

function drawCard() {
  sendGameAction("DRAW_CARD");
}

function endTurn() {
  sendGameAction("END_TURN");
}

function playCard(cardIndex) {
  sendGameAction("PLAY_CARD", { cardIndex });
}

function showStatus(msg, color = "red") {
  const status = document.getElementById("status");
  if (!status) return;
  status.innerText = msg;
  if (statusResetTimer) {
    clearTimeout(statusResetTimer);
  }
  status.style.color = color;
  statusResetTimer = setTimeout(() => {
    status.style.removeProperty("color");
  }, 1500);
}

function renderHand(hand) {
  const handDiv = document.getElementById("hand");
  handDiv.innerHTML = "";

  hand.forEach((card, index) => {
    const div = document.createElement("div");

    div.className = getCardClassName(card);
    div.innerHTML = getCardMarkup(card);

    setTimeout(() => div.classList.add("pop"), 50);

    div.onclick = () => playCard(index);

    handDiv.appendChild(div);
  });
}

function renderTopCard(card) {
  if (!card) return;
  const color = currentGame.currentColor || card.color;
  const extraClass = card.value === "+4" || card.value === "wild" ? "wild" : "";
  const requiredColorClass =
    color && (card.value === "+4" || card.value === "wild")
      ? "required-color"
      : "";
  const requiredColorStyle = color ? `--required-color: ${color};` : "";

  document.getElementById("topCard").innerHTML =
    `<div class="card ${color || ""} ${extraClass} ${requiredColorClass}" style="${requiredColorStyle}">${getCardMarkup(card)}</div>`;
}

function getCardClassName(card) {
  const classes = ["card"];

  if (card.color) {
    classes.push(card.color);
  }

  if (card.value === "+4" || card.value === "wild") {
    classes.push("wild");
  }

  return classes.join(" ");
}

function getCardMarkup(card) {
  if (card.value === "reverse") {
    return `
            <span class="card-symbol card-symbol--reverse" aria-hidden="true"></span>
        `;
  }

  if (card.value === "skip") {
    return `
            <span class="card-symbol card-symbol--skip" aria-hidden="true"></span>
        `;
  }

  if (card.value === "+4") {
    return `
            <span class="card-value">${card.value}</span>
            <span class="card-symbol card-symbol--wild" aria-hidden="true"></span>
        `;
  }

  if (card.value === "wild") {
    return `
            <span class="card-symbol card-symbol--wild" aria-hidden="true"></span>
        `;
  }

  return `<span class="card-value">${card.value}</span>`;
}

function renderPlayersList(players, currentPlayer, hands = {}) {
  const div = document.getElementById("players");
  div.innerHTML = "";

  players.forEach((p) => {
    const el = document.createElement("div");
    el.className = "player";

    const hasHandInfo = hands && hands[p.userId];
    if (hasHandInfo) {
      let playerText = `${p.username} - ${hands[p.userId].length} Karten`;
      if (
        currentGame &&
        currentGame.unoDeclared &&
        currentGame.unoDeclared[p.userId]
      ) {
        playerText += " - UNO!";
      }
      el.innerText = playerText;
    } else {
      el.innerText = p.username;
    }

    if (p.userId === currentPlayer) {
      el.classList.add("active");
    }

    div.appendChild(el);
  });
}

function selectColor(color) {
  document.getElementById("colorPicker").style.display = "none";

  sendGameAction("CHOOSE_COLOR", { color });
}

function showWinner(winner) {
  const banner = document.getElementById("winnerBanner");
  if (!banner) return;

  banner.hidden = false;
  banner.textContent = `Gewinner: ${winner}`;
  banner.classList.add("visible");
}

function hideWinner() {
  const banner = document.getElementById("winnerBanner");
  if (!banner) return;

  banner.hidden = true;
  banner.textContent = "";
  banner.classList.remove("visible");
}

function toggleRoomHostUi(room) {
  const isHost = room?.host === myUserId;
  const startButton = document.getElementById("startGameButton");
  const startHint = document.getElementById("roomStartHint");

  if (startButton) startButton.hidden = !isHost;
  if (startHint) startHint.hidden = !isHost;
}

function updateTurnIndicator(currentPlayerId) {
  const indicator = document.getElementById("turnIndicator");
  if (!indicator || !currentGame) return;

  if (currentPlayerId === myUserId) {
    indicator.textContent = "Du bist am Zug!";
    indicator.className = "turn-indicator my-turn";
  } else {
    const player = currentGame.players.find(
      (p) => p.userId === currentPlayerId,
    );
    indicator.textContent = `${player ? player.username : "Ein Anderer Spieler"} ist am Zug...`;
    indicator.className = "turn-indicator other-turn";
  }
}

function callUno() {
  sendGameAction("CALL_UNO");
}

function challengeUno() {
  sendGameAction("CHALLENGE_UNO", {}, { allowWhenNotCurrent: true });
}

function updateUnoButtons() {
  const unoButton = document.getElementById("unoButton");
  const challengeUnoButton = document.getElementById("challengeUnoButton");
  if (!unoButton || !challengeUnoButton || !currentGame) return;

  const myHand = currentGame.hands[myUserId] || [];
  const unoDeclared = currentGame.unoDeclared || {};

  if (myHand.length > 0 && myHand.length <= 2 && !unoDeclared[myUserId]) {
    unoButton.style.display = "inline-block";
  } else {
    unoButton.style.display = "none";
  }

  let showChallenge = false;
  currentGame.players.forEach((p) => {
    if (p.userId !== myUserId) {
      const otherHand = currentGame.hands[p.userId] || [];
      if (otherHand.length === 1 && !unoDeclared[p.userId]) {
        showChallenge = true;
      }
    }
  });

  if (showChallenge) {
    challengeUnoButton.style.display = "inline-block";
  } else {
    challengeUnoButton.style.display = "none";
  }
}

function leaveRoom() {
  socket.emit("leave_room", currentRoom);
  currentRoom = null;
  currentGame = null;
  showScreen("lobbyScreen");
  document.getElementById("status").innerText = "Bereit";
}

function submitLogin() {
  const u = document.getElementById("usernameInput").value.trim();
  const p = document.getElementById("passwordInput").value;
  if (u && p) socket.emit("login", { username: u, password: p });
}

function submitRegister() {
  const u = document.getElementById("usernameInput").value.trim();
  const p = document.getElementById("passwordInput").value;
  if (u && p) socket.emit("register", { username: u, password: p });
}

function continueAsGuest() {
  const guestNameEl = document.getElementById("guestNameInput");
  const name = guestNameEl ? guestNameEl.value.trim() : "";

  socket.emit("set_guest_name", name);
}

socket.on("guest_name_set", (data) => {
  const user = data || {};
  myUserId = user.userId || myUserId;
  if (myUserId) localStorage.setItem("spielo_userId", myUserId);

  showScreen("lobbyScreen");
  const username = user.username || "Gast";
  document.getElementById("status").innerText =
    `Temporär eingeloggt als ${username}`;
});

function logout() {
  localStorage.removeItem("spielo_token");
  socket.disconnect();
  socket.connect();
  showScreen("loginScreen");
  document.getElementById("status").innerText = "Erfolgreich abgemeldet";
  document.getElementById("usernameInput").value = "";
  document.getElementById("passwordInput").value = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const pwInput = document.getElementById("passwordInput");
  if (pwInput) {
    pwInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") submitLogin();
    });
  }
});
