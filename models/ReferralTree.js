import mongoose from 'mongoose';

const referralTreeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  referralCode: {
    type: String,
    required: true,
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

// Pre-save middleware to generate unique referral code
referralTreeSchema.pre('save', async function(next) {
  if (!this.referralCode) {
    let isUnique = false;
    let code;
    
    while (!isUnique) {
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const existing = await this.constructor.findOne({ referralCode: code });
      if (!existing) {
        isUnique = true;
      }
    }
    
    this.referralCode = code;
  }
  next();
});

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

export default mongoose.model('ReferralTree', referralTreeSchema);