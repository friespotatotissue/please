const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Basic health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

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

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
    // Handle custom messages from the piano client
    socket.on('message', (data) => {
        try {
            // If data is already a string, parse it, if not, stringify it
            const message = typeof data === 'string' ? JSON.parse(data) : data;
            console.log('Received message:', message);
            
            // Broadcast the message to all clients
            io.emit('message', typeof data === 'string' ? data : JSON.stringify(data));
            const messages = typeof data === 'string' ? JSON.parse(data) : data;
            console.log('Received message:', messages);
            // Handle each message in the array
            if (Array.isArray(messages)) {
                messages.forEach(msg => {
                    switch(msg.m) {
                        case "hi":
                            // Send initial hi response
                            socket.emit('message', JSON.stringify([{
                                m: "hi",
                                u: { _id: socket.id, name: "Anonymous" },
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

    // Handle errors
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

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});