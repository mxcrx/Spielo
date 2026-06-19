const socketUrl =
  window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin;

let savedUserId = localStorage.getItem("spielo_userId");
let savedToken = localStorage.getItem("spielo_token");

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
let currentProfileData = null;
let isFriendsMenuOpen = false;
let currentFriends = [];
let currentFriendRequests = [];

function showScreen(screenId) {
  const screens = [
    "loginScreen",
    "lobbyScreen",
    "roomScreen",
    "gameScreen",
    "profileScreen",
  ];
  currentScreen = screenId;
  screens.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.hidden = id !== screenId;
    }
  });

  const chatContainer = document.getElementById("chatContainer");
  if (chatContainer) {
    chatContainer.hidden =
      screenId !== "gameScreen" && screenId !== "roomScreen";
  }

  const playersContainer = document.getElementById("playersContainer");
  if (playersContainer) {
    playersContainer.hidden =
      screenId === "loginScreen" ||
      screenId === "lobbyScreen" ||
      screenId === "profileScreen";
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
  showStatus(`Eingeloggt als ${user.username}`, "green");
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
  showStatus(`Eingeloggt als ${user.username}`, "green");
});

socket.on("session_ready", (data) => {
  if (data.currentRoomId) {
    currentRoom = data.currentRoomId;
  }

  const guestNameInput = document.getElementById("guestNameInput");
  if (guestNameInput && data.username) {
    guestNameInput.value = data.username === "Gast" ? "" : data.username;
  }

  if (!myUserId && !savedToken) {
    myUserId = data.userId;
    if (data.currentRoomId) {
      localStorage.setItem("spielo_userId", data.userId);
      savedUserId = data.userId;
      showScreen("lobbyScreen");
    } else {
      localStorage.removeItem("spielo_userId");
      savedUserId = null;
      if (guestNameInput) {
        guestNameInput.value = "";
      }
      showScreen("loginScreen");
      showStatus("Bitte anmelden");
    }
  }
});

socket.on("room_created", (data) => {
  currentRoom = data.roomId;
  document.getElementById("roomCodeDisplay").innerText = currentRoom;
  showStatus("Raum erstellt");
  showScreen("roomScreen");

  toggleRoomHostUi(data.room);

  if (data.room && data.room.players) {
    renderPlayersList(data.room.players, null, {});
  }
});

socket.on("room_updated", (room) => {
  currentRoom = room.id;
  document.getElementById("roomCodeDisplay").innerText = room.id;
  showStatus("Im Warteraum");
  showScreen("roomScreen");

  toggleRoomHostUi(room);

  renderPlayersList(room.players, null, {});
});

socket.on("error_message", (msg) => {
  showStatus(msg, "red");
});

socket.on("game_started", (game) => {
  currentRoom = game?.roomId || currentRoom;
  currentGame = game?.game || game;
  hideWinner();
  showScreen("gameScreen");
  showStatus("Spiel gestartet");

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

  currentPlayerId = data.currentPlayer || currentPlayerId;

  renderHand(currentGame.hands[myUserId] || []);
  renderTopCard(currentGame.discardPile.at(-1));
  renderPlayersList(currentGame.players, currentPlayerId, currentGame.hands);
  updateTurnIndicator(currentPlayerId);
  updateUnoButtons();
});

socket.on("game_over", (data) => {
  document.getElementById("colorPicker").style.display = "none";
  showWinner(data.winner);

  showStatus("Spiel beendet");
  setTimeout(() => {
    hideWinner();

    showScreen("roomScreen");
    showStatus("Im Warteraum");

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
  }, 3000);
});

socket.on("profile_data", (data) => {
  currentProfileData = data;
  document.getElementById("profDisplayName").innerText = data.displayName;
  document.getElementById("profUsername").innerText = data.username;
  document.getElementById("profBio").innerText =
    data.bio || "Keine Bio eingetragen.";
  document.getElementById("profTotalGames").innerText = data.totalGames;
  document.getElementById("profTotalWins").innerText = data.totalWins;
  document.getElementById("profTotalPlaytime").innerText =
    data.totalPlaytime || formatPlaytime(data.totalPlaytimeSeconds);
  renderAvatarElement(
    document.getElementById("profAvatar"),
    data.avatarUrl,
    data.displayName || data.username,
  );

  const date = new Date(data.memberSince);
  document.getElementById("profMemberSince").innerText =
    date.toLocaleDateString("de-DE");

  showScreen("profileScreen");
});

socket.on("profile_update_success", (updatedData) => {
  currentProfileData = {
    ...(currentProfileData || {}),
    ...updatedData,
  };
  document.getElementById("profDisplayName").innerText =
    updatedData.displayName;
  document.getElementById("profBio").innerText =
    updatedData.bio || "Keine Bio eingetragen.";
  renderAvatarElement(
    document.getElementById("profAvatar"),
    updatedData.avatarUrl,
    updatedData.displayName || updatedData.username,
  );

  toggleProfileEdit(false);
  showStatus("Profil erfolgreich aktualisiert!", "green");
});

socket.on("chat_message", appendChatMessage);

socket.on("chat_history", (msgs) => {
  const container = document.getElementById("chatMessages");
  if (container) {
    container.innerHTML = "";
    msgs.forEach(appendChatMessage);
  }
});

socket.on("friends_data", (data) => {
  currentFriends = data.friends || [];
  currentFriendRequests = data.requests || [];

  renderFriendsList();
  renderFriendRequests();
  updateRequestBadge();
});

socket.on("friend_action_result", (msg) => {
  showStatus(msg.text, msg.success ? "green" : "red");
});

socket.on("friend_invite", (data) => {
  showInviteToast(data.inviterName, data.roomId);
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

function showStatus(msg, color = "white", duration = 1500) {
  const status = document.getElementById("status");
  if (!status) return;

  status.innerText = msg;
  status.style.color = color;

  if (statusResetTimer) {
    clearTimeout(statusResetTimer);
  }

  status.classList.add("show");
  if (duration > 0) {
    statusResetTimer = setTimeout(() => {
      status.classList.remove("show");

      setTimeout(() => status.style.removeProperty("color"), 400);
    }, duration);
  }
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

function getAvatarInitials(name) {
  const cleanName = (name || "").trim();
  if (!cleanName) {
    return "?";
  }

  const words = cleanName.split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase());
  return initials.join("") || cleanName.slice(0, 2).toUpperCase();
}

function renderAvatarElement(element, avatarUrl, name) {
  if (!element) return;

  const initials = getAvatarInitials(name);
  const safeUrl = typeof avatarUrl === "string" ? avatarUrl.trim() : "";

  element.classList.toggle("has-avatar", Boolean(safeUrl));
  element.style.backgroundImage = safeUrl
    ? `url("${safeUrl.replace(/"/g, '\\"')}")`
    : "none";
  element.textContent = safeUrl ? "" : initials;
}

function renderPlayersList(players, currentPlayer, hands = {}) {
  const div = document.getElementById("players");
  div.innerHTML = "";

  players.forEach((p) => {
    const el = document.createElement("div");
    el.className = "player";
    const playerName = p.displayName || p.username || "Spieler";
    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    renderAvatarElement(avatar, p.avatarUrl, playerName);

    const content = document.createElement("div");
    content.className = "player-content";

    const hasHandInfo = hands && hands[p.userId];
    if (hasHandInfo) {
      let playerText = `${playerName} - ${hands[p.userId].length} Karten`;
      if (
        currentGame &&
        currentGame.unoDeclared &&
        currentGame.unoDeclared[p.userId]
      ) {
        playerText += " - UNO!";
      }
      content.innerText = playerText;
    } else {
      content.innerText = playerName;
    }

    if (p.userId === currentPlayer) {
      el.classList.add("active");
    }

    el.appendChild(avatar);
    el.appendChild(content);
    div.appendChild(el);
  });
}

function selectColor(color) {
  document.getElementById("colorPicker").style.display = "none";

  sendGameAction("CHOOSE_COLOR", { color });
}

function cancelColorChoice() {
  document.getElementById("colorPicker").style.display = "none";

  sendGameAction("CANCEL_COLOR_CHOICE", {});
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

function formatPlaytime(totalSeconds) {
  const safeSeconds = Number(totalSeconds) || 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} Min`;
  }

  if (minutes === 0) {
    return `${hours} Std`;
  }

  return `${hours} Std ${minutes} Min`;
}

function toggleRoomHostUi(room) {
  const isHost = room?.host === myUserId;
  const startButton = document.getElementById("startGameButton");
  const startHint = document.getElementById("roomStartHint");
  const friendButton = document.getElementById("friendInviteButton");

  if (startButton) startButton.hidden = !isHost;
  if (startHint) startHint.hidden = !isHost;
  if (friendButton) friendButton.hidden = !isHost;
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
    const playerName =
      player?.displayName || player?.username || "Ein Anderer Spieler";
    indicator.textContent = `${playerName} ist am Zug...`;
    indicator.className = "turn-indicator other-turn";
  }
}

function callUno() {
  sendGameAction("CALL_UNO", {}, { allowWhenNotCurrent: true });
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

  if (myHand.length === 1 && !unoDeclared[myUserId]) {
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
  showStatus("Raum verlassen");
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

  const guestNameInput = document.getElementById("guestNameInput");
  if (guestNameInput && user.username) {
    guestNameInput.value = user.username === "Gast" ? "" : user.username;
  }

  showScreen("lobbyScreen");
  const username = user.username || "Gast";
  showStatus(`Temporär eingeloggt als ${username}`);
});

function logout() {
  localStorage.removeItem("spielo_token");
  localStorage.removeItem("spielo_userId");
  savedUserId = null;
  savedToken = null;
  myUserId = null;
  currentRoom = null;
  currentGame = null;
  currentPlayerId = null;
  socket.auth = { userId: null };
  socket.disconnect();
  socket.connect();
  showScreen("loginScreen");
  showStatus("Erfolgreich abgemeldet");
  document.getElementById("usernameInput").value = "";
  document.getElementById("passwordInput").value = "";
  document.getElementById("guestNameInput").value = "";
}

function loadAndShowProfile(userId = null) {
  const idToLoad = userId || myUserId;
  if (!idToLoad) return;

  socket.emit("get_profile", idToLoad);
}

function toggleProfileEdit(idEditing) {
  document.getElementById("profileViewMode").hidden = idEditing;
  document.getElementById("profileEditMode").hidden = !idEditing;

  if (idEditing) {
    document.getElementById("editDisplayName").value =
      document.getElementById("profDisplayName").innerText;
    const currentBio = document.getElementById("profBio").innerText;
    document.getElementById("editBio").value =
      currentBio === "Keine Bio eingetragen." ? "" : currentBio;
    document.getElementById("editAvatarUrl").value =
      currentProfileData?.avatarUrl || "";
  }
}

function saveProfileChanges() {
  const newDisplayName = document
    .getElementById("editDisplayName")
    .value.trim();
  const newBio = document.getElementById("editBio").value.trim();
  const newAvatarUrl = document.getElementById("editAvatarUrl").value.trim();

  if (!newDisplayName) {
    showStatus("Der Anzeigename darf nicht leer sein.", "red");
    return;
  }

  if (newAvatarUrl) {
    const avatarRegex = /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i;
    if (!avatarRegex.test(newAvatarUrl)) {
      showStatus(
        "Ungültige Avatar-URL. Verwende https://...jpg/png/webp.",
        "red",
      );
      return;
    }
  }

  socket.emit("update_profile", {
    displayName: newDisplayName,
    bio: newBio,
    avatarUrl: newAvatarUrl,
  });
}

function exitProfileScreen() {
  toggleProfileEdit(false);
  showScreen("lobbyScreen");
}

function escapeHtml(unsafe) {
  return (unsafe || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appendChatMessage(msg) {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  const div = document.createElement("div");
  div.className = "chat-message" + (msg.isSystem ? " chat-system" : "");

  const timeStr = new Date(msg.timestamp).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const timeHtml = `<span class="chat-time">[${timeStr}]</span>`;
  const senderHtml = msg.isSystem
    ? `<span class="chat-sender">* ${escapeHtml(msg.sender)}</span>`
    : `<span class="chat-sender"> ${escapeHtml(msg.sender)}:</span>`;
  const textHtml = `<span class="chat-text"> ${escapeHtml(msg.text)}</span>`;

  div.innerHTML = msg.isSystem
    ? `${senderHtml}${textHtml}`
    : `${timeHtml}${senderHtml}${textHtml}`;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function toggleChat() {
  const chatContainer = document.getElementById("chatContainer");
  if (!chatContainer) return;

  chatContainer.classList.toggle("collapsed");

  if (!chatContainer.classList.contains("collapsed")) {
    const messages = document.getElementById("chatMessages");
    if (messages) {
      messages.scrollTop = messages.scrollHeight;
    }
  }
}

function toggleFriendsMenu() {
  const overlay = document.getElementById("friendsOverlay");
  isFriendsMenuOpen = !isFriendsMenuOpen;
  overlay.hidden = !isFriendsMenuOpen;

  if (isFriendsMenuOpen) {
    switchFriendsTab("list");
    if (myUserId && !isNaN(Number(myUserId))) {
      socket.emit("get_friends_data");
    } else {
      const listContainer = document.getElementById("friendsListContainer");
      if (listContainer) {
        listContainer.innerHTML = `<p style="opacity: 0.5; text-align: center; padding: 10px;">Melde dich an, um das Freundesystem zu nutzen!</p>`;
      }
      const requestsContainer = document.getElementById(
        "friendRequestsContainer",
      );
      if (requestsContainer) {
        requestsContainer.innerHTML = `<p style="opacity: 0.5; text-align: center; padding: 10px;">Melde dich an, um das Freundesystem zu nutzen!</p>`;
      }
    }
  }
}

function switchFriendsTab(tab) {
  const listContainer = document.getElementById("friendsListContainer");
  const requestsContainer = document.getElementById("friendRequestsContainer");
  const tabBtns = document.querySelectorAll(".tab-btn");

  if (!listContainer || !requestsContainer || tabBtns.length < 2) return;

  tabBtns[0].classList.toggle("active", tab === "list");
  tabBtns[1].classList.toggle("active", tab === "requests");

  listContainer.style.display = tab === "list" ? "block" : "none";
  requestsContainer.style.display = tab === "requests" ? "block" : "none";
}

function sendFriendRequest() {
  const input = document.getElementById("friendSearchInput");
  const targetUsername = input.value.trim();

  if (!targetUsername) return;

  socket.emit("send_friend_request", targetUsername);
  input.value = "";
}

function acceptFriendRequest(requesterId) {
  socket.emit("accept_friend_request", requesterId);
}

function declineFriendRequest(requesterId) {
  socket.emit("decline_friend_request", requesterId);
}

function removeFriend(friendId) {
  if (confirm("Möchtest du diesen Freund wirklich entfernen?")) {
    socket.emit("remove_friend", friendId);
  }
}

function renderFriendsList() {
  const container = document.getElementById("friendsListContainer");
  if (!container) return;

  container.innerHTML = "";

  if (currentFriends.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.innerText = "Du hast noch keine Freunde hinzugefügt.";
    container.appendChild(empty);
    return;
  }

  currentFriends.forEach((friend) => {
    const isOnline = !!friend.isOnline;

    const item = document.createElement("div");
    item.className = "friend-item";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "10px";

    const avatar = document.createElement("div");
    avatar.className = "friend-avatar";

    const name = friend.displayName || friend.username || "Unbekannt";
    renderAvatarElement(avatar, friend.avatarUrl, name);

    const info = document.createElement("div");
    info.style.display = "flex";
    info.style.alignContent = "center";
    info.style.gap = "5px";

    const nameEl = document.createElement("strong");
    nameEl.className = "friend-name";
    nameEl.innerText = name;
    nameEl.title = name;

    const statusDot = document.createElement("span");
    statusDot.className = "status-dot";
    statusDot.style.backgroundColor = isOnline ? "#00e676" : "#555";

    info.appendChild(nameEl);
    info.appendChild(statusDot);

    left.appendChild(avatar);
    left.appendChild(info);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "5px";

    if (isOnline && currentRoom) {
      const inviteBtn = document.createElement("button");
      inviteBtn.className = "blueButton friend-btn";
      inviteBtn.title = "Zum Spiel einladen";
      inviteBtn.innerText = "Einladen";
      inviteBtn.onclick = () => {
        if (!currentRoom) return;
        socket.emit("invite_friend", friend.userId);
      };
      actions.appendChild(inviteBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-friend-btn";
    removeBtn.title = "Freund entfernen";
    removeBtn.innerText = "✖";
    removeBtn.onclick = () => removeFriend(friend.userId);

    actions.appendChild(removeBtn);

    item.appendChild(left);
    item.appendChild(actions);

    container.appendChild(item);
  });
}

function renderFriendRequests() {
  const container = document.getElementById("friendRequestsContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!currentFriendRequests || currentFriendRequests.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.innerText = "Keine offenen Anfragen.";
    container.appendChild(empty);
    return;
  }

  currentFriendRequests.forEach((req) => {
    const item = document.createElement("div");
    item.className = "friend-item";

    const avatar = document.createElement("div");
    avatar.className = "friend-avatar";
    const name = req.username || req.displayName || "Spieler";
    renderAvatarElement(avatar, req.avatarUrl, name);

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "10px";

    const text = document.createElement("div");
    text.innerHTML = `<strong>${escapeHtml(name)}</strong> möchte dein Freund sein.`;

    left.appendChild(avatar);
    left.appendChild(text);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "5px";

    const acceptBtn = document.createElement("button");
    acceptBtn.className = "greenButton friend-btn";
    acceptBtn.innerText = "✔";
    acceptBtn.onclick = () => acceptFriendRequest(req.userId);

    const declineBtn = document.createElement("button");
    declineBtn.className = "redButton friend-btn";
    declineBtn.innerText = "✖";
    declineBtn.onclick = () => declineFriendRequest(req.userId);

    actions.appendChild(acceptBtn);
    actions.appendChild(declineBtn);

    item.appendChild(left);
    item.appendChild(actions);

    container.appendChild(item);
  });
}

function updateRequestBadge() {
  const badge = document.getElementById("requestBadge");
  if (!badge) return;

  const count = currentFriendRequests.length;
  if (count > 0) {
    badge.innerText = count;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function showInviteToast(inviterName, roomId) {
  const container = document.getElementById("inviteToastConatiner");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "invite-toast";
  toast.innerHTML = `
    <p style="margin: 0 0 10px 0;"><strong>${escapeHtml(inviterName)}</strong> lädt dich ein!<br>
    <span style="opacity: 0.7; font-size: 0.9em;">Raum: ${escapeHtml(roomId)}</span></p>
    <div style="display:flex; gap:10px;">
        <button class="greenButton friend-btn" onclick="acceptInvite('${escapeHtml(roomId)}', this)">Annehmen</button>
        <button class="redButton friend-btn" onclick="this.parentElement.parentElement.remove()">Ablehnen</button>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 15000);
}

function acceptInvite(roomId, btnElement) {
  btnElement.parentElement.parentElement.remove();

  if (isFriendsMenuOpen) toggleFriendsMenu();

  const roomInput = document.getElementById("roomInput");
  if (roomInput) roomInput.value = roomId;

  joinRoom();
}

document.addEventListener("DOMContentLoaded", () => {
  const pwInput = document.getElementById("passwordInput");
  const chatInput = document.getElementById("chatInput");
  const guestNameInput = document.getElementById("guestNameInput");
  const roomInput = document.getElementById("roomInput");
  const friendSearchInput = document.getElementById("friendSearchInput");

  if (pwInput) {
    pwInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") submitLogin();
    });
  }

  if (guestNameInput) {
    guestNameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        continueAsGuest();
      }
    });
  }

  if (roomInput) {
    roomInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") joinRoom();
    });
  }

  if (friendSearchInput) {
    friendSearchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendFriendRequest();
    });
  }

  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && chatInput.value.trim()) {
        socket.emit("chat_message", chatInput.value.trim());
        chatInput.value = "";
      }
    });
  }
});
