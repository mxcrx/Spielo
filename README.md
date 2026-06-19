<div align="center">

# Spielo

**A modern, real-time multiplayer web application to play classic minigames with your friends.**

[![GitHub License](https://img.shields.io/github/license/mxcrx/Spielo?style=for-the-badge&color=blue)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/mxcrx/Spielo?style=for-the-badge&color=gold)](https://github.com/mxcrx/Spielo/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/mxcrx/Spielo?style=for-the-badge&color=red)](https://github.com/mxcrx/Spielo/issues)
[![Node Version](https://img.shields.io/badge/node-%3E%3D%2018.0.0-brightgreen?style=for-the-badge&logo=node.js)](https://nodejs.org)

<br />

## [👉 CLICK HERE FOR LIVE DEMO 👈](https://test.spielo.mxcrx.de/)

<br />

[🪲 Report Bug](https://github.com/mxcrx/Spielo/issues) · [💡 Request Feature](https://github.com/mxcrx/Spielo/issues)

</div>

---

## 📸 Preview

<div align="center">
  <img src="https://via.placeholder.com/800x450.png?text=F%C3%BCge+hier+ein+cooles+Gameplay-GIF+oder+einen+Screenshot+ein!" alt="Spielo Gameplay Preview" width="100%">
</div>

---

## ✨ Features

### 👤 User System

- **Secure Auth:** User creation, login, and stateless **JWT-based authentication**.
- **Rich Profiles:** Customizable display names, custom avatars, bios, and real-time statistics.
- **Playtime Tracking:** Keeps track of how long you've been playing.

### 👥 Social & Friends

- **Friend Lists:** Add, manage, and view your friends' active status.
- **Quick Invites:** Invite friends directly into your game lobby with one click.
- **Overlay Menu:** Quick-access friends sidebar available during gameplay.

### 🏠 Robust Multiplayer Rooms

- **Real-time Sync:** Powered by **Socket.IO** for ultra-low latency actions.
- **Reconnection Handling:** Disconnected? You have a grace period to jump right back in!
- **Auto-Cleanup:** Inactive players and empty rooms are automatically garbage-collected.

### 🎲 Available Minigames

- 🟥 🟦 🟩 🟨 **UNO:** Fully playable with standard rules, special cards, and real-time syncing.
- ⏳ _More minigames coming soon!_

### 🛠 Admin Dashboard

- Complete overview of registered users.
- Data management and application monitoring tools.

---

## 🧰 Tech Stack

| Frontend            | Backend             | Database & Auth          |
| :------------------ | :------------------ | :----------------------- |
| 🌐 HTML / CSS / JS  | 🟢 Node.js          | 🐬 MySQL                 |
| 🔌 Socket.IO Client | 🚀 Express.js       | 🔑 JSON Web Tokens (JWT) |
|                     | 🎛 Socket.IO Server |                          |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18.0.0 or higher)
- **MySQL Server** running locally or via Docker

### 1. Clone the repository

```bash
git clone https://github.com/mxcrx/Spielo.git
cd Spielo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory. You can copy the example configuration:

```bash
cp .env.example .env
```

Open `.env` and fill in your database credentials and a secure JWT secret:

```env
PORT=3000
CORS_ORIGIN=*
HTTP_RATE_LIMIT_LIMIT=100
SOCKET_AUTH_LIMIT=5
SOCKET_MAX_BUFFER_SIZE=8192
RECONNECT_GRACE_TIME_MS=15000

DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=spielo

JWT_SECRET=your_super_long_and_random_secret_key
```

### 4. Database Initialization

Log into your MySQL server and create the database:

```sql
CREATE DATABASE spielo;
```

Then import the schema structure:

```bash
mysql -u your_user -p spielo < server/database/schema.sql
```

## ▶️ Running the Application

```bash
npm start
```

Once started, open your browser and navigate to `http://localhost:3000`

## 🛣 Roadmap & Future Plans

- [ ] Add more minigames (e.g. Blackjack)
- [ ] Global leaderboards and achievements system
- [ ] Detailed match history
- [ ] Direct messaging (DM) system between friends
- [ ] Enhanced profile customization

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
