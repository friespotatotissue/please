const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// ... existing code ...

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('chat message', (msg) => {
    console.log('message: ' + msg);
    io.emit('chat message', msg);
  });
});

// ... existing code ...

http.listen(3000, () => {
  console.log('listening on *:3000');
}); 