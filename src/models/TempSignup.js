const mongoose = require('mongoose');

const tempSignupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true, // Only one active verification per email
        lowercase: true,
        trim: true
    },
    // Encrypted password (AES), NOT plain text, NOT bcrypt hash (yet)
    // Allows retrieving original password to hash properly on User creation
    encryptedPassword: {
        type: String,
        required: true
    },
    otpHash: {
        type: String,
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300 // 5 minutes TTL (automatically deleted by MongoDB)
    }
});

// Ensure indexes are created for expiry and uniqueness
tempSignupSchema.index({ createdAt: 1 }, { expireAfterSeconds: 300 });
tempSignupSchema.index({ email: 1 }, { unique: true });

const TempSignup = mongoose.model('TempSignup', tempSignupSchema);

module.exports = TempSignup;
