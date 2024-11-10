import express from 'express';
import multer from 'multer';
import path from 'path';
import { verifyToken, verifyAdmin } from '../middleware/auth.js';
import Ticket from '../models/Ticket.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { sendEmail } from '../utils/emailService.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Create new ticket (users only)
router.post('/tickets', verifyToken, async (req, res) => {
  try {
    const { subject, category, priority, description } = req.body;

    const ticket = new Ticket({
      userId: req.user.userId,
      subject,
      category,
      priority,
      description
    });

    await ticket.save();

    // Create initial message
    const message = new Message({
      ticketId: ticket._id,
      sender: req.user.userId,
      content: description,
      isAgent: false
    });

    await message.save();

    // Notify support team
    const user = await User.findById(req.user.userId);
    await sendEmail(
      process.env.SUPPORT_EMAIL,
      'New Support Ticket Created',
      `A new support ticket has been created:
      
      Ticket ID: ${ticket._id}
      Subject: ${subject}
      Priority: ${priority}
      Category: ${category}
      User: ${user.name} (${user.email})
      
      Description:
      ${description}`
    );

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tickets (users see their own, admins see all)
router.get('/tickets', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const tickets = user.isAdmin
      ? await Ticket.find().sort({ createdAt: -1 })
      : await Ticket.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get ticket messages
router.get('/tickets/:ticketId/messages', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const ticket = user.isAdmin
      ? await Ticket.findById(req.params.ticketId)
      : await Ticket.findOne({
          _id: req.params.ticketId,
          userId: req.user.userId
        });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const messages = await Message.find({ ticketId: ticket._id })
      .populate('sender', 'name')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add message to ticket (admin only for responses)
router.post('/tickets/:ticketId/messages', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const ticket = user.isAdmin
      ? await Ticket.findById(req.params.ticketId)
      : await Ticket.findOne({
          _id: req.params.ticketId,
          userId: req.user.userId
        });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Only allow admin responses
    if (req.body.isAgent && !user.isAdmin) {
      return res.status(403).json({ message: 'Only admins can send support responses' });
    }

    const message = new Message({
      ticketId: ticket._id,
      sender: req.user.userId,
      content: req.body.content,
      isAgent: user.isAdmin
    });

    await message.save();

    // Update ticket last updated timestamp
    ticket.lastUpdated = Date.now();
    await ticket.save();

    // Notify user of admin response
    if (user.isAdmin) {
      const ticketUser = await User.findById(ticket.userId);
      await sendEmail(
        ticketUser.email,
        `New Response to Your Support Ticket #${ticket._id}`,
        `A support agent has responded to your ticket:

        "${req.body.content}"`
      );
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload attachment
router.post(
  '/tickets/:ticketId/attachments',
  verifyToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.userId);
      const ticket = user.isAdmin
        ? await Ticket.findById(req.params.ticketId)
        : await Ticket.findOne({
            _id: req.params.ticketId,
            userId: req.user.userId
          });

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const message = new Message({
        ticketId: ticket._id,
        sender: req.user.userId,
        content: 'Attached file: ' + req.file.originalname,
        attachments: [{
          filename: req.file.originalname,
          path: req.file.path,
          mimetype: req.file.mimetype
        }],
        isAgent: user.isAdmin
      });

      await message.save();

      ticket.lastUpdated = Date.now();
      await ticket.save();

      res.status(201).json(message);
    } catch (error) {
      console.error('Error uploading attachment:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update ticket status (admin only)
router.patch('/tickets/:ticketId/status', verifyAdmin, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.ticketId);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    ticket.status = req.body.status;
    ticket.lastUpdated = Date.now();
    await ticket.save();

    // Notify user of status change
    const user = await User.findById(ticket.userId);
    await sendEmail(
      user.email,
      `Support Ticket Status Updated`,
      `Your support ticket #${ticket._id} status has been updated to: ${req.body.status}`
    );

    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;