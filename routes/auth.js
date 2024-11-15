import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';
import { sendEmail } from '../utils/emailService.js';
import Wallet from '../models/Wallet.js';
import Referral from '../models/Referral.js';

const router = express.Router();

// Generate unique referral code
const generateUniqueReferralCode = async () => {
  let isUnique = false;
  let referralCode;
  
  while (!isUnique) {
    referralCode = crypto.randomBytes(6).toString('hex');
    const existingUser = await User.findOne({ referralCode });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return referralCode;
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, referralCode } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate referral code if provided
    let referrerTree = null;
    if (referralCode) {
      referrerTree = await ReferralTree.findOne({ referralCode: referralCode.toUpperCase() })
        .populate('userId');
      
      if (!referrerTree) {
        return res.status(400).json({ message: 'Invalid referral code' });
      }
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date();
    verificationExpires.setHours(verificationExpires.getHours() + 24);

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      verificationToken,
      verificationExpires
    });

    await user.save();

    // Create wallet for new user
    await Wallet.create({ userId: user._id, balance: 0 });

    // Create referral tree for new user
    const userTree = new ReferralTree({ userId: user._id });
    await userTree.save();

    // Handle referral if code exists
    if (referrerTree) {
      // Add user to referrer's tree
      referrerTree.referrals.push({
        userId: user._id,
        status: 'pending',
        totalEarnings: 0
      });
      await referrerTree.save();

      // Notify referrer
      await sendEmail(
        referrerTree.userId.email,
        'New Referral Registration',
        `${name} has registered using your referral code! You'll receive a commission when they make their first deposit.`
      );
    }

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
    await sendEmail(
      email,
      'Verify Your Email',
      `Welcome to our platform! Please verify your email by clicking this link: ${verificationUrl}`
    );

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.'
    });
  } catch (error) {
    console.error('Error in registration:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Verify email
router.get('/verify/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      verificationToken: req.params.token,
      verificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    // Send welcome email
    await sendEmail(
      user.email,
      'Welcome to Our Platform',
      `Dear ${user.name},\n\nThank you for verifying your email address. Your account is now fully activated and you can start using our platform.\n\nBest regards,\nYour Platform Team`
    );

    // Redirect to frontend with success message
    res.redirect('https://www.algobank.online/');
  } catch (error) {
    console.error('Error in email verification:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(400).json({ message: 'Please verify your email before logging in' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create and return JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date();
    verificationExpires.setHours(verificationExpires.getHours() + 24);

    user.verificationToken = verificationToken;
    user.verificationExpires = verificationExpires;
    await user.save();

    // Send new verification email
    const verificationUrl = `https://test-ofnz.onrender.com/api/auth/verify/${verificationToken}`;
    await sendEmail(
      email,
      'Verify Your Email',
      `Dear ${user.name},\n\nPlease verify your email by clicking the following link:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nBest regards,\nYour Platform Team`
    );

    res.json({ message: 'Verification email has been resent' });
  } catch (error) {
    console.error('Error resending verification:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password -verificationToken -verificationExpires');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile
router.patch('/profile', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name;
    await user.save();

    // Return user without sensitive data
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin
    };

    res.json(userResponse);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
