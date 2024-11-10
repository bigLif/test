import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Create the model
const Wallet = mongoose.model('Wallet', walletSchema);

// Export the model
export default Wallet;