import express from 'express';
import { verifyAdmin } from '../middleware/auth.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import Investment from '../models/Investment.js';
import Notification from '../models/Notification.js';
import Gains from '../models/Gains.js';
import Referral from '../models/Referral.js';
import { sendEmail } from '../utils/emailService.js';
const router = express.Router();

// Get admin dashboard stats
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      activeInvestments,
      lastMonthDeposits,
      previousMonthDeposits,
      totalReferrals,
      completedReferrals
    ] = await Promise.all([
      User.countDocuments(),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Investment.countDocuments(),
      Transaction.aggregate([
        {
          $match: {
            type: 'deposit',
            status: 'completed',
            createdAt: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        {
          $match: {
            type: 'deposit',
            status: 'completed',
            createdAt: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 2)),
              $lt: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Referral.countDocuments(),
      Referral.countDocuments({ status: 'completed' })
    ]);

    const currentMonthTotal = lastMonthDeposits[0]?.total || 0;
    const previousMonthTotal = previousMonthDeposits[0]?.total || 1;
    const monthlyGrowth = ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100;

    res.json({
      totalUsers,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalWithdrawals: totalWithdrawals[0]?.total || 0,
      activeInvestments,
      monthlyGrowth: Math.round(monthlyGrowth * 100) / 100,
      totalReferrals,
      completedReferrals
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// Get all users
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password -verificationToken -verificationExpires');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// Get all transactions with user details
router.get('/transactions', verifyAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          userName: '$user.name',
          type: 1,
          amount: 1,
          status: 1,
          paymentMethod: 1,
          cryptoAmount: 1,
          bitcoinAddress: 1,
          usdtAddress: 1,
          txHash: 1,
          network: 1,
          createdAt: 1
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get admin dashboard stats
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      activeInvestments,
      lastMonthDeposits,
      previousMonthDeposits,
      totalReferrals,
      completedReferrals
    ] = await Promise.all([
      User.countDocuments(),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Investment.countDocuments(),
      Transaction.aggregate([
        {
          $match: {
            type: 'deposit',
            status: 'completed',
            createdAt: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        {
          $match: {
            type: 'deposit',
            status: 'completed',
            createdAt: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 2)),
              $lt: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Referral.countDocuments(),
      Referral.countDocuments({ status: 'completed' })
    ]);

    const currentMonthTotal = lastMonthDeposits[0]?.total || 0;
    const previousMonthTotal = previousMonthDeposits[0]?.total || 1;
    const monthlyGrowth = ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100;

    res.json({
      totalUsers,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalWithdrawals: totalWithdrawals[0]?.total || 0,
      activeInvestments,
      monthlyGrowth: Math.round(monthlyGrowth * 100) / 100,
      totalReferrals,
      completedReferrals
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all wallets
router.get('/wallets', verifyAdmin, async (req, res) => {
  try {
    const wallets = await Wallet.find();
    res.json(wallets);
  } catch (error) {
    console.error('Error fetching wallets:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/users/:id/referrals', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Get all referrals where this user is the referrer
    const referrals = await Referral.find({ referrerId: userId })
      .populate('referredId', 'name email')
      .sort({ createdAt: -1 });

    // Filter out referrals where referredId is null (deleted users)
    const validReferrals = referrals.filter(ref => ref.referredId != null);

    const stats = {
      totalReferrals: validReferrals.length,
      activeReferrals: validReferrals.filter(r => r.status === 'completed').length,
      totalCommission: validReferrals.reduce((sum, ref) => sum + (ref.commission || 0), 0)
    };

    res.json(validReferrals);
  } catch (error) {
    console.error('Error fetching user referrals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all referrals with stats
router.get('/referrals', verifyAdmin, async (req, res) => {
  try {
    const referrals = await Referral.find()
      .populate('referrerId', 'name email')
      .populate('referredId', 'name email')
      .sort({ createdAt: -1 });

    const stats = {
      totalReferrals: referrals.length,
      activeReferrals: referrals.filter(r => r.status === 'completed').length,
      totalCommission: referrals.reduce((sum, ref) => sum + (ref.commission || 0), 0),
      averageCommission: referrals.length > 0
        ? referrals.reduce((sum, ref) => sum + (ref.commission || 0), 0) / referrals.length
        : 0
    };

    res.json({ referrals, stats });
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Delete user
router.delete('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isAdmin) {
      return res.status(403).json({ message: 'Cannot delete admin users' });
    }

    // Delete associated data
    await Promise.all([
      Wallet.deleteOne({ userId: user._id }),
      Transaction.deleteMany({ userId: user._id }),
      WithdrawalRequest.deleteMany({ userId: user._id }),
      Investment.deleteMany({ userId: user._id }),
      Notification.deleteMany({ userId: user._id }),
      Gains.deleteOne({ userId: user._id }),
      Referral.deleteMany({
        $or: [
          { referrerId: user._id },
          { referredId: user._id }
        ]
      })
    ]);

    await user.deleteOne();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update transaction status
router.patch('/transaction/:id', verifyAdmin, async (req, res) => {
  try {
    const { status, txHash } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const oldStatus = transaction.status;
    transaction.status = status;
    if (txHash) {
      transaction.txHash = txHash;
    }
    await transaction.save();

    const user = await User.findById(transaction.userId);

    if (status === 'completed' && oldStatus !== 'completed') {
      if (transaction.type === 'deposit') {
        // Update wallet balance
        const wallet = await Wallet.findOne({ userId: transaction.userId });
        if (wallet) {
          wallet.balance += transaction.amount;
          await wallet.save();
        }

        // Check if this is the first deposit and process referral
        const previousDeposits = await Transaction.find({
          userId: transaction.userId,
          type: 'deposit',
          status: 'completed',
          _id: { $ne: transaction._id }
        });

        if (previousDeposits.length === 0) {
          // This is the first deposit, process referral commission
          await processReferralCommission(transaction.userId, transaction.amount);
        }

        // Create notification
        await Notification.create({
          userId: transaction.userId,
          title: 'Deposit Approved',
          message: `Your deposit of $${transaction.amount} has been approved and added to your wallet.`,
          type: 'deposit'
        });

        // Send email
        if (user) {
          await sendEmail(
            user.email,
            'Deposit Approved',
            `Dear ${user.name},\n\nYour deposit of $${transaction.amount} has been approved and added to your wallet.\n\nThank you for using our platform!`
          );
        }
      }
    }

    res.json(transaction);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});




// Delete user
router.delete('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isAdmin) {
      return res.status(403).json({ message: 'Cannot delete admin users' });
    }

    // Delete associated data
    await Promise.all([
      Wallet.deleteOne({ userId }),
      Transaction.deleteMany({ userId }),
      WithdrawalRequest.deleteMany({ userId }),
      Investment.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
      Gains.deleteOne({ userId }),
      // Don't delete referrals, just update them
      Referral.updateMany(
        { $or: [{ referrerId: userId }, { referredId: userId }] },
        { $set: { status: 'inactive' } }
      )
    ]);

    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all referrals with stats
router.get('/referrals', verifyAdmin, async (req, res) => {
  try {
    const referrals = await Referral.find()
      .populate('referrerId', 'name email')
      .populate('referredId', 'name email')
      .sort({ createdAt: -1 });

    const stats = {
      totalReferrals: referrals.length,
      activeReferrals: referrals.filter(r => r.status === 'completed').length,
      totalCommission: referrals.reduce((sum, ref) => sum + (ref.commission || 0), 0),
      averageCommission: referrals.length > 0 
        ? referrals.reduce((sum, ref) => sum + (ref.commission || 0), 0) / referrals.length 
        : 0
    };

    res.json({ referrals, stats });
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update referral status
router.patch('/referrals/:id/status', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const referral = await Referral.findById(req.params.id)
      .populate('referrerId', 'name email')
      .populate('referredId', 'name email');

    if (!referral) {
      return res.status(404).json({ message: 'Referral not found' });
    }

    referral.status = status;
    await referral.save();

    // If marking as completed, process commission
    if (status === 'completed' && referral.referrerId) {
      const wallet = await Wallet.findOne({ userId: referral.referrerId });
      if (wallet) {
        const commission = referral.commission || 0;
        wallet.balance += commission;
        await wallet.save();

        // Notify referrer
        await Notification.create({
          userId: referral.referrerId,
          title: 'Referral Commission Added',
          message: `You've received $${commission.toFixed(2)} in referral commission.`,
          type: 'system'
        });

        // Send email
        if (referral.referrerId.email) {
          await sendEmail(
            referral.referrerId.email,
            'Referral Commission Added',
            `You've received $${commission.toFixed(2)} in referral commission.`
          );
        }
      }
    }

    res.json(referral);
  } catch (error) {
    console.error('Error updating referral status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's referrals
router.get('/users/:id/referrals', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Get all referrals where this user is the referrer
    const referrals = await Referral.find({ referrerId: userId })
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
    console.error('Error fetching user referrals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get admin dashboard stats
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      activeInvestments,
      lastMonthDeposits,
      previousMonthDeposits,
      totalReferrals,
      activeReferrals
    ] = await Promise.all([
      User.countDocuments(),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Investment.countDocuments(),
      Transaction.aggregate([
        {
          $match: {
            type: 'deposit',
            status: 'completed',
            createdAt: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        {
          $match: {
            type: 'deposit',
            status: 'completed',
            createdAt: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 2)),
              $lt: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Referral.countDocuments(),
      Referral.countDocuments({ status: 'completed' })
    ]);

    const currentMonthTotal = lastMonthDeposits[0]?.total || 0;
    const previousMonthTotal = previousMonthDeposits[0]?.total || 1;
    const monthlyGrowth = ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100;

    res.json({
      totalUsers,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalWithdrawals: totalWithdrawals[0]?.total || 0,
      activeInvestments,
      monthlyGrowth: Math.round(monthlyGrowth * 100) / 100,
      totalReferrals,
      activeReferrals
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;