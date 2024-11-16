import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';
import { sendEmail } from '../utils/emailService.js';
import Wallet from '../models/Wallet.js';
import Referral from '../models/Referral.js';
import ReferralTree from '../models/ReferralTree.js';
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
      referrerTree = await ReferralTree.findOne({ referralCode: referralCode.toUpperCase() });
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
      try {
        // Add user to referrer's tree
        referrerTree.referrals.push({
          userId: user._id,
          status: 'pending',
          totalEarnings: 0,
          createdAt: new Date()
        });
        await referrerTree.save();

        // Notify referrer
        const referrer = await User.findById(referrerTree.userId);
        if (referrer) {
          await sendEmail(
            referrer.email,
            'New Referral Registration',
            `${name} has registered using your referral code! You'll receive a commission when they make their first deposit.`
          );
        }
      } catch (error) {
        console.error('Error processing referral:', error);
        // Don't fail the registration if referral processing fails
      }
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
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(400).json({ 
        message: 'Please verify your email before logging in',
        needsVerification: true
      });
    }

    // Create and sign JWT
    const token = jwt.sign(
      { userId: user._id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ message: 'Server error during login' });
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

    // Redirect to frontend with success message
    res.redirect(`${process.env.FRONTEND_URL}/login?verified=true`);
  } catch (error) {
    console.error('Error in email verification:', error);
    res.status(500).json({ message: 'Server error during verification' });
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
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
    await sendEmail(
      email,
      'Verify Your Email',
      `Please verify your email by clicking this link: ${verificationUrl}`
    );

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Error resending verification:', error);
    res.status(500).json({ message: 'Server error while resending verification email' });
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
