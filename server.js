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
const participants = new Map();

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

// Helper function to create a new participant
function createParticipant(id, name) {
    const color = "#" + Math.floor(Math.random()*16777215).toString(16);
    const participant = {
        _id: id,
        name: name || "Anonymous",
        color: color
    };
    participants.set(id, participant);
    return participant;
}

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
                            // Create and send participant info
                            const newParticipant = createParticipant(socket.id);
                            socket.emit('message', JSON.stringify([{
                                m: "hi",
                                u: newParticipant,
                                t: Date.now()
                            }]));
                            break;
                        
                        case "ch":
                            // Handle channel join request
                            const channelId = msg._id || "lobby";
                            const p = participants.get(socket.id);
                            if (!p) return;
                            
                            // Leave current channel if any
                            if (currentChannel) {
                                currentChannel.participants.delete(socket.id);
                                socket.leave(currentChannel._id);
                            }
                            
                            // Get or create channel
                            currentChannel = channels[channelId];
                            if (!currentChannel) {
                                currentChannel = channels[channelId] = {
                                    _id: channelId,
                                    settings: {
                                        visible: true,
                                        chat: true,
                                        crownsolo: false,
                                        color: "#ecfaed"
                                    },
                                    participants: new Map()
                                };
                            }
                            
                            // Add participant to channel
                            const participant = {
                                id: socket.id,
                                name: "Anonymous",
                                x: 0,
                                y: 0,
                                color: "#" + Math.floor(Math.random()*16777215).toString(16)
                            };
                            currentChannel.participants.set(socket.id, participant);

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

                            // Broadcast new participant to others in channel
                            socket.to(channelId).emit('message', JSON.stringify([{
                                m: "p",
                                id: socket.id,
                                name: participant.name,
                                color: participant.color,
                                x: participant.x,
                                y: participant.y
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

                        case "n":
                            // Handle note
                            if (currentChannel) {
                                socket.to(currentChannel._id).emit('message', JSON.stringify([{
                                    m: "n",
                                    n: msg.n,
                                    p: socket.id,
                                    t: msg.t
                                }]));
                            }
                            break;

                        case "m":
                            // Handle cursor movement
                            if (currentChannel) {
                                socket.to(currentChannel._id).emit('message', JSON.stringify([{
                                    m: "m",
                                    id: socket.id,
                                    x: msg.x,
                                    y: msg.y
                                }]));
                            }
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
            // Clean up empty channels except lobby
            if (currentChannel._id !== "lobby" && currentChannel.participants.size === 0) {
                delete channels[currentChannel._id];
            }
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