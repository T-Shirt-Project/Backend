const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');

// Google OAuth routes removed


// @desc    Refresh Access Token
// @route   POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh_secret');
        const user = await User.findById(decoded.id);

        if (!user || !user.refreshTokens.includes(refreshToken)) {
            return res.status(403).json({ message: 'Invalid refresh token' });
        }

        // Token Rotation: Remove old, add new
        const newAccessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
        const newRefreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET || 'refresh_secret', { expiresIn: '7d' });

        user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
        user.refreshTokens.push(newRefreshToken);
        await user.save();

        res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (error) {
        return res.status(403).json({ message: 'Invalid refresh token key' });
    }
});

// @desc    Logout (Revoke Refresh Token)
// @route   POST /api/auth/logout
router.post('/logout', async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        // We might not know the user if access token is expired, so decode refresh token
        try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh_secret');
            const user = await User.findById(decoded.id);
            if (user) {
                user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
                await user.save();
            }
        } catch (e) {
            // Ignore error, just logout
        }
    }
    res.json({ message: 'Logged out' });
});

module.exports = router;
