const User = require('../models/User');
const TempSignup = require('../models/TempSignup');
const sendEmail = require('../utils/sendEmail');
const cryptoUtils = require('../utils/cryptoUtils');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const crypto = require('crypto');

// Helper Token Generation
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '30d' });
};

// Joi Schemas
const signupSchema = Joi.object({
    name: Joi.string().min(2).max(50).required().trim(),
    email: Joi.string().email().required().lowercase().trim(),
    password: Joi.string().min(6).required()
});

const verifySchema = Joi.object({
    email: Joi.string().email().required().lowercase().trim(),
    otp: Joi.string().length(6).pattern(/^[0-9]+$/).required()
});

const resendSchema = Joi.object({
    email: Joi.string().email().required().lowercase().trim()
});

// ─── Phase 2 Step 1 & 2: Initiate Signup & Send OTP ─────────────────────────
// @route   POST /api/app/signup
const signupApp = async (req, res) => {
    try {
        // 1. Validate Input
        const { error, value } = signupSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }
        const { name, email, password } = value;

        // 2. Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // 3. Generate Crypto-Secure OTP
        const otp = crypto.randomInt(100000, 999999).toString();

        // 4. Hash OTP (bcrypt)
        const salt = await bcrypt.genSalt(10);
        const hashedOtp = await bcrypt.hash(otp, salt);

        // 5. Encrypt Password (AES) - Secure transient storage
        const encryptedPassword = cryptoUtils.encrypt(password);

        // 6. Delete any existing unverified temp record for this email (clean slate)
        const existingTemp = await TempSignup.findOne({ email });
        if (existingTemp) {
            // Check rate limiting on attempts? Handled by middleware mostly, but good to check created time.
            // If recently created (< 1 min), maybe block? Let's rely on middleware.
            await TempSignup.deleteOne({ email });
        }

        // 7. Store Temp Record
        await TempSignup.create({
            name,
            email,
            encryptedPassword,
            otpHash: hashedOtp,
            attempts: 0
            // expires automatically via TTL
        });

        // 8. Build Email Template
        const message = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4A90E2; text-align: center;">Verify Your Email</h2>
            <p style="font-size: 16px; color: #333;">Hello <strong>${name}</strong>,</p>
            <p style="font-size: 16px; color: #555;">Please verify your email address to complete your registration.</p>
            <div style="background-color: #f4f6f8; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
                <span style="font-size: 24px; letter-spacing: 5px; font-weight: bold; color: #333;">${otp}</span>
            </div>
            <p style="font-size: 14px; color: #777;">This code will expire in 5 minutes.</p>
            <p style="font-size: 14px; color: #999; margin-top: 30px;">If you didn't request this code, please ignore this email.</p>
        </div>
        `;

        // 9. Send Email
        await sendEmail({
            email,
            subject: 'Your Verification Code',
            message
        });

        res.status(200).json({ message: 'Verification code sent to email' });

    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'Failed to initiate signup. Please try again.' });
    }
};

// ─── Phase 2 Step 3 & 4: Verify OTP & Create Account ───────────────────────
// @route   POST /api/app/verify-signup-otp
const verifySignupOtp = async (req, res) => {
    try {
        // 1. Validate Input
        const { error, value } = verifySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }
        const { email, otp } = value;

        // 2. Find Temp Record
        const tempUser = await TempSignup.findOne({ email });

        if (!tempUser) {
            return res.status(400).json({ message: 'Verification code expired or invalid email' });
        }

        // 3. Check Attempt Limit (Max 5 within TTL)
        if (tempUser.attempts >= 5) {
            await TempSignup.deleteOne({ email }); // Security: delete record on max attempts
            return res.status(400).json({ message: 'Too many failed attempts. Please restart signup.' });
        }

        // 4. Verify OTP Hash
        const isMatch = await bcrypt.compare(otp, tempUser.otpHash);

        if (!isMatch) {
            // Increment attempt counter
            tempUser.attempts += 1;
            await tempUser.save();
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        // 5. Final Duplicate Check (Race conditions)
        const userExists = await User.findOne({ email });
        if (userExists) {
            await TempSignup.deleteOne({ email });
            return res.status(400).json({ message: 'User already exists' });
        }

        // 6. Decrypt Password (get original plain text)
        let originalPassword;
        try {
            originalPassword = cryptoUtils.decrypt(tempUser.encryptedPassword);
        } catch (e) {
            await TempSignup.deleteOne({ email });
            return res.status(500).json({ message: 'Security error. Please try signing up again.' });
        }

        // 7. Create User (Standard User model hashing flows normally)
        // Even though temp storage was encrypted, User model expects plain text to hash it.
        const newUser = await User.create({
            name: tempUser.name,
            email: tempUser.email,
            password: originalPassword, // Will be hashed by User model pre-save hook
            role: 'user',
            status: 'active',
            mobileAccessEnabled: true
        });

        if (newUser) {
            // Cleanup Temp Record
            await TempSignup.deleteOne({ email });

            // Generate Token
            const token = generateToken(newUser._id);

            res.status(201).json({
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                status: newUser.status,
                token,
                mobileAccessEnabled: newUser.mobileAccessEnabled
            });
        } else {
            res.status(400).json({ message: 'Failed to create account' });
        }

    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ message: 'Verification failed due to server error' });
    }
};

// ─── Resend Logic (Rate Limited Middleware Applied) ────────────────────────
// @route   POST /api/app/resend-otp
const resendOtpApp = async (req, res) => {
    try {
        const { error, value } = resendSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }
        const { email } = value;

        // Check if temp record exists
        const tempUser = await TempSignup.findOne({ email });
        if (!tempUser) {
            return res.status(404).json({ message: 'Session expired. Please sign up again.' });
        }

        // Check attempt count logic? Maybe reset attempts on resend?
        // Usually resend invalidates old code.

        // Generate NEW OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const salt = await bcrypt.genSalt(10);
        const hashedOtp = await bcrypt.hash(otp, salt);

        // Update Record (Reset attempts, update hash, reset expiry via updatedAt if using timestamp update?)
        // Mongoose 'expires' uses createdAt. We must update createdAt to refresh specific TTL or document won't live longer.
        // Actually, updating document doesn't reset TTL usually in Mongo unless field updated.
        // So we update createdAt manually.

        tempUser.otpHash = hashedOtp;
        tempUser.attempts = 0; // Reset verification attempts for new code
        tempUser.createdAt = new Date(); // Reset TTL
        await tempUser.save();

        // Send Email
        const message = `
        <div style="font-family: Arial, sans-serif;">
            <h2>Verification Code Resent</h2>
            <p>Your new verification code is:</p>
            <h3>${otp}</h3>
            <p>Valid for 5 minutes.</p>
        </div>
        `;

        await sendEmail({
            email,
            subject: 'New Verification Code',
            message
        });

        res.status(200).json({ message: 'New code sent successfully' });

    } catch (error) {
        console.error('Resend Error:', error);
        res.status(500).json({ message: 'Failed to resend code' });
    }
};

module.exports = {
    signupApp,
    resendOtpApp,
    verifySignupOtp
};
