import mongoose from 'mongoose';

const referralSettingsSchema = new mongoose.Schema({
  commissionRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 3 // Default 3%
  },
  minDepositAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 10
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure only one settings document exists
referralSettingsSchema.statics.getSettings = async function() {
  const settings = await this.findOne();
  if (settings) return settings;
  
  return this.create({
    commissionRate: 3,
    minDepositAmount: 10
  });
};

export default mongoose.model('ReferralSettings', referralSettingsSchema);