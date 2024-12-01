import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import Referral from '../models/Referral.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Notification from '../models/Notification.js';
import { sendEmail } from '../utils/emailService.js';
import crypto from 'crypto';

const router = express.Router();

// Get user's referral code
router.get('/code', verifyToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      if (!user.referralCode) {
        // Generate a new unique referral code
        let isUnique = false;
        let newCode;
        while (!isUnique) {
          newCode = crypto.randomBytes(6).toString('hex');
          const existingUser = await User.findOne({ referralCode: newCode });
          if (!existingUser) {
            isUnique = true;
          }
        }
        user.referralCode = newCode;
        await user.save();
      }
  
      res.json({ code: user.referralCode });
    } catch (error) {
      console.error('Error with referral code:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });
  
  // Get user's referrals
 router.get('/my-referrals', verifyToken, async (req, res) => {
    try {
      const referrals = await Referral.find({ referrerId: req.user.userId })
        .populate('referredId', 'name email')
        .sort({ createdAt: -1 });
  
      // Filter out referrals where referredId is null (deleted users)
      const validReferrals = referrals.filter(ref => ref.referredId != null);
  
      const stats = {
        totalReferrals: validReferrals.length,
        activeReferrals: validReferrals.filter(r => r.status === 'completed').length,
        totalCommission: validReferrals.reduce((sum, ref) => sum + (ref.commission || 0), 0)
      };
  
      res.json({ referrals: validReferrals, stats });
    } catch (error) {
      console.error('Error fetching referrals:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });
  
  // Process referral commission
  export const processReferralCommission = async (userId, depositAmount) => {
    try {
      const referral = await Referral.findOne({ 
        referredId: userId,
        status: 'pending'
      }).populate('referrerId', 'name email');
  
      if (!referral) {
        console.log('No pending referral found for user:', userId);
        return;
      }
  
      // Calculate commission (3% of deposit)
      const commission = depositAmount * 0.03;
      
      // Update referrer's wallet
      const wallet = await Wallet.findOne({ userId: referral.referrerId._id });
      if (wallet) {
        wallet.balance += commission;
        await wallet.save();
      }
  
      // Update referral status and commission
      referral.status = 'completed';
      referral.commission = commission;
      await referral.save();
  
      // Create notification
      await Notification.create({
        userId: referral.referrerId._id,
        title: 'Referral Commission Earned!',
        message: `You've earned $${commission.toFixed(2)} in referral commission from a referred user's first deposit.`,
        type: 'system'
      });
  
      // Send email
      if (referral.referrerId.email) {
        await sendEmail(
          referral.referrerId.email,
          'Referral Commission Earned!',
          `Congratulations! You've earned $${commission.toFixed(2)} in referral commission from a referred user's first deposit.`
        );
      }
    } catch (error) {
      console.error('Error processing referral commission:', error);
    }
  };
export default router;