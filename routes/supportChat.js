import express from 'express';
import multer from 'multer';
import path from 'path';
import { verifyToken, verifyAdmin } from '../middleware/auth.js';
import SupportTicket from '../models/SupportTicket.js';
import SupportMessage from '../models/SupportMessage.js';
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

// Create new ticket
router.post('/tickets', verifyToken, async (req, res) => {
  try {
    const { subject, category, priority } = req.body;
    
    const ticket = new SupportTicket({
      userId: req.user.userId,
      subject,
      category,
      priority
    });

    await ticket.save();

    // Notify admins
    const admins = await User.find({ isAdmin: true });
    for (const admin of admins) {
      await sendEmail(
        admin.email,
        'New Support Ticket',
        `A new support ticket has been created:\n\nSubject: ${subject}\nPriority: ${priority}\nCategory: ${category}`
      );
    }

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's tickets
router.get('/tickets', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const query = user.isAdmin ? {} : { userId: req.user.userId };
    
    const tickets = await SupportTicket.find(query)
      .populate('userId', 'name email')
      .populate('assignedTo', 'name')
      .sort({ lastUpdated: -1 });
    
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
    const ticket = await SupportTicket.findOne({
      _id: req.params.ticketId,
      $or: [
        { userId: req.user.userId },
        { assignedTo: req.user.userId }
      ]
    });

    if (!ticket && !user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await SupportMessage.find({ ticketId: req.params.ticketId })
      .populate('sender', 'name')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send message
router.post('/tickets/:ticketId/messages', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const ticket = await SupportTicket.findById(req.params.ticketId);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Only allow admin responses or ticket owner messages
    if (!user.isAdmin && ticket.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const message = new SupportMessage({
      ticketId: ticket._id,
      sender: req.user.userId,
      content: req.body.content,
      isAgent: user.isAdmin
    });

    await message.save();

    // Update ticket last message and timestamp
    ticket.lastMessage = {
      content: req.body.content,
      timestamp: new Date()
    };
    ticket.lastUpdated = new Date();
    await ticket.save();

    // Notify the other party
    const recipientId = user.isAdmin ? ticket.userId : ticket.assignedTo;
    if (recipientId) {
      const recipient = await User.findById(recipientId);
      await sendEmail(
        recipient.email,
        'New Support Message',
        `You have a new message in ticket #${ticket._id}:\n\n${req.body.content}`
      );
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
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
      const ticket = await SupportTicket.findById(req.params.ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      if (!user.isAdmin && ticket.userId.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const message = new SupportMessage({
        ticketId: ticket._id,
        sender: req.user.userId,
        content: `Attached: ${req.file.originalname}`,
        attachments: [{
          filename: req.file.originalname,
          path: req.file.path,
          mimetype: req.file.mimetype
        }],
        isAgent: user.isAdmin
      });

      await message.save();

      ticket.lastMessage = {
        content: `Attached: ${req.file.originalname}`,
        timestamp: new Date()
      };
      ticket.lastUpdated = new Date();
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
    const ticket = await SupportTicket.findById(req.params.ticketId);
    
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    ticket.status = req.body.status;
    ticket.lastUpdated = new Date();
    
    if (req.body.status === 'in_progress' && !ticket.assignedTo) {
      ticket.assignedTo = req.user.userId;
    }

    await ticket.save();

    // Notify user of status change
    const user = await User.findById(ticket.userId);
    await sendEmail(
      user.email,
      'Support Ticket Status Updated',
      `Your support ticket #${ticket._id} has been updated to: ${req.body.status}`
    );

    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark messages as read
router.post('/tickets/:ticketId/read', verifyToken, async (req, res) => {
  try {
    await SupportMessage.updateMany(
      {
        ticketId: req.params.ticketId,
        readBy: { $ne: req.user.userId }
      },
      {
        $addToSet: { readBy: req.user.userId }
      }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;