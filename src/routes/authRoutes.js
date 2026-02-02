const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');

// @desc    Initiate Google OAuth
// @route   GET /api/auth/google
router.get('/google', (req, res, next) => {
    // Store platform info in session for callback
    const platform = req.query.platform || 'web';
    const state = req.query.state || '';

    // Pass state through OAuth flow
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: JSON.stringify({ platform, customState: state })
    })(req, res, next);
});

// @desc    Google OAuth Callback
// @route   GET /api/auth/google/callback
router.get('/google/callback',
    (req, res, next) => {
        passport.authenticate('google', {
            session: false,
            failureRedirect: '/login?error=oauth_failed'
        }, async (err, user, info) => {
            try {
                if (err || !user) {
                    console.error('OAuth Error:', err || 'No user returned');
                    // Determine platform from state
                    let platform = 'web';
                    try {
                        const stateData = JSON.parse(req.query.state || '{}');
                        platform = stateData.platform || 'web';
                    } catch (e) {
                        // Ignore parse error
                    }

                    if (platform === 'mobile') {
                        return res.redirect('tshirtapp://auth-error?message=Google authentication failed');
                    }
                    return res.redirect('/login?error=oauth_failed');
                }

                // Generate Tokens
                const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
                const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET || 'refresh_secret', { expiresIn: '7d' });

                // Save Refresh Token in DB
                if (!user.refreshTokens) {
                    user.refreshTokens = [];
                }
                user.refreshTokens.push(refreshToken);
                await user.save();

                // Determine redirect based on platform
                let platform = 'web';
                try {
                    const stateData = JSON.parse(req.query.state || '{}');
                    platform = stateData.platform || 'web';
                } catch (e) {
                    // Default to web
                }

                if (platform === 'mobile') {
                    // Mobile deep link
                    const deepLink = `tshirtapp://auth-success?access_token=${accessToken}&refresh_token=${refreshToken}`;
                    return res.redirect(deepLink);
                } else {
                    // Web redirect - send to a success page with tokens in URL (or use postMessage)
                    return res.redirect(`/auth-success?access_token=${accessToken}&refresh_token=${refreshToken}`);
                }
            } catch (error) {
                console.error('Callback processing error:', error);
                return res.redirect('/login?error=server_error');
            }
        })(req, res, next);
    }
);

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
