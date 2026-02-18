const mongoose = require('mongoose');

const tempSignupSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    otpHash: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // 10 minutes (600 seconds)
    }
});

const TempSignup = mongoose.model('TempSignup', tempSignupSchema);

module.exports = TempSignup;
