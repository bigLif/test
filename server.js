import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createServer } from 'http';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import adminRoutes from './routes/admin.js';
import supportChatRoutes from './routes/supportChat.js';
import notificationRoutes from './routes/notifications.js';
import referralRoutes from './routes/referral.js';
import marketRoutes from './routes/market.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Could not connect to MongoDB', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportChatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/market', marketRoutes);

// WebSocket events for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('join-support-room', (ticketId) => {
    socket.join(`ticket-${ticketId}`);
  });

  socket.on('leave-support-room', (ticketId) => {
    socket.leave(`ticket-${ticketId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Export io instance for use in other files
export { io };

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));