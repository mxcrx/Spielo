const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { registerSocket } = require('./sockets/socketHandler');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

function startServer(port) {
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: '*',
        },
    });

    io.on("connection", (socket) => {
        registerSocket(io, socket);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE' && port < 3010) {
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

startServer(Number(process.env.PORT) || 3000);