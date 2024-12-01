import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import ReferralTree from '../models/ReferralTree.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { sendEmail } from '../utils/emailService.js';

const router = express.Router();

/**
 * Génère ou récupère le code de parrainage pour l'utilisateur
 */
router.get('/generate-code', verifyToken, async (req, res) => {
  try {
    let referralTree = await ReferralTree.findOne({ userId: req.user.userId });
    if (referralTree) {
      return res.json({ code: referralTree.referralCode });
    }

    const code = `REF-${req.user.userId.slice(-6).toUpperCase()}`;
    referralTree = new ReferralTree({ userId: req.user.userId, referralCode: code });
    await referralTree.save();

    res.json({ code });
  } catch (error) {
    console.error('Error generating referral code:', error);
    res.status(500).json({ message: 'Failed to generate referral code' });
  }
});

/**
 * Statistiques de parrainage de l'utilisateur
 */
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const referralTree = await ReferralTree.findOne({ userId: req.user.userId });

    if (!referralTree) {
      return res.json({
        code: null,
        totalReferrals: 0,
        activeReferrals: 0,
        totalEarnings: 0
      });
    }

    const stats = {
      code: referralTree.referralCode,
      totalReferrals: referralTree.referrals.length,
      activeReferrals: referralTree.referrals.filter(ref => ref.status === 'active').length,
      totalEarnings: referralTree.totalEarnings.toFixed(2)
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({ message: 'Failed to fetch referral stats' });
  }
});

/**
 * Arbre de parrainage de l'utilisateur
 */
router.get('/tree', verifyToken, async (req, res) => {
  try {
    const referralTree = await ReferralTree.findOne({ userId: req.user.userId }).populate(
      'referrals.userId',
      'name email'
    );

    if (!referralTree) {
      return res.json({ referrals: [] });
    }

    const sortedReferrals = referralTree.referrals.sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    const referrals = sortedReferrals.map(ref => ({
      name: ref.userId.name,
      email: ref.userId.email,
      status: ref.status,
      totalEarnings: ref.totalEarnings.toFixed(2),
      createdAt: ref.createdAt
    }));

    res.json({ referrals });
  } catch (error) {
    console.error('Error fetching referral tree:', error);
    res.status(500).json({ message: 'Failed to fetch referral tree' });
  }
});

/**
 * Confirme un dépôt et traite la commission de parrainage
 */
router.post('/confirm-deposit', verifyToken, async (req, res) => {
  try {
    const { userId, depositAmount } = req.body;

    const transaction = await Transaction.findOne({ userId, type: 'deposit', status: 'pending' });
    if (!transaction) {
      return res.status(404).json({ message: 'No pending deposit found' });
    }

    transaction.status = 'completed';
    await transaction.save();

    const referralTree = await ReferralTree.findOne({ 'referrals.userId': userId });
    if (referralTree) {
      const commission = depositAmount * 0.03;
      const wallet = await Wallet.findOne({ userId: referralTree.userId });

      if (wallet) {
        wallet.balance += commission;
        await wallet.save();

        const referral = referralTree.referrals.find(ref => ref.userId.toString() === userId);
        if (referral) {
          referral.status = 'active';
          referral.totalEarnings += commission;
        }
        referralTree.totalEarnings += commission;
        referralTree.activeReferrals += 1;
        await referralTree.save();

        await Notification.create({
          userId: referralTree.userId,
          title: 'Referral Commission Earned!',
          message: `You earned $${commission.toFixed(2)} from your referral's deposit.`,
          type: 'system'
        });

        const referrer = await User.findById(referralTree.userId);
        if (referrer) {
          await sendEmail(
            referrer.email,
            'Referral Commission Earned!',
            `Congratulations! You've earned $${commission.toFixed(2)} from a referral's deposit.`
          );
        }
      }
    }

    res.json({ message: 'Deposit confirmed and referral commission processed' });
  } catch (error) {
    console.error('Error confirming deposit:', error);
    res.status(500).json({ message: 'Failed to confirm deposit' });
  }
});

export default router;
