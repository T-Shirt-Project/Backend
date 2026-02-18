const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

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

/**
 * @desc    Direct Signup (Email verification removed)
 * @route   POST /api/app/signup
 */
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

        // 3. Create User directly (User model hashes password in pre-save hook)
        const user = await User.create({
            name,
            email,
            password,
            role: 'user',
            status: 'active',
            mobileAccessEnabled: true
        });

        if (user) {
            const token = generateToken(user._id);

            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                token,
                mobileAccessEnabled: user.mobileAccessEnabled
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'Server error during signup' });
    }
};

module.exports = {
    signupApp
};
