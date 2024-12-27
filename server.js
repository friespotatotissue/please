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

    socket.on('message', (data) => {
        try {
            const messages = typeof data === 'string' ? JSON.parse(data) : data;
            console.log('Received message:', messages);

            // Handle each message in the array
            if (Array.isArray(messages)) {
                messages.forEach(msg => {
                    switch(msg.m) {
                        case "hi":
                            // Send initial hi response with unique user ID
                            const userId = socket.id;
                            socket.emit('message', JSON.stringify([{
                                m: "hi",
                                u: { 
                                    _id: userId,
                                    name: "Anonymous",
                                    color: "#" + Math.floor(Math.random()*16777215).toString(16) // Random color
                                },
                                t: Date.now()
                            }]));
                            break;
                        
                        case "ch":
                            // Handle channel join request
                            const channelId = msg._id || "lobby";
                            currentChannel = channels[channelId] || channels.lobby;
                            
                            // Add participant to channel
                            currentChannel.participants.set(socket.id, {
                                id: socket.id,
                                name: "Anonymous",
                                x: 0,
                                y: 0
                            });

                            // Join socket.io room
                            socket.join(channelId);

                            // Send channel info
                            socket.emit('message', JSON.stringify([{
                                m: "ch",
                                ch: {
                                    _id: currentChannel._id,
                                    settings: currentChannel.settings
                                },
                                p: socket.id,
                                ppl: Array.from(currentChannel.participants.values())
                            }]));
                            break;

                        case "t":
                            // Handle time sync
                            socket.emit('message', JSON.stringify([{
                                m: "t",
                                t: Date.now(),
                                e: msg.e
                            }]));
                            break;

                        default:
                            // Broadcast other messages to the channel
                            if (currentChannel) {
                                io.to(currentChannel._id).emit('message', JSON.stringify([msg]));
                            }
                    }
                });
            }
        } catch (err) {
            console.error('Error handling message:', err);
            socket.emit('error', 'Invalid message format');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (currentChannel) {
            // Remove participant from channel
            currentChannel.participants.delete(socket.id);
            // Notify others in the channel
            io.to(currentChannel._id).emit('message', JSON.stringify([{
                m: "bye",
                p: socket.id
            }]));
        }
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