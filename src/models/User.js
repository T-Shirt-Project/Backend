const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Not required if using OAuth
    googleId: { type: String, unique: true, sparse: true }, // OAuth ID
    refreshTokens: [{ type: String }], // Store valid refresh tokens (hashed ideally)
    role: {
        type: String,
        enum: ['user', 'seller', 'admin'],
        default: 'user'
    },
    status: {
        type: String,
        enum: ['active', 'disabled', 'suspended'],
        default: 'active'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    verificationTokenExpire: Date,
    otpHash: String,
    otpExpiresAt: Date,
    addresses: [{
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
        isDefault: { type: Boolean, default: false }
    }],
    phoneNumber: { type: String },
    fcmToken: { type: String, index: true }, // For Push Notifications
}, { timestamps: true });

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.getVerificationToken = function () {
    // Generate token
    const verificationToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to verificationToken field
    this.verificationToken = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');

    // Set expire (15 minutes)
    this.verificationTokenExpire = Date.now() + 15 * 60 * 1000;

    return verificationToken;
};

userSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);
module.exports = User;
