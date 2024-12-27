const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').Server(app);
const path = require('path');
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
    reconnectionDelayMax: 5000,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e8,
    path: '/socket.io'
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

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.mp3')) {
            res.setHeader('Content-Type', 'audio/mpeg');
        } else if (path.endsWith('.wav')) {
            res.setHeader('Content-Type', 'audio/wav');
        }
    }
}));

// Root route redirect
app.get('/', (req, res) => {
    res.redirect('/piano/lobby');
});

// Specific route for worker file
app.get('/piano/workerTimer.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'workerTimer.js'));
});

// Handle room routes
app.get('/piano/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Catch-all route for piano URLs
app.get('/piano/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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

    // Store client ID
    socket.clientId = socket.handshake.query.clientId;
    
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
            try {
                const msg = JSON.parse(data);
                if (msg[0] && msg[0].m === "hi") {
                    socket.clientId = msg[0].clientId;
                }
                wsServer.handleData(socketWrapper, msg);
            } catch (err) {
                console.error('Error processing message:', err);
            }
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'Reason:', reason);
        // Don't immediately remove the socket from the server
        setTimeout(() => {
            if (!socket.connected) {
                socketWrapper.emit('close');
                wsServer.sockets.delete(socketWrapper);
            }
        }, 5000); // Give 5 seconds for potential reconnection
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        socketWrapper.emit('error', error);
    });

    socket.on('reconnect_attempt', () => {
        socket.io.opts.query = {
            clientId: socket.clientId
        };
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Client reconnected:', socket.id, 'Attempt:', attemptNumber);
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