const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["*"]
    },
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    pingTimeout: 120000,
    pingInterval: 10000,
    connectTimeout: 60000,
    maxHttpBufferSize: 1e8,
    allowUpgrades: true,
    perMessageDeflate: true,
    httpCompression: true,
    upgradeTimeout: 30000,
    destroyUpgrade: false,
    path: '/socket.io/',
    serveClient: true
});

// Import original server structures
const Server = require('./server/structures/Server');
const Socket = require('./server/structures/Socket');
const Participant = require('./server/structures/Participant');
const Room = require('./server/structures/Room');
const ParticipantRoom = require('./server/structures/ParticipantRoom');
const WebSocket = require('ws');

// Enable CORS for all routes with specific options
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Add health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Serve static files
app.use(express.static(__dirname));

// Create WebSocket server instance
const wsServer = new Server();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Keep alive mechanism
    let keepAliveInterval = setInterval(() => {
        if (socket.connected) {
            socket.emit('ping');
        }
    }, 10000);
    
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
        on: socket.on.bind(socket)
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
        socketWrapper.emit('message', data);
    });

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'Reason:', reason);
        clearInterval(keepAliveInterval);
        socketWrapper.emit('close');
        wsServer.sockets.delete(socketWrapper);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        socketWrapper.emit('error', error);
    });

    socket.on('pong', () => {
        socketWrapper.emit('pong');
        socket.emit('pong_response');
    });

    // Handle reconnection attempts
    socket.on('reconnect_attempt', () => {
        console.log('Client attempting to reconnect:', socket.id);
    });

    socket.on('reconnect', () => {
        console.log('Client reconnected:', socket.id);
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