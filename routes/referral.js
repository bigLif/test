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
 * Crée un code de parrainage pour un utilisateur
 */
router.get('/generate-code', verifyToken, async (req, res) => {
  try {
    // Vérifiez si l'utilisateur a déjà un code
    let referralTree = await ReferralTree.findOne({ userId: req.user.userId });
    if (referralTree) {
      return res.json({ code: referralTree.referralCode });
    }

    // Génère un nouveau code unique
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
 * Inscription avec un code de parrainage
 */
router.post('/register/:referralCode', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const { referralCode } = req.params;

    // Vérifiez si le code de parrainage existe
    const referrerTree = await ReferralTree.findOne({ referralCode });
    if (!referrerTree) {
      return res.status(400).json({ message: 'Invalid referral code' });
    }

    // Crée un nouvel utilisateur
    const user = new User({ name, email, password, phone });
    await user.save();

    // Ajoutez l'utilisateur au réseau de parrainage
    referrerTree.referrals.push({ userId: user._id, status: 'pending', totalEarnings: 0 });
    await referrerTree.save();

    // Crée un portefeuille pour le nouvel utilisateur
    await Wallet.create({ userId: user._id, balance: 0 });

    res.status(201).json({ message: 'Registration successful', referralCode });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

/**
 * Ajoute une commission de parrainage après confirmation d’un dépôt
 */
router.post('/confirm-deposit', verifyToken, async (req, res) => {
  try {
    const { userId, depositAmount } = req.body;

    // Confirmez que la transaction est un dépôt
    const transaction = await Transaction.findOne({ userId, type: 'deposit', status: 'pending' });
    if (!transaction) {
      return res.status(404).json({ message: 'No pending deposit found' });
    }

    transaction.status = 'completed';
    await transaction.save();

    // Ajoutez une commission de 3% au parrain
    const referralTree = await ReferralTree.findOne({ 'referrals.userId': userId });
    if (referralTree) {
      const commission = depositAmount * 0.03;
      const wallet = await Wallet.findOne({ userId: referralTree.userId });

      if (wallet) {
        wallet.balance += commission;
        await wallet.save();

        // Mettez à jour les gains dans le réseau de parrainage
        const referral = referralTree.referrals.find(ref => ref.userId.toString() === userId);
        if (referral) {
          referral.status = 'active';
          referral.totalEarnings += commission;
        }
        referralTree.totalEarnings += commission;
        referralTree.activeReferrals += 1;
        await referralTree.save();

        // Envoyez une notification au parrain
        await Notification.create({
          userId: referralTree.userId,
          title: 'Referral Commission Earned!',
          message: `You earned $${commission.toFixed(2)} from your referral's deposit.`,
          type: 'system'
        });

        // Envoyez un email de notification
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
