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
    allowEIO3: true
});

// Import original server structures
const Server = require('./server/structures/Server');
const Socket = require('./server/structures/Socket');
const Participant = require('./server/structures/Participant');
const Room = require('./server/structures/Room');
const ParticipantRoom = require('./server/structures/ParticipantRoom');

// Enable CORS for all routes
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// Create WebSocket server instance
const wsServer = new Server();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Create a Socket wrapper instance
    const socketWrapper = new Socket(wsServer, {
        send: (data) => socket.send(data),
        close: () => socket.disconnect(),
        terminate: () => socket.disconnect(true)
    }, socket.request);
    wsServer.sockets.add(socketWrapper);

    socket.on('message', (data) => {
        try {
            const messages = typeof data === 'string' ? JSON.parse(data) : data;
            if (Array.isArray(messages)) {
                messages.forEach(msg => wsServer.handleData(socketWrapper, msg));
            }
        } catch (err) {
            console.error('Error handling message:', err);
            socket.emit('error', 'Invalid message format');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        socketWrapper.close();
        wsServer.sockets.delete(socketWrapper);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
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