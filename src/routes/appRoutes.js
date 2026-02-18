const express = require('express');
const router = express.Router();
const { signupApp } = require('../controllers/appController');
const { signupLimiter } = require('../middleware/rateLimiter');

// @desc    Direct Signup (No OTP)
// @route   POST /api/app/signup
router.post('/signup', signupLimiter, signupApp);

module.exports = router;
