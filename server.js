import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import adminRoutes from './routes/admin.js';
import supportChatRoutes from './routes/supportChat.js';
import notificationRoutes from './routes/notifications.js';
import referralRoutes from './routes/referral.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const corsOptions = {
  origin: 'https://client-biglifs-projects.vercel.app/',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, 
};

app.use(cors(corsOptions));
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

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
