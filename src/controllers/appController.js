const User = require('../models/User');
const TempSignup = require('../models/TempSignup');
const sendEmail = require('../utils/sendEmail');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '30d' });
};

// ─── Professional HTML Email Template ────────────────────────────────
const buildOtpEmail = (name, otp, isResend = false) => {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <!-- Header -->
            <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 32px; text-align: center;">
                    <div style="width: 64px; height: 64px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 16px; line-height: 64px; font-size: 28px;">
                        ✉️
                    </div>
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0;">${isResend ? 'Resend Verification' : 'Verify Your Email'}</h1>
                </td>
            </tr>
            <!-- Body -->
            <tr>
                <td style="padding: 40px 32px;">
                    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 8px;">
                        Hello <strong>${name}</strong>,
                    </p>
                    <p style="color: #555555; font-size: 15px; line-height: 1.6; margin: 0 0 32px;">
                        ${isResend ? 'You requested a new verification code.' : 'Thank you for signing up! Please use the code below to verify your email address and complete your registration.'}
                    </p>
                    <!-- OTP Box -->
                    <div style="background: linear-gradient(135deg, #f8f9ff 0%, #eef1ff 100%); border: 2px dashed #667eea; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 32px;">
                        <p style="color: #888; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 12px; font-weight: 600;">Your Verification Code</p>
                        <div style="font-size: 40px; font-weight: 800; color: #667eea; letter-spacing: 10px; font-family: 'Courier New', monospace;">${otp}</div>
                    </div>
                    <!-- Expiry Notice -->
                    <div style="background-color: #fff8e1; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
                        <p style="color: #8d6e00; font-size: 14px; margin: 0;">
                            ⏱️ This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.
                        </p>
                    </div>
                    <p style="color: #999999; font-size: 13px; line-height: 1.6; margin: 0;">
                        If you didn't create an account, please ignore this email. No action is needed.
                    </p>
                </td>
            </tr>
            <!-- Footer -->
            <tr>
                <td style="background-color: #f8f9fa; padding: 24px 32px; text-align: center; border-top: 1px solid #e9ecef;">
                    <p style="color: #aaa; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} T-Shirt Store. All rights reserved.
                    </p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
};

// @desc    Initiate Signup (Flutter App Only)
// @route   POST /api/app/signup
const signupApp = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide name, email, and password' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Check if user already exists
        const userExists = await User.findOne({ email: normalizedEmail });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // 2. Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 3. Hash OTP
        const salt = await bcrypt.genSalt(10);
        const hashedOtp = await bcrypt.hash(otp, salt);

        // 4. Store/Update temporary signup record (invalidates old OTP on resend)
        let tempUser = await TempSignup.findOne({ email: normalizedEmail });

        if (tempUser) {
            tempUser.name = name;
            tempUser.password = password;
            tempUser.otpHash = hashedOtp;
            tempUser.createdAt = Date.now(); // Reset expiry
            await tempUser.save();
        } else {
            tempUser = await TempSignup.create({
                name,
                email: normalizedEmail,
                password,
                otpHash: hashedOtp
            });
        }

        // 5. Build & Send Email
        const message = buildOtpEmail(name, otp, false);

        await sendEmail({
            email: normalizedEmail,
            subject: 'Verify Your Email Address',
            message
        });

        res.status(200).json({ message: 'OTP sent to email successfully' });

    } catch (error) {
        console.error('Signup App Error:', error);

        // Generic error handling for email or other failures
        // Do NOT expose internal error details to the client
        return res.status(500).json({ message: 'Failed to send OTP. Please try again later.' });
    }
};

// @desc    Resend OTP (Flutter App Only, email-only — no password needed)
// @route   POST /api/app/resend-otp
const resendOtpApp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Find temporary signup record
        const tempUser = await TempSignup.findOne({ email: normalizedEmail });

        if (!tempUser) {
            return res.status(404).json({ message: 'Signup session expired. Please sign up again.' });
        }

        // 2. Generate new 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 3. Hash OTP
        const salt = await bcrypt.genSalt(10);
        const hashedOtp = await bcrypt.hash(otp, salt);

        // 4. Update temporary record (invalidates old OTP)
        tempUser.otpHash = hashedOtp;
        tempUser.createdAt = Date.now(); // Reset expiry
        await tempUser.save();

        // 5. Build & Send Email
        const message = buildOtpEmail(tempUser.name, otp, true);

        await sendEmail({
            email: normalizedEmail,
            subject: 'Verify Your Email Address',
            message
        });

        res.status(200).json({ message: 'OTP resent successfully' });

    } catch (error) {
        console.error('Resend OTP App Error:', error);
        return res.status(500).json({ message: 'Failed to resend OTP. Please try again later.' });
    }
};

// @desc    Verify OTP and Create Account (Flutter App Only)
// @route   POST /api/app/verify-signup-otp
const verifySignupOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Find temporary signup record
        const tempUser = await TempSignup.findOne({ email: normalizedEmail });

        if (!tempUser) {
            return res.status(400).json({ message: 'OTP expired or invalid email' });
        }

        // 2. Validate OTP
        const isMatch = await bcrypt.compare(otp, tempUser.otpHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // 3. Double-check for race condition
        const userExists = await User.findOne({ email: normalizedEmail });
        if (userExists) {
            await TempSignup.deleteOne({ email: normalizedEmail });
            return res.status(400).json({ message: 'User already exists' });
        }

        // 4. Create User (password hashed by User model pre-save hook)
        const newUser = await User.create({
            name: tempUser.name,
            email: tempUser.email,
            password: tempUser.password,
            role: 'user',
            status: 'active',
            mobileAccessEnabled: true
        });

        if (newUser) {
            // 5. Delete temporary record
            await TempSignup.deleteOne({ email: normalizedEmail });

            // 6. Generate JWT
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
            res.status(400).json({ message: 'Failed to create user' });
        }

    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ message: 'Server Error during verification' });
    }
};

module.exports = {
    signupApp,
    resendOtpApp,
    verifySignupOtp
};
