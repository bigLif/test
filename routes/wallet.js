import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import Investment from '../models/Investment.js';
import Gains from '../models/Gains.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import Notification from '../models/Notification.js';
import { sendEmail } from '../utils/emailService.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get wallet balance and gains
router.get('/balance', verifyToken, async (req, res) => {
  try {
    const [wallet, gains] = await Promise.all([
      Wallet.findOne({ userId: req.user.userId }),
      Gains.findOne({ userId: req.user.userId })
    ]);

    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    res.json({
      balance: wallet.balance,
      gains: gains ? gains.amount : 0
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update gains
router.post('/update-gains', verifyToken, async (req, res) => {
  try {
    // Find or create gains document
    let gains = await Gains.findOne({ userId: req.user.userId });
    if (!gains) {
      gains = new Gains({ userId: req.user.userId });
    }

    // Calculate new gains (simplified example)
    const investments = await Investment.find({ userId: req.user.userId });
    const totalGains = investments.reduce((sum, inv) => sum + (inv.currentValue - inv.amount), 0);

    gains.amount = totalGains;
    gains.lastUpdated = new Date();
    await gains.save();

    res.json({ gains: totalGains });
  } catch (error) {
    console.error('Error updating gains:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Create deposit
router.post('/deposit', verifyToken, async (req, res) => {
  try {
    const { amount, paymentMethod, network } = req.body;

    if (amount < 10) {
      return res.status(400).json({ message: 'Minimum deposit amount is $10' });
    }

    // Calculate crypto amount
    const cryptoAmount = paymentMethod === 'bitcoin' 
      ? amount / 40000 // Simulated BTC price
      : amount; // USDT is 1:1

    // Create transaction record
    const transaction = await Transaction.create({
      userId: req.user.userId,
      type: 'deposit',
      amount,
      cryptoAmount,
      status: 'pending',
      paymentMethod,
      network
    });

    // Create notification
    await Notification.create({
      userId: req.user.userId,
      title: 'Deposit Initiated',
      message: `Your deposit of $${amount} has been initiated. Please complete the payment to process your deposit.`,
      type: 'deposit'
    });

    res.status(201).json({ transaction });
  } catch (error) {
    console.error('Error creating deposit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Create deposit
router.post('/deposit', verifyToken, async (req, res) => {
  try {
    const { amount, paymentMethod, network } = req.body;

    if (amount < 10) {
      return res.status(400).json({ message: 'Minimum deposit amount is $10' });
    }

    // Calculate crypto amount
    const cryptoAmount = paymentMethod === 'bitcoin' 
      ? amount / 40000 // Simulated BTC price
      : amount; // USDT is 1:1

    // Create transaction record
    const transaction = await Transaction.create({
      userId: req.user.userId,
      type: 'deposit',
      amount,
      cryptoAmount,
      status: 'pending',
      paymentMethod,
      network
    });

    // Create notification
    await Notification.create({
      userId: req.user.userId,
      title: 'Deposit Initiated',
      message: `Your deposit of $${amount} has been initiated. Please complete the payment to process your deposit.`,
      type: 'deposit'
    });

    res.status(201).json({ transaction });
  } catch (error) {
    console.error('Error creating deposit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Complete deposit
router.post('/deposit/complete', verifyToken, async (req, res) => {
  try {
    const { transactionId, txHash } = req.body;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      userId: req.user.userId,
      type: 'deposit',
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Update transaction
    transaction.status = 'completed';
    transaction.txHash = txHash;
    await transaction.save();

    // Update wallet balance
    const wallet = await Wallet.findOne({ userId: req.user.userId });
    if (wallet) {
      wallet.balance += transaction.amount;
      await wallet.save();
    }

    // Check if this is the first deposit
    const previousDeposits = await Transaction.find({
      userId: req.user.userId,
      type: 'deposit',
      status: 'completed',
      _id: { $ne: transaction._id }
    });

    if (previousDeposits.length === 0) {
      // This is the first deposit, process referral commission
      await processReferralCommission(req.user.userId, transaction.amount);
    }

    // Create notification
    await Notification.create({
      userId: req.user.userId,
      title: 'Deposit Completed',
      message: `Your deposit of $${transaction.amount} has been completed successfully.`,
      type: 'deposit'
    });

    // Send email
    const user = await User.findById(req.user.userId);
    if (user) {
      await sendEmail(
        user.email,
        'Deposit Completed',
        `Dear ${user.name},\n\nYour deposit of $${transaction.amount} has been completed successfully.\n\nThank you for using our platform!`
      );
    }

    res.json({ message: 'Deposit completed successfully', transaction });
  } catch (error) {
    console.error('Error completing deposit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Confirm deposit with transaction hash
router.post('/deposit/confirm', verifyToken, async (req, res) => {
  try {
    const { txHash, paymentMethod, network } = req.body;

    if (!txHash) {
      return res.status(400).json({ message: 'Transaction hash is required' });
    }

    // Find pending deposit transaction
    const transaction = await Transaction.findOne({
      userId: req.user.userId,
      type: 'deposit',
      status: 'pending',
      paymentMethod,
      network
    }).sort({ createdAt: -1 });

    if (!transaction) {
      return res.status(404).json({ message: 'No pending deposit found' });
    }

    // Update transaction with hash
    transaction.txHash = txHash;
    await transaction.save();

    // Create notification
    await Notification.create({
      userId: req.user.userId,
      title: 'Transaction Hash Submitted',
      message: `Your deposit transaction hash has been submitted and is pending verification.`,
      type: 'deposit'
    });

    res.json({ 
      message: 'Transaction hash submitted successfully',
      transaction
    });
  } catch (error) {
    console.error('Error confirming deposit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Request withdrawal
router.post('/withdraw', verifyToken, async (req, res) => {
  try {
    const { amount, paymentMethod, bitcoinAddress, usdtAddress } = req.body;
    
    if (amount < 10) {
      return res.status(400).json({ message: 'Minimum withdrawal amount is $10' });
    }

    const gains = await Gains.findOne({ userId: req.user.userId });
    
    if (!gains || gains.amount < amount) {
      return res.status(400).json({ message: 'Insufficient gains available' });
    }

    // Validate crypto address based on payment method
    if (paymentMethod === 'bitcoin' && !bitcoinAddress) {
      return res.status(400).json({ message: 'Bitcoin address is required' });
    }
    if (paymentMethod === 'usdt' && !usdtAddress) {
      return res.status(400).json({ message: 'USDT address is required' });
    }

    // Calculate crypto amount (simplified for demo)
    const cryptoAmount = paymentMethod === 'bitcoin' 
      ? amount / 40000 // Simulated BTC price
      : amount; // USDT is 1:1

    // Set network based on payment method
    const network = paymentMethod === 'bitcoin' ? 'BTC' : 'TRC20';

    // Create withdrawal request
    const withdrawalRequest = new WithdrawalRequest({
      userId: req.user.userId,
      amount,
      paymentMethod,
      bitcoinAddress,
      usdtAddress,
      network,
      cryptoAmount,
      status: 'pending'
    });
    await withdrawalRequest.save();

    // Deduct from available gains temporarily
    gains.amount -= amount;
    gains.pendingWithdrawals = (gains.pendingWithdrawals || 0) + amount;
    await gains.save();

    // Create transaction record
    const transaction = await Transaction.create({
      userId: req.user.userId,
      type: 'withdrawal',
      amount,
      cryptoAmount,
      status: 'pending',
      paymentMethod,
      network,
      bitcoinAddress,
      usdtAddress
    });

    // Create notification for user
    await Notification.create({
      userId: req.user.userId,
      title: 'Withdrawal Request Submitted',
      message: `Your withdrawal request for $${amount} (${cryptoAmount} ${paymentMethod.toUpperCase()}) has been submitted and is pending approval.`,
      type: 'withdrawal'
    });

    // Send email notification
    const user = await User.findById(req.user.userId);
    if (user) {
      const address = paymentMethod === 'bitcoin' ? bitcoinAddress : usdtAddress;
      await sendEmail(
        user.email,
        'Withdrawal Request Submitted',
        `Dear ${user.name},\n\nYour withdrawal request has been submitted and is pending approval.\n\nAmount: $${amount}\nCrypto Amount: ${cryptoAmount} ${paymentMethod.toUpperCase()}\nPayment Method: ${paymentMethod.toUpperCase()} (${network})\nAddress: ${address}\n\nYou will be notified once your request has been processed.\n\nThank you for using our platform!`
      );
    }

    res.status(201).json({ 
      message: 'Withdrawal request submitted successfully',
      transaction
    });
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});


// Handle withdrawal rejection
router.post('/withdraw/reject/:id', verifyToken, async (req, res) => {
  try {
    const withdrawalRequest = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawalRequest || withdrawalRequest.userId.toString() !== req.user.userId) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    // Return funds to gains balance
    const gains = await Gains.findOne({ userId: req.user.userId });
    if (gains) {
      gains.amount += withdrawalRequest.amount;
      gains.pendingWithdrawals -= withdrawalRequest.amount;
      await gains.save();
    }

    withdrawalRequest.status = 'rejected';
    await withdrawalRequest.save();

    // Create notification
    await Notification.create({
      userId: req.user.userId,
      title: 'Withdrawal Request Rejected',
      message: `Your withdrawal request for $${withdrawalRequest.amount} has been rejected. The funds have been returned to your gains balance.`,
      type: 'withdrawal'
    });

    res.json({ message: 'Withdrawal request rejected successfully' });
  } catch (error) {
    console.error('Error rejecting withdrawal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



// Get withdrawal requests
router.get('/withdrawals', verifyToken, async (req, res) => {
  try {
    const withdrawals = await WithdrawalRequest.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create investment
router.post('/invest', verifyToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId, amount } = req.body;
    console.log(`Investment initiated by user ${req.user.userId}, Product: ${productId}, Amount: ${amount}`); // Log

    if (amount < 9) {
      throw new Error('Minimum investment amount is $9');
    }

    const wallet = await Wallet.findOne({ userId: req.user.userId });
    if (!wallet || wallet.balance < amount) {
      console.error(`Insufficient funds for user ${req.user.userId}. Wallet Balance: ${wallet?.balance}`); // Log
      throw new Error('Insufficient funds');
    }

    wallet.balance -= amount;
    await wallet.save({ session });
    console.log(`Wallet balance updated for user ${req.user.userId}. New Balance: ${wallet.balance}`); // Log

    const investment = new Investment({
      userId: req.user.userId,
      productId,
      amount,
      currentValue: amount
    });

    await investment.save({ session });
    console.log(`Investment created for user ${req.user.userId}: ${investment}`); // Log

    await session.commitTransaction();
    res.status(201).json({ message: 'Investment created successfully' });
  } catch (error) {
    await session.abortTransaction();
    console.error(`Error creating investment: ${error.message}`); // Log
    res.status(400).json({ message: error.message || 'Failed to create investment' });
  } finally {
    session.endSession();
  }
});

// Get investments
router.get('/investments', verifyToken, async (req, res) => {
  try {
    const investments = await Investment.find({ userId: req.user.userId })
      .sort({ startDate: -1 });

    // Update investment values before sending
    for (const investment of investments) {
      const now = new Date();
      const lastUpdate = new Date(investment.lastUpdated);
      const daysSinceLastUpdate = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));

      if (daysSinceLastUpdate > 0) {
        const dailyGainRate = 0.01; // 1%
        const gainAmount = investment.amount * dailyGainRate * daysSinceLastUpdate;
        investment.currentValue += gainAmount;
        investment.lastUpdated = now;
        await investment.save();
      }
    }

    res.json(investments);
  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;


