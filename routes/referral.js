import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import ReferralTree from '../models/ReferralTree.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Notification from '../models/Notification.js';
import { sendEmail } from '../utils/emailService.js';

const router = express.Router();

// Get user's referral code and stats
router.get('/code', verifyToken, async (req, res) => {
  try {
    let referralTree = await ReferralTree.findOne({ userId: req.user.userId });
    
    if (!referralTree) {
      referralTree = new ReferralTree({ userId: req.user.userId });
      await referralTree.save();
    }

    const stats = {
      code: referralTree.referralCode,
      totalReferrals: referralTree.totalReferrals,
      activeReferrals: referralTree.activeReferrals,
      totalEarnings: referralTree.totalEarnings
    };

    res.json(stats);
  } catch (error) {
    console.error('Error with referral code:', error);
    res.status(500).json({ message: 'Failed to get referral code' });
  }
});

// Get referral tree
router.get('/tree', verifyToken, async (req, res) => {
  try {
    const referralTree = await ReferralTree.findOne({ userId: req.user.userId })
      .populate('referrals.userId', 'name email');

    if (!referralTree) {
      return res.json({ referrals: [] });
    }

    res.json({ referrals: referralTree.referrals });
  } catch (error) {
    console.error('Error fetching referral tree:', error);
    res.status(500).json({ message: 'Failed to fetch referral tree' });
  }
});

// Generate custom referral code
router.post('/generate-code', verifyToken, async (req, res) => {
  try {
    const { customCode } = req.body;
    
    if (!customCode) {
      return res.status(400).json({ message: 'Custom code is required' });
    }

    // Validate custom code format
    if (!/^[A-Za-z0-9]{4,12}$/.test(customCode)) {
      return res.status(400).json({ 
        message: 'Custom code must be 4-12 characters long and contain only letters and numbers' 
      });
    }

    // Check if code is already taken
    const existing = await ReferralTree.findOne({ referralCode: customCode.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: 'This referral code is already taken' });
    }

    // Update user's referral code
    const referralTree = await ReferralTree.findOne({ userId: req.user.userId });
    if (!referralTree) {
      return res.status(404).json({ message: 'Referral tree not found' });
    }

    referralTree.referralCode = customCode.toUpperCase();
    await referralTree.save();

    res.json({ code: referralTree.referralCode });
  } catch (error) {
    console.error('Error generating custom code:', error);
    res.status(500).json({ message: 'Failed to generate custom code' });
  }
});

// Validate referral code
router.get('/validate/:code', async (req, res) => {
  try {
    const referralTree = await ReferralTree.findOne({ 
      referralCode: req.params.code.toUpperCase() 
    }).populate('userId', 'name');

    if (!referralTree) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }

    res.json({
      valid: true,
      referrer: referralTree.userId.name
    });
  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({ message: 'Failed to validate referral code' });
  }
});

// Process referral commission
export const processReferralCommission = async (userId, depositAmount) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const referralTree = await ReferralTree.findOne({ 
      'referrals.userId': userId 
    });
    
    if (!referralTree) return;

    const referral = referralTree.referrals.find(ref => 
      ref.userId.toString() === userId.toString()
    );

    if (!referral || referral.status === 'active') return;

    // Calculate commission (3% of deposit)
    const commission = depositAmount * 0.03;

    // Update referrer's wallet
    const wallet = await Wallet.findOne({ userId: referralTree.userId });
    if (wallet) {
      wallet.balance += commission;
      await wallet.save();
    }

    // Update referral status and earnings
    referral.status = 'active';
    referral.totalEarnings += commission;
    referralTree.totalEarnings += commission;
    referralTree.activeReferrals += 1;
    await referralTree.save();

    // Create notification
    await Notification.create({
      userId: referralTree.userId,
      title: 'Referral Commission Earned!',
      message: `You've earned $${commission.toFixed(2)} in referral commission from a referred user's deposit.`,
      type: 'system'
    });

    // Send email notification
    const referrer = await User.findById(referralTree.userId);
    if (referrer?.email) {
      await sendEmail(
        referrer.email,
        'Referral Commission Earned!',
        `Congratulations! You've earned $${commission.toFixed(2)} in referral commission from a referred user's deposit.`
      );
    }
  } catch (error) {
    console.error('Error processing referral commission:', error);
  }
};

export default router;
