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
    pingInterval: 25000
});

// Enable CORS for all routes
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// Store active channels and participants
const channels = {
    lobby: {
        _id: "lobby",
        settings: {
            visible: true,
            chat: true,
            crownsolo: false,
            color: "#ecfaed"
        },
        participants: new Map()
    }
};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    let currentChannel = null;

    // Send initial connection acknowledgment
    socket.emit('connect_confirmed');

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, reason);
        if (currentChannel && channels[currentChannel]) {
            channels[currentChannel].participants.delete(socket.id);
        }
    });

    socket.on('message', (data) => {
        try {
            const messages = typeof data === 'string' ? JSON.parse(data) : data;
            console.log('Received message:', messages);

            // Handle each message in the array
            if (Array.isArray(messages)) {
                messages.forEach(msg => handleMessage(socket, msg));
            } else {
                handleMessage(socket, messages);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            socket.emit('error', { message: 'Invalid message format' });
        }
    });
});

function handleMessage(socket, msg) {
    switch(msg.m) {
        case "hi":
            socket.emit('hi', {
                t: Date.now(),
                u: socket.id,
                m: "hi",
                token: Math.random().toString(36).substring(2)
            });
            break;
        // Add other message handlers here
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 