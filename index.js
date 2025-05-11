import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import mysql from 'mysql2'; // Import mysql2 package

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// MySQL connection
const pool = mysql.createPool({
  host: 'sql12.freesqldatabase.com',
  user: 'sql12778133',
  database: 'sql12778133',
  password: 'KrXkXBjJma',
  port: 3306 // Default MySQL port
});

// Create messages table if not exists (MySQL syntax)
(async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  pool.promise().query(createTableQuery).catch(error => {
    console.error('Error creating messages table:', error);
  });
})();

// In-memory storage for online users
const rooms = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join a room
  socket.on('join_room', async ({ userId, username, roomId }) => {
    console.log(`${username} joined room ${roomId}`);
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];

    const user = {
      id: userId,
      username,
      socketId: socket.id,
      online: true,
      joinedAt: new Date().toISOString()
    };

    rooms[roomId] = rooms[roomId].filter((u) => u.id !== userId);
    rooms[roomId].push(user);

    io.to(roomId).emit('online_users', rooms[roomId]);
    socket.to(roomId).emit('user_connected', user);

    // Fetch last 100 messages from DB and emit
    try {
      const [rows] = await pool.promise().query(
        'SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT 100',
        [roomId]
      );

      const history = rows
        .reverse()
        .map((row) => ({
          id: `msg_${row.id}`,
          roomId: row.room_id,
          userId: row.user_id,
          username: row.username,
          content: row.content,
          timestamp: row.timestamp
        }));

      socket.emit('message_history', history);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  });

  // Leave a room
  socket.on('leave_room', ({ userId, roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter((user) => user.id !== userId);
      socket.to(roomId).emit('user_disconnected', userId);
      socket.leave(roomId);
    }
  });

  // Send a message
  socket.on('send_message', async (message) => {
    const { roomId, userId, username, content } = message;

    try {
      const [result] = await pool.promise().query(
        'INSERT INTO messages (room_id, user_id, username, content) VALUES (?, ?, ?, ?) ',
        [roomId, userId, username, content]
      );

      const row = result.insertId; // Get the ID of the inserted message
      const formattedMessage = {
        id: `msg_${row}`,
        roomId: roomId,
        userId: userId,
        username: username,
        content: content,
        timestamp: new Date().toISOString() // Timestamp generated in MySQL by default
      };

      io.to(roomId).emit('new_message', formattedMessage);
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    Object.keys(rooms).forEach((roomId) => {
      const user = rooms[roomId].find((u) => u.socketId === socket.id);

      if (user) {
        rooms[roomId] = rooms[roomId].filter((u) => u.socketId !== socket.id);
        io.to(roomId).emit('user_disconnected', user.id);
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
