import mongoose from 'mongoose';
import crypto from 'crypto';

const referralTreeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  referralCode: {
    type: String,
    unique: true
  },
  referrals: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'active'],
      default: 'pending'
    },
    totalEarnings: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  totalEarnings: {
    type: Number,
    default: 0
  },
  totalReferrals: {
    type: Number,
    default: 0
  },
  activeReferrals: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate unique referral code before saving
referralTreeSchema.pre('validate', async function(next) {
  if (!this.referralCode) {
    this.referralCode = await this.generateUniqueCode();
  }
  next();
});

// Method to generate unique referral code
referralTreeSchema.methods.generateUniqueCode = async function() {
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    // Generate 8 character code
    code = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Check if code exists
    const existing = await this.constructor.findOne({ referralCode: code });
    if (!existing) {
      isUnique = true;
    }
  }
  
  return code;
};

// Method to add new referral
referralTreeSchema.methods.addReferral = async function(userId) {
  if (this.referrals.some(ref => ref.userId.equals(userId))) {
    throw new Error('User is already referred');
  }

  this.referrals.push({ userId });
  this.totalReferrals += 1;
  await this.save();
};

// Method to update referral status
referralTreeSchema.methods.updateReferralStatus = async function(userId, status) {
  const referral = this.referrals.find(ref => ref.userId.equals(userId));
  if (!referral) {
    throw new Error('Referral not found');
  }

  referral.status = status;
  if (status === 'active') {
    this.activeReferrals += 1;
  }
  await this.save();
};

// Method to add earnings
referralTreeSchema.methods.addEarnings = async function(userId, amount) {
  const referral = this.referrals.find(ref => ref.userId.equals(userId));
  if (!referral) {
    throw new Error('Referral not found');
  }

  referral.totalEarnings += amount;
  this.totalEarnings += amount;
  await this.save();
};

// Method to get referral tree
referralTreeSchema.methods.getTree = async function(depth = 3) {
  const tree = await this.constructor
    .findById(this._id)
    .populate({
      path: 'referrals.userId',
      select: 'name email'
    })
    .lean();

  if (depth > 1) {
    for (const referral of tree.referrals) {
      const childTree = await this.constructor.findOne({ userId: referral.userId._id });
      if (childTree) {
        referral.children = await childTree.getTree(depth - 1);
      }
    }
  }

  return tree;
};

// Create indexes
referralTreeSchema.index({ userId: 1 }, { unique: true });
referralTreeSchema.index({ referralCode: 1 }, { unique: true });

export default mongoose.model('ReferralTree', referralTreeSchema);