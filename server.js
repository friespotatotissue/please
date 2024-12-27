const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
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

// Handle piano room routes
app.get('/piano', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/piano/:room', (req, res) => {
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
            try {
                socket.send(data);
                if (cb) cb();
            } catch (err) {
                console.error('Send error:', err);
            }
        },
        ping: (noop) => {
            try {
                socket.emit('ping');
                if (noop) noop();
            } catch (err) {
                console.error('Ping error:', err);
            }
        },
        emit: socket.emit.bind(socket),
        on: socket.on.bind(socket),
        terminate: () => socket.disconnect(true)
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

    // Handle incoming messages
    socket.on('message', (data) => {
        try {
            // Parse message if it's a string
            const message = typeof data === 'string' ? JSON.parse(data) : data;
            socketWrapper.emit('message', JSON.stringify(message));
        } catch (err) {
            console.error('Message handling error:', err);
        }
    });

    // Handle special messages
    socket.on('userset', (data) => {
        try {
            socketWrapper.emit('message', JSON.stringify([{
                m: 'userset',
                set: data
            }]));
        } catch (err) {
            console.error('Userset error:', err);
        }
    });

    socket.on('chset', (data) => {
        try {
            socketWrapper.emit('message', JSON.stringify([{
                m: 'chset',
                set: data
            }]));
        } catch (err) {
            console.error('Chset error:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        try {
            socketWrapper.emit('close');
            wsServer.sockets.delete(socketWrapper);
        } catch (err) {
            console.error('Disconnect error:', err);
        }
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        try {
            socketWrapper.emit('error', error);
        } catch (err) {
            console.error('Error handling error:', err);
        }
    });

    socket.on('pong', () => {
        try {
            socketWrapper.emit('pong');
        } catch (err) {
            console.error('Pong error:', err);
        }
    });
});

// Create database directory if it doesn't exist
const fs = require('fs');
const dbDir = path.join(__dirname, 'server', 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Create empty participants.json if it doesn't exist
const participantsFile = path.join(dbDir, 'participants.json');
if (!fs.existsSync(participantsFile)) {
    fs.writeFileSync(participantsFile, '{}', 'utf8');
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Internal Server Error');
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 