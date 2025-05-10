import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, you should restrict this to your frontend URL
    methods: ['GET', 'POST']
  }
});

// Store connected users and messages
const rooms = {};
const messages = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Join a room
  socket.on('join_room', ({ userId, username, roomId }) => {
    console.log(`${username} joined room ${roomId}`);
    
    // Add socket to room
    socket.join(roomId);
    
    // Initialize room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    
    // Initialize messages array if it doesn't exist
    if (!messages[roomId]) {
      messages[roomId] = [];
    }
    
    // Add user to room
    const user = {
      id: userId,
      username,
      socketId: socket.id,
      online: true,
      joinedAt: new Date().toISOString()
    };
    
    // Remove user if already in room (in case of reconnect)
    rooms[roomId] = rooms[roomId].filter((u) => u.id !== userId);
    
    // Add user to room
    rooms[roomId].push(user);
    
    // Send online users to all clients in the room
    io.to(roomId).emit('online_users', rooms[roomId]);
    
    // Notify others that user has connected
    socket.to(roomId).emit('user_connected', user);
    
    // Send message history to the user who just joined
    socket.emit('message_history', messages[roomId]);
  });
  
  // Leave a room
  socket.on('leave_room', ({ userId, roomId }) => {
    if (rooms[roomId]) {
      // Remove user from room
      rooms[roomId] = rooms[roomId].filter((user) => user.id !== userId);
      
      // Notify others that user has disconnected
      socket.to(roomId).emit('user_disconnected', userId);
      
      // Leave the room
      socket.leave(roomId);
    }
  });
  
  // Send a message
  socket.on('send_message', (message) => {
    const { roomId } = message;
    
    // Add message ID
    const messageWithId = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    // Store message
    if (messages[roomId]) {
      messages[roomId].push(messageWithId);
      
      // Limit message history (optional)
      if (messages[roomId].length > 100) {
        messages[roomId] = messages[roomId].slice(-100);
      }
    }
    
    // Broadcast to all users in the room
    io.to(roomId).emit('new_message', messageWithId);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find rooms the user was in
    Object.keys(rooms).forEach((roomId) => {
      const user = rooms[roomId].find((u) => u.socketId === socket.id);
      
      if (user) {
        // Remove user from room
        rooms[roomId] = rooms[roomId].filter((u) => u.socketId !== socket.id);
        
        // Notify others that user has disconnected
        io.to(roomId).emit('user_disconnected', user.id);
      }
    });
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});