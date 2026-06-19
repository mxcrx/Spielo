const socketUrl =
  window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin;
let socket = null;
let adminUserList = [];

function verifyAdmin() {
  const token = localStorage.getItem("spielo_token");
  const userId = localStorage.getItem("spielo_userId");

  if (!token || !userId) {
    document.getElementById("adminStatus").innerText =
      "Du bist auf der Hauptseite nicht eingeloggt!";
    return;
  }

  socket = io(socketUrl, {
    auth: { userId },
  });

  socket.on("connect", () => {
    socket.emit("auth_with_token", token);
  });

  socket.on("auth_success", (userData) => {
    const user = userData.user ? userData.user : userData;
    const role = user.role;

    console.log("empfangene Benutzerdaten:", user);
    if (role !== "admin") {
      document.getElementById("adminStatus").innerText =
        "Du hast keine Admin-Rechte!";
      socket.disconnect();
      return;
    }

    socket.emit("admin_get_users");
  });

  socket.on("admin_users_data", (users) => {
    document.getElementById("adminLogin").style.display = "none";
    document.getElementById("adminDashboard").style.display = "block";

    adminUserList = users;
    renderAdminTable(users);
  });

  socket.on("admin_message", (message) => {
    alert(message);
  });
}

function renderAdminTable(users) {
  const tBody = document.getElementById("adminUserTableBody");
  tBody.innerHTML = "";

  users.forEach((user) => {
    const tr = document.createElement("tr");
    const newRole = user.role === "admin" ? "user" : "admin";
    const isBanned = !!user.is_banned;

    tr.innerHTML = `
        <td>${user.id}</td>
            <td><strong>${escapeHtml(user.username)}</strong></td>
            <td><span style="color: ${user.role === "admin" ? "#f1c40f" : "#ccc"}">${user.role}</span></td>
            <td><span style="color: ${isBanned ? "#ff3b3b" : "#2ecc71"}">${isBanned ? "Gebannt" : "Aktiv"}</span></td>
            <td>
                <button class="yellowButton" style="padding: 5px 10px; font-size:0.85em;" onclick="updateAdminUser(${user.id}, '${newRole}', ${isBanned})">
                    Setze ${newRole === "admin" ? "Admin" : "User"}
                </button>
                <button class="${isBanned ? "greenButton" : "redButton"}" style="padding: 5px 10px; font-size:0.85em;" onclick="updateAdminUser(${user.id}, '${user.role}', ${!isBanned})">
                    ${isBanned ? "Entbannen" : "Bannen"}
                </button>
            </td>
        `;
    tBody.appendChild(tr);
  });
}

function updateAdminUser(userId, newRole, newBannedStatus) {
  if (confirm("Nutzerrechte wirklich ändern?")) {
    socket.emit("admin_update_user", {
      userId,
      role: newRole,
      is_banned: newBannedStatus,
    });
  }
}

function filterAdminUsers() {
  const query = document.getElementById("adminSearchInput").value.toLowerCase();
  const filtered = adminUserList.filter(
    (u) =>
      u.username.toLowerCase().includes(query) || u.id.toString() === query,
  );
  renderAdminTable(filtered);
}

function logoutAdmin() {
  if (socket) socket.disconnect();
  window.location.href = "/";
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
