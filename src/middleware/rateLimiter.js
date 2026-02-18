const rateLimit = require('express-rate-limit');

// Helper to standardise responses
const limitHandler = (req, res, next, options) => {
    res.status(429).json({
        message: options.message || 'Too many attempts, please try again later.',
        error: 'Too many requests'
    });
};

// Signup Rate Limiter: Prevent automated account creation spam
// Limit each IP to 10 requests per 10 minutes (sufficient for legitimate retries)
const signupLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: 'Too many signup attempts. Please try again after 10 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitHandler
});

// Verification Rate Limiter: Prevent OTP brute force
// Limit each IP to 20 verification attempts per 10 minutes
const verifyLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: 'Too many verification attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitHandler
});

// Resend Rate Limiter: Prevent email spam
// Stricter limit: 3 resend requests per 15 minutes
const resendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: 'Too many resend requests. Please check your email or wait 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitHandler
});

module.exports = {
    signupLimiter,
    verifyLimiter,
    resendLimiter
};
