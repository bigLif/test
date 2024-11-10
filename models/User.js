import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  verificationExpires: { type: Date },
  referralCode: { 
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);