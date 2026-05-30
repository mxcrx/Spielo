const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const config = require("./config");
const { registerSocket } = require("./sockets/socketHandler");
const {
  createHttpRateLimiter,
  createSocketAuthLimiter,
} = require("./utils/rateLimit");

const app = express();
app.use(
  cors({
    origin: config.corsOrigin,
  }),
);
app.use(createHttpRateLimiter({ limit: config.httpRateLimit }));
app.use(express.static(path.join(__dirname, "..", "client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "index.html"));
});

function startServer(port) {
  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: config.socketMaxBufferSize,
    cors: {
      origin: config.corsOrigin,
    },
  });

  const checkSocketAuth = createSocketAuthLimiter({
    limit: config.socketAuthLimit,
  });

  io.use((socket, next) => {
    const result = checkSocketAuth(socket);

    if (!result.allowed) {
      const error = new Error(
        "Too many authentication attempts. Please try again in 15 minutes.",
      );
      error.data = {
        retryAfterMs: result.retryAfterMs,
      };
      return next(error);
    }

    return next();
  });

  io.on("connection", (socket) => {
    registerSocket(io, socket);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < 3010) {
      console.log(`Port ${port} belegt, versuche ${port + 1}...`);
      startServer(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
  });
}

startServer(config.port);
