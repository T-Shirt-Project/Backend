const express = require('express');
const router = express.Router();
const { signupApp, resendOtpApp, verifySignupOtp } = require('../controllers/appController');

// @desc    Initiate Signup (Send OTP)
// @route   POST /api/app/signup
router.post('/signup', signupApp);

// @desc    Resend OTP (Using email only)
// @route   POST /api/app/resend-otp
router.post('/resend-otp', resendOtpApp);

// @desc    Verify OTP and Create Account
// @route   POST /api/app/verify-signup-otp
router.post('/verify-signup-otp', verifySignupOtp);

module.exports = router;
