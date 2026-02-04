const mongoose = require('mongoose');
const User = require('../models/User');
const Activity = require('../models/Activity');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sendEmail = require('../utils/sendEmail');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '30d' });
};

// @desc Auth user & get token
// @route POST /api/users/login
const authUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide both email and password' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (user && (await user.matchPassword(password))) {
            if (!user.isVerified) {
                return res.status(401).json({ message: 'Please verify your email before logging in.' });
            }
            if (user.status === 'suspended') {
                return res.status(403).json({ message: 'Account suspended. Access terminated.' });
            }
            if (user.status === 'disabled') {
                return res.status(401).json({ message: 'Account disabled. Pending approval.' });
            }
            if (user.status === 'deleted') {
                return res.status(401).json({ message: 'Account deleted. Access restricted.' });
            }

            // Log login activity
            await Activity.create({
                userId: user._id,
                role: user.role,
                type: 'login',
                targetType: 'User',
                targetId: user._id,
                description: `${user.name} logged into the system.`,
                details: { ip: req.ip, userAgent: req.headers['user-agent'] }
            });

            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                phoneNumber: user.phoneNumber,
                token: generateToken(user._id),
                addresses: user.addresses
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Authentication service unavailable' });
    }
};

// @desc Register a new user
// @route POST /api/users
const registerUser = async (req, res) => {
    try {
        const { name, email, password, role, phoneNumber } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const userExists = await User.findOne({ email: normalizedEmail });

        if (userExists) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        // Role enforcement: No Retailer. Only User or Seller. Admin cannot be self-registered.
        const finalRole = (role === 'seller') ? 'seller' : 'user';

        // Sellers need approval (start as disabled)
        // Users are active immediately
        const status = finalRole === 'user' ? 'active' : 'disabled';

        const user = await User.create({
            name,
            email: normalizedEmail,
            password,
            role: finalRole,
            phoneNumber,
            status,
            isVerified: false // Force verification
        });

        if (user) {
            // Log registration
            await Activity.create({
                userId: user._id,
                role: finalRole,
                type: 'registration',
                targetType: 'User',
                targetId: user._id,
                description: `New ${finalRole} account registered: ${user.name}`,
                details: { email: user.email, role: finalRole }
            });

            // Verification Flow
            try {
                const verificationToken = user.getVerificationToken();
                await user.save({ validateBeforeSave: false });

                // Construct Verify URL
                // If simple API:
                const verifyUrl = `${req.protocol}://${req.get('host')}/api/users/verifyemail/${verificationToken}`;

                // Email message
                const message = `
                    <h1>Welcome to T-Shirt App!</h1>
                    <p>Please verify your email address to activate your account.</p>
                    <a href="${verifyUrl}" style="background:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Email</a>
                    <p>Or click this link: <a href="${verifyUrl}">${verifyUrl}</a></p>
                    <p>This link expires in 15 minutes.</p>
                `;

                await sendEmail({
                    email: user.email,
                    subject: 'Verify your email - T-Shirt App',
                    message: `Please verify your email: ${verifyUrl}`,
                    html: message
                });

                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    message: `Registration successful. Verification email sent to ${user.email}.`
                });

            } catch (error) {
                console.error("Email send error:", error);
                user.verificationToken = undefined;
                user.verificationTokenExpire = undefined;
                await user.save({ validateBeforeSave: false });
                res.status(500).json({ message: 'User registered, but email failed. Please contact support.' });
            }
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Registration failed. Please try again.' });
    }
};

// @desc Verify User Email
// @route GET /api/users/verifyemail/:token
const verifyEmail = async (req, res) => {
    try {
        const token = req.params.token;
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            verificationToken: hashedToken,
            verificationTokenExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).send(`
                <h1 style="color:red;text-align:center;font-family:sans-serif;margin-top:50px;">
                    Invalid or Expired Token
                </h1>
            `);
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpire = undefined;
        await user.save();

        res.status(200).send(`
            <div style="text-align:center;font-family:sans-serif;margin-top:50px;">
                <h1 style="color:green;">Email Verified Successfully!</h1>
                <p>You can now close this window and log in to the app.</p>
            </div>
        `);
    } catch (error) {
        res.status(500).send("Server Error");
    }
};

// @desc Request OTP for Login/Verification
// @route POST /api/users/request-otp
const requestOtp = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.status === 'suspended' || user.status === 'disabled') {
        return res.status(403).json({ message: 'Account access restricted.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP securely
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    user.otpHash = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    await user.save({ validateBeforeSave: false });

    // Load HTML Template
    let templatePath = path.join(__dirname, '../templates/otp-verification.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    // Inject Data
    htmlContent = htmlContent.replace('{{OTP_CODE}}', otp);
    htmlContent = htmlContent.replace('{{YEAR}}', new Date().getFullYear());

    try {
        await sendEmail({
            email: user.email,
            subject: 'Your Verification Code - T-Shirt App',
            message: `Your OTP is ${otp}. Valid for 10 minutes.`,
            html: htmlContent
        });

        res.json({ message: 'OTP sent to your email.' });
    } catch (error) {
        user.otpHash = undefined;
        user.otpExpiresAt = undefined;
        await user.save({ validateBeforeSave: false });
        res.status(500).json({ message: 'Failed to send OTP email.' });
    }
};

// @desc Verify OTP
// @route POST /api/users/verify-otp
const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otpHash || !user.otpExpiresAt) {
        return res.status(400).json({ message: 'No OTP requested or expired.' });
    }

    if (user.otpExpiresAt < Date.now()) {
        return res.status(400).json({ message: 'OTP has expired.' });
    }

    const inputHash = crypto.createHash('sha256').update(otp).digest('hex');

    if (inputHash !== user.otpHash) {
        return res.status(400).json({ message: 'Invalid OTP.' });
    }

    // Success - Clear OTP and Mark Verified
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.isVerified = true;
    await user.save();

    // Log Logic
    await Activity.create({
        userId: user._id,
        role: user.role,
        type: 'login',
        targetType: 'User',
        targetId: user._id,
        description: `${user.name} logged in via OTP.`,
        details: { ip: req.ip, method: 'OTP' }
    });

    res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        token: generateToken(user._id),
        message: 'Login successful'
    });
};

// @desc Get user profile
// @route GET /api/users/profile
const getUserProfile = async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            phoneNumber: user.phoneNumber,
            addresses: user.addresses
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

// @desc Update user profile
// @route PUT /api/users/profile
const updateUserProfile = async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;
        user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();

        // Log profile update
        await Activity.create({
            userId: user._id,
            role: user.role,
            type: 'profile_updated',
            targetType: 'User',
            targetId: user._id,
            description: `${user.name} updated their profile details.`,
            details: { fields: Object.keys(req.body).filter(k => k !== 'password') }
        });

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            phoneNumber: updatedUser.phoneNumber,
            role: updatedUser.role,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

// @desc Add address
// @route POST /api/users/address
const addAddress = async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user) {
        const { street, city, state, zipCode, country, isDefault } = req.body;
        if (isDefault) {
            user.addresses.forEach(a => a.isDefault = false);
        }
        user.addresses.push({ street, city, state, zipCode, country, isDefault });
        const updatedUser = await user.save();

        // Log address addition
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'address_added',
            targetType: 'Address',
            description: `Added a new address: ${street}, ${city}`,
            details: { address: { street, city, state, zipCode, country } }
        });

        res.status(201).json(updatedUser.addresses);
    } else {
        res.status(404).json({ message: 'User not found' });
    }
}

// @desc Get user by ID (Admin)
// @route GET /api/users/:id
const getUserById = async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

// @desc Get all users (Admin)
// @route GET /api/users
const getUsers = async (req, res) => {
    const { status, role } = req.query;
    let query = {};
    if (status) query.status = status;
    if (role) query.role = role;

    const users = await User.find(query).select('-password');
    res.json(users);
};

// @desc Delete user (Soft Delete)
// @route DELETE /api/users/:id
// IMPORTANT: This is a SOFT DELETE to preserve order history
// Orders contain userSnapshot and remain intact after user deletion
const deleteUser = async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deletion of admin accounts
    if (user.role === 'admin') {
        return res.status(403).json({ message: 'Cannot delete admin accounts' });
    }

    // SOFT DELETE: Mark user as deleted instead of removing from database
    // This preserves data integrity for:
    // - Order history (userSnapshot remains valid)
    // - Audit trails
    // - Legal compliance
    user.status = 'deleted';
    user.email = `deleted_${Date.now()}_${user.email}`; // Prevent email conflicts
    await user.save();

    // Log activity
    await Activity.create({
        userId: req.user._id,
        role: req.user.role,
        type: 'user_deleted',
        targetType: 'User',
        targetId: user._id,
        description: `Admin deleted user account: ${user.name}`,
        details: {
            deletedUserId: user._id,
            deletedUserName: user.name,
            deletedUserRole: user.role,
            adminId: req.user._id,
            timestamp: new Date()
        }
    });

    res.json({
        message: 'User account deleted successfully',
        note: 'Order history preserved'
    });
};

// @desc Update user (Admin)
// @route PUT /api/users/:id
const updateUser = async (req, res) => {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await User.findById(req.params.id);

    if (user) {
        // Prevent self-modification of strict fields by Admin
        if (req.user._id.toString() === user._id.toString()) {
            if (req.body.status) {
                const normalizedStatus = req.body.status.toLowerCase().trim();
                if (normalizedStatus !== 'active') {
                    return res.status(400).json({ message: 'You cannot disable or suspend your own account.' });
                }
            }
            if (req.body.role && req.body.role !== 'admin') {
                return res.status(400).json({ message: 'You cannot demote your own admin privileges.' });
            }
        }

        const oldStatus = user.status;
        const oldRole = user.role;

        // Update basic fields if provided
        if (req.body.name) user.name = req.body.name;
        if (req.body.email) user.email = req.body.email;
        if (req.body.phoneNumber) user.phoneNumber = req.body.phoneNumber;

        // Role enforcement
        if (req.body.role) {
            const normalizedRole = req.body.role.toLowerCase().trim();
            if (['user', 'seller', 'admin'].includes(normalizedRole)) {
                user.role = normalizedRole;
            }
        }

        // Status enforcement
        if (req.body.status) {
            const normalizedStatus = req.body.status.toLowerCase().trim();
            if (['active', 'disabled', 'suspended'].includes(normalizedStatus)) {
                user.status = normalizedStatus;
            } else {
                return res.status(400).json({ message: 'Invalid status value' });
            }
        }

        const updatedUser = await user.save();

        // Log status changes
        if (oldStatus !== updatedUser.status) {
            await Activity.create({
                userId: req.user._id,
                role: req.user.role,
                type: 'status_change',
                targetType: 'User',
                targetId: user._id,
                description: `Changed status of ${user.name} from ${oldStatus} to ${updatedUser.status}`,
                details: { from: oldStatus, to: updatedUser.status }
            });
        }

        // Log role changes
        if (oldRole !== updatedUser.role) {
            await Activity.create({
                userId: req.user._id,
                role: req.user.role,
                type: 'role_change',
                targetType: 'User',
                targetId: user._id,
                description: `Changed role of ${user.name} from ${oldRole} to ${updatedUser.role}`,
                details: { from: oldRole, to: updatedUser.role }
            });
        }

        // Construct success message based on status change
        let message = `User updated successfully`;
        if (req.body.status && oldStatus !== updatedUser.status) {
            if (updatedUser.status === 'active') message = 'User activated successfully';
            else if (updatedUser.status === 'suspended') message = 'User suspended successfully';
            else if (updatedUser.status === 'disabled') message = 'User disabled successfully';
        }

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            status: updatedUser.status,
            message: message
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

const logoutUser = async (req, res) => {
    if (req.user) {
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'logout',
            targetType: 'User',
            targetId: req.user._id,
            description: `${req.user.name} logged out of the system.`,
        });
    }
    res.json({ message: 'Logged out successfully' });
};

// @desc Update FCM Token for Push Notifications
// @route PUT /api/users/push-token
const updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) {
            return res.status(400).json({ message: 'Missing FCM token' });
        }

        const user = await User.findById(req.user._id);
        if (user) {
            user.fcmToken = fcmToken;
            await user.save();
            res.json({ message: 'FCM Token updated' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Update FCM Token Error:', error);
        res.status(500).json({ message: 'Failed to update token' });
    }
};

module.exports = { authUser, registerUser, getUserProfile, updateUserProfile, getUserById, addAddress, getUsers, deleteUser, updateUser, logoutUser, verifyEmail, requestOtp, verifyOtp, updateFcmToken };
