const socketUrl = window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin;

const socket = io(socketUrl);

let currentRoom = null;
let mySocketId = null;
let currentGame = null;
let currentPlayerId = null;

socket.on("connect", () => {
    mySocketId = socket.id;
});

socket.on("room_created", (data) => {
    currentRoom = data.roomId;
    document.getElementById("status").innerText =
        "Raum erstellt: " + currentRoom;
});

socket.on("room_updated", (room) => {
    currentRoom = room.id;
    document.getElementById("status").innerText =
        "Spieler im Raum: " + room.players.length;
});

socket.on("error_message", (msg) => {
    const status = document.getElementById("status");
    status.innerText = msg;
    status.style.color = "red";

    setTimeout(() => {
        status.style.color = "white";
    }, 1500);
});

socket.on("game_started", (game) => {
    currentGame = game;
    hideWinner();

    currentPlayerId = game.players[game.currentPlayerIndex]?.id || game.players[0].id;

    renderHand(game.hands[socket.id]);
    renderTopCard(game.discardPile.at(-1));
    renderPlayers(game, currentPlayerId);
});

socket.on("game_updated", (data) => {
    currentGame = data.game;

    currentPlayerId = data.currentPlayer || currentPlayerId;

    renderHand(currentGame.hands[socket.id]);
    renderTopCard(currentGame.discardPile.at(-1));
    renderPlayers(currentGame, currentPlayerId);
});

socket.on("game_over", (data) => {
    showWinner(data.winner);
});

socket.on("choose_color", (data) => {
    const picker = document.getElementById("colorPicker");

    picker.style.display = "flex";
    picker.dataset.reason = data.reason;
});

socket.on("game_aborted", (data) => {
  showStatus(data.message, "orange");
});

function createRoom() {
    socket.emit("create_room");
}

function joinRoom() {
    socket.emit("join_room", document.getElementById("roomInput").value);
}

function startGame() {
    socket.emit("start_game", currentRoom);
}

function sendGameAction(type, payload = {}) {
    if (!mySocketId || !currentPlayerId) return;

    if (mySocketId !== currentPlayerId) {
        showStatus("Du bist nicht am Zug!", "red");
        return;
    }

    socket.emit("game_action", {
        roomId: currentRoom,
        action: {
            type,
            playerId: socket.id,
            payload
        }
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
    const prev = status.style.color;
    status.style.color = color;
    setTimeout(() => {
        status.style.color = prev || "white";
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
    const color = currentGame.currentColor || card.color;
    const extraClass = (card.value === "+4" || card.value === "wild") ? "wild" : "";
    const requiredColorClass = color && (card.value === "+4" || card.value === "wild") ? "required-color" : "";
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

function renderPlayers(game, currentPlayer) {
    const div = document.getElementById("players");
    div.innerHTML = "";

    game.players.forEach(p => {
        const el = document.createElement("div");

        el.className = "player";
        el.innerText = `${p.name} - ${game.hands[p.id]?.length || 0}`;

        if (p.id === currentPlayer) {
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