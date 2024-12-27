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

// Basic health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

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
        } catch (err) {
            console.error('Error handling message:', err);
            socket.emit('error', 'Invalid message format');
        }
    });

    // Handle errors
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