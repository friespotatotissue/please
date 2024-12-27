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
                messages.forEach(msg => handleMessage(socket, msg, currentChannel, (ch) => currentChannel = ch));
            } else {
                handleMessage(socket, msg, currentChannel, (ch) => currentChannel = ch);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            socket.emit('error', { message: 'Invalid message format' });
        }
    });
});

function handleMessage(socket, msg, currentChannel, setCurrentChannel) {
    switch(msg.m) {
        case "hi":
            socket.emit('hi', {
                t: Date.now(),
                u: socket.id,
                m: "hi",
                token: Math.random().toString(36).substring(2)
            });
            break;
        case "ch":
            // Handle channel join request
            const channelId = msg._id || "lobby";
            const channel = channels[channelId] || channels.lobby;
            setCurrentChannel(channel);
            
            // Add participant to channel
            channel.participants.set(socket.id, {
                id: socket.id,
                name: "Anonymous",
                x: 0,
                y: 0
            });

            // Join socket.io room
            socket.join(channelId);

            // Send channel info back to client
            socket.emit('ch', {
                ch: {
                    _id: channel._id,
                    settings: channel.settings
                },
                p: socket.id,
                ppl: Array.from(channel.participants.values())
            });
            break;
        case "t":
            // Handle time sync
            socket.emit('t', {
                t: Date.now(),
                e: msg.e
            });
            break;
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 