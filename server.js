const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

// Import original server structures
const Server = require('./server/structures/Server');
const Socket = require('./server/structures/Socket');
const Participant = require('./server/structures/Participant');
const Room = require('./server/structures/Room');
const ParticipantRoom = require('./server/structures/ParticipantRoom');
const WebSocket = require('ws');

// Enable CORS for all routes
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// Handle room routes
app.get('/piano/:roomId', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Create WebSocket server instance
const wsServer = new Server();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Create a WebSocket-like wrapper for Socket.IO
    const wsWrapper = {
        readyState: WebSocket.OPEN,
        send: (data, cb) => {
            if (socket.connected) {
                socket.send(data);
                if (cb) cb();
            }
        },
        ping: (noop) => {
            if (socket.connected) {
                socket.emit('ping');
                if (noop) noop();
            }
        },
        emit: socket.emit.bind(socket),
        on: socket.on.bind(socket),
        terminate: () => {
            socket.disconnect(true);
        }
    };

    // Create a Socket wrapper instance
    const socketWrapper = new Socket(wsServer, wsWrapper, {
        headers: {
            'x-forwarded-for': socket.handshake.address
        },
        connection: {
            remoteAddress: socket.handshake.address
        }
    });

    wsServer.sockets.add(socketWrapper);

    socket.on('message', (data) => {
        if (socket.connected) {
            socketWrapper.emit('message', data);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'Reason:', reason);
        socketWrapper.emit('close');
        wsServer.sockets.delete(socketWrapper);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        socketWrapper.emit('error', error);
    });

    socket.on('pong', () => {
        socketWrapper.emit('pong');
    });

    // Handle reconnection
    socket.on('reconnect', (attemptNumber) => {
        console.log('Client reconnected:', socket.id, 'Attempt:', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
        console.error('Reconnection error:', error);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Internal Server Error');
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 