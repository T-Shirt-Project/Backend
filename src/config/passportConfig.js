const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const configurePassport = () => {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID || 'dummy_id',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_secret',
        callbackURL: "/api/auth/google/callback"
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Validate email from provider
                if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
                    return done(new Error('No email provided by Google'), null);
                }

                // Normalize email (lowercase, trim)
                const email = profile.emails[0].value.toLowerCase().trim();
                const name = profile.displayName || email.split('@')[0];

                // Check if user exists by Google ID
                let user = await User.findOne({ googleId: profile.id });

                if (user) {
                    // Update email if changed
                    if (user.email !== email) {
                        user.email = email;
                        await user.save();
                    }
                    return done(null, user);
                }

                // Check if user exists by Email (to link accounts)
                user = await User.findOne({ email });

                if (user) {
                    // Link Google account to existing user
                    user.googleId = profile.id;
                    await user.save();
                    return done(null, user);
                }

                // Create new user
                user = await User.create({
                    name,
                    email,
                    googleId: profile.id,
                    role: 'user',
                    status: 'active',
                    refreshTokens: []
                });

                return done(null, user);
            } catch (error) {
                console.error('Google OAuth Strategy Error:', error);
                return done(error, null);
            }
        }));
};

module.exports = configurePassport;
