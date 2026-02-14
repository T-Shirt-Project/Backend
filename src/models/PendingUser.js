const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pendingUserSchema = mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    phoneNumber: { type: String },
    otpHash: { type: String, required: true },
    otpExpiry: { type: Date, required: true }
}, { timestamps: true });

// Hash password before saving pending user
pendingUserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Auto-delete pending users after 30 minutes (safety buffer > 10 min OTP)
pendingUserSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 });

module.exports = mongoose.model('PendingUser', pendingUserSchema);
