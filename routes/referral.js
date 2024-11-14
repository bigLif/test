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
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's referral tree
router.get('/tree', verifyToken, async (req, res) => {
  try {
    const referralTree = await ReferralTree.findOne({ userId: req.user.userId });
    if (!referralTree) {
      return res.status(404).json({ message: 'Referral tree not found' });
    }

    const tree = await referralTree.getTree(3); // Get 3 levels deep
    res.json(tree);
  } catch (error) {
    console.error('Error fetching referral tree:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Process referral commission
export const processReferralCommission = async (userId, depositAmount) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Find all referral trees that have this user as a referral
    const referrerTree = await ReferralTree.findOne({
      'referrals.userId': userId,
      'referrals.status': 'pending'
    });

    if (!referrerTree) return;

    // Update referral status to active
    await referrerTree.updateReferralStatus(userId, 'active');

    // Process multi-level commissions
    const commissionRates = [0.03, 0.015, 0.0075]; // 3%, 1.5%, 0.75%
    let currentLevel = 0;
    let currentTree = referrerTree;

    while (currentLevel < commissionRates.length && currentTree) {
      const commission = depositAmount * commissionRates[currentLevel];
      
      // Add earnings to referral tree
      await currentTree.addEarnings(userId, commission);

      // Update wallet balance
      const wallet = await Wallet.findOne({ userId: currentTree.userId });
      if (wallet) {
        wallet.balance += commission;
        await wallet.save();
      }

      // Create notification
      await Notification.create({
        userId: currentTree.userId,
        title: `Level ${currentLevel + 1} Referral Commission`,
        message: `You've earned $${commission.toFixed(2)} from a level ${currentLevel + 1} referral deposit.`,
        type: 'system'
      });

      // Send email notification
      const referrer = await User.findById(currentTree.userId);
      if (referrer?.email) {
        await sendEmail(
          referrer.email,
          `Level ${currentLevel + 1} Referral Commission Earned`,
          `Congratulations! You've earned $${commission.toFixed(2)} from a level ${currentLevel + 1} referral deposit.`
        );
      }

      // Get next level referrer
      currentTree = await ReferralTree.findOne({
        'referrals.userId': currentTree.userId,
        'referrals.status': 'active'
      });
      currentLevel++;
    }
  } catch (error) {
    console.error('Error processing referral commission:', error);
  }
};

// Generate custom referral code
router.post('/generate-code', verifyToken, async (req, res) => {
  try {
    const { customCode } = req.body;
    
    if (customCode) {
      const existing = await ReferralTree.findOne({ referralCode: customCode });
      if (existing) {
        return res.status(400).json({ message: 'This referral code is already taken' });
      }
    }

    let referralTree = await ReferralTree.findOne({ userId: req.user.userId });
    if (!referralTree) {
      referralTree = new ReferralTree({ userId: req.user.userId });
    }

    if (customCode) {
      referralTree.referralCode = customCode;
    }
    await referralTree.save();

    res.json({ code: referralTree.referralCode });
  } catch (error) {
    console.error('Error generating referral code:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Validate referral code
router.get('/validate/:code', async (req, res) => {
  try {
    const referralTree = await ReferralTree.findOne({ referralCode: req.params.code })
      .populate('userId', 'name');

    if (!referralTree) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }

    res.json({
      valid: true,
      referrer: referralTree.userId.name
    });
  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;