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

    socket.on('hi', () => {
        socket.emit('hi', {
            t: Date.now(),
            u: { _id: socket.id, name: "Anonymous" },
            m: "hi"
        });
    });

    socket.on('ch', (msg) => {
        const channelId = msg._id || "lobby";
        currentChannel = channels[channelId] || channels.lobby;
        
        // Add participant to channel
        currentChannel.participants.set(socket.id, {
            _id: socket.id,
            name: "Anonymous",
            x: 0,
            y: 0
        });

        // Join socket.io room
        socket.join(channelId);

        // Send channel info back to client
        socket.emit('ch', {
            ch: {
                _id: currentChannel._id,
                settings: currentChannel.settings
            },
            ppl: Array.from(currentChannel.participants.values())
        });
    });

    socket.on('t', (msg) => {
        socket.emit('t', {
            t: Date.now(),
            e: msg.e
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (currentChannel) {
            currentChannel.participants.delete(socket.id);
            socket.to(currentChannel._id).emit('bye', { p: socket.id });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 