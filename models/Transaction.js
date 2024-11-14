import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'investment'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['bitcoin', 'usdt', 'balance', 'wallet'], // Added 'wallet' as valid payment method
    required: true
  },
  cryptoAmount: {
    type: Number
  },
  bitcoinAddress: String,
  usdtAddress: String,
  txHash: String,
  network: {
    type: String,
    enum: ['BTC', 'TRC20']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Transaction', transactionSchema);