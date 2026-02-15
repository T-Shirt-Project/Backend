const mongoose = require('mongoose');
const User = require('../models/User');
const Activity = require('../models/Activity');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '30d' });
};

// @desc Auth user & get token
// @route POST /api/users/login
const authUser = async (req, res) => {
    // console.log('Incoming Login Request:', req.body);
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide both email and password' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (user) {
            if (await user.matchPassword(password)) {

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
                    addresses: user.addresses,
                    mobileAccessEnabled: user.mobileAccessEnabled
                });
            } else {
                res.status(401).json({ message: 'Incorrect password' });
            }
        } else {
            res.status(404).json({ message: 'Email not found' });
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
            return res.status(400).json({ message: 'User already exists' });
        }

        const finalRole = (role === 'seller') ? 'seller' : 'user';

        const user = await User.create({
            name,
            email: normalizedEmail,
            password,
            role: finalRole,
            phoneNumber,
            status: 'active'
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

            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                phoneNumber: user.phoneNumber,
                token: generateToken(user._id),
                mobileAccessEnabled: user.mobileAccessEnabled
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Registration failed. Please try again.' });
    }
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
            addresses: user.addresses,
            mobileAccessEnabled: user.mobileAccessEnabled
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

// @desc Update user profile
// @route PUT /api/users/profile
const updateUserProfile = async (req, res) => {
    try {
        const { name, phoneNumber } = req.body;
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: 'Name cannot be empty' });
        }

        // Use findByIdAndUpdate to only update specific fields, avoiding overwrite of password/role
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            {
                $set: {
                    name: name.trim(),
                    phoneNumber: phoneNumber ? phoneNumber.trim() : ""
                }
            },
            { new: true, runValidators: true }
        );

        if (updatedUser) {
            // Log profile update
            await Activity.create({
                userId: updatedUser._id,
                role: updatedUser.role,
                type: 'profile_updated',
                targetType: 'User',
                targetId: updatedUser._id,
                description: `${updatedUser.name} updated their profile details.`,
                details: { fields: ['name', 'phoneNumber'] }
            });

            res.json({
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                phoneNumber: updatedUser.phoneNumber,
                role: updatedUser.role,
                token: generateToken(updatedUser._id),
                mobileAccessEnabled: updatedUser.mobileAccessEnabled,
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Profile update failed', error: error.message });
    }
};

// ... keep existing addAddress, getUserById, getUsers, deleteUser, updateUser, logoutUser, updateFcmToken, updateUserStatus ...

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
    try {
        console.log('=== DELETE USER REQUEST ===');
        console.log('Admin User:', req.user?.email, 'Role:', req.user?.role);
        console.log('Target User ID:', req.params.id);

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log('❌ Invalid ObjectId format');
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            console.log('❌ User not found');
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('Target User:', user.email, 'Role:', user.role);

        // Prevent deletion of admin accounts
        if (user.role === 'admin') {
            console.log('❌ Cannot delete admin account');
            return res.status(403).json({
                success: false,
                message: 'Cannot delete admin accounts'
            });
        }

        // SOFT DELETE: Mark user as deleted instead of removing from database
        // This preserves data integrity for:
        // - Order history (userSnapshot remains valid)
        // - Audit trails
        // - Legal compliance
        user.status = 'deleted';
        user.email = `deleted_${Date.now()}_${user.email}`; // Prevent email conflicts
        await user.save();

        console.log('✅ User soft deleted successfully');

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
            success: true,
            message: 'User account deleted successfully',
            note: 'Order history preserved'
        });
    } catch (error) {
        console.error('❌ DELETE USER ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user',
            error: error.message
        });
    }
};

// @desc Update user (Admin)
// @route PUT /api/users/:id
const updateUser = async (req, res) => {
    try {
        console.log('=== UPDATE USER REQUEST ===');
        console.log('Admin User:', req.user?.email, 'Role:', req.user?.role);
        console.log('Target User ID:', req.params.id);
        console.log('Update Data:', req.body);

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log('❌ Invalid ObjectId format');
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            console.log('❌ User not found');
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('Target User:', user.email, 'Role:', user.role);

        // Prevent self-modification of strict fields by Admin
        if (req.user._id.toString() === user._id.toString()) {
            if (req.body.status) {
                const normalizedStatus = req.body.status.toLowerCase().trim();
                if (normalizedStatus !== 'active') {
                    console.log('❌ Admin tried to self-disable/suspend');
                    return res.status(400).json({
                        success: false,
                        message: 'You cannot disable or suspend your own account.'
                    });
                }
            }
            if (req.body.role && req.body.role !== 'admin') {
                console.log('❌ Admin tried to demote self');
                return res.status(400).json({
                    success: false,
                    message: 'You cannot demote your own admin privileges.'
                });
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
            } else if (normalizedStatus === 'deleted') {
                // Handle soft delete if passed via status
                user.status = 'deleted';
                user.email = `deleted_${Date.now()}_${user.email}`;
            } else {
                console.log('❌ Invalid status value:', req.body.status);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status value'
                });
            }
        }

        // Mobile Access Enforcement
        if (req.body.mobileAccessEnabled !== undefined) {
            user.mobileAccessEnabled = req.body.mobileAccessEnabled;
        }

        const updatedUser = await user.save();
        console.log('✅ User updated successfully');

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
            success: true,
            message: message,
            user: {
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                status: updatedUser.status,
                mobileAccessEnabled: updatedUser.mobileAccessEnabled
            }
        });
    } catch (error) {
        console.error('❌ UPDATE USER ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user',
            error: error.message
        });
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

        // Clear FCM Token on logout to prevent notifying wrong user
        const user = await User.findById(req.user._id);
        if (user) {
            user.fcmToken = null;
            await user.save();
        }

    }
    res.json({ success: true, message: 'Logged out successfully' });
};


// @desc Update FCM Token for Push Notifications
// @route PUT /api/users/push-token
// @access Private
const updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) {
            return res.status(400).json({ success: false, message: 'FCM Token is required' });
        }

        const user = await User.findById(req.user._id);
        if (user) {
            user.fcmToken = fcmToken;
            await user.save();
            res.json({ success: true, message: 'FCM Token updated successfully' });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Update FCM Token Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc Update user status (Admin)
// @route PATCH /api/users/:id/status
// @access Admin only
const updateUserStatus = async (req, res) => {
    try {
        console.log('=== UPDATE USER STATUS REQUEST ===');
        console.log('Admin User:', req.user?.email, 'Role:', req.user?.role);
        console.log('Target User ID:', req.params.id);
        console.log('New Status:', req.body.status);

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log('❌ Invalid ObjectId format');
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        const { status } = req.body;

        // Validate status value
        const validStatuses = ['active', 'disabled', 'suspended'];
        if (!status || !validStatuses.includes(status.toLowerCase().trim())) {
            console.log('❌ Invalid status value:', status);
            return res.status(400).json({
                success: false,
                message: 'Invalid status value. Must be: active, disabled, or suspended'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            console.log('❌ User not found');
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('Target User:', user.email, 'Role:', user.role);

        // Prevent admin from disabling/suspending themselves
        if (req.user._id.toString() === user._id.toString()) {
            const normalizedStatus = status.toLowerCase().trim();
            if (normalizedStatus !== 'active') {
                console.log('❌ Admin tried to self-disable/suspend');
                return res.status(400).json({
                    success: false,
                    message: 'You cannot disable or suspend your own account.'
                });
            }
        }

        // Prevent modifying other admin accounts (optional security measure)
        if (user.role === 'admin' && req.user._id.toString() !== user._id.toString()) {
            console.log('❌ Admin tried to modify another admin');
            return res.status(403).json({
                success: false,
                message: 'Cannot modify status of other admin accounts'
            });
        }

        const oldStatus = user.status;
        const normalizedStatus = status.toLowerCase().trim();

        // Update status
        user.status = normalizedStatus;
        const updatedUser = await user.save();
        console.log('✅ User status updated successfully');

        // Log activity
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'status_change',
            targetType: 'User',
            targetId: user._id,
            description: `Changed status of ${user.name} from ${oldStatus} to ${normalizedStatus}`,
            details: {
                from: oldStatus,
                to: normalizedStatus,
                adminId: req.user._id,
                adminName: req.user.name
            }
        });

        // Construct success message
        let message = 'User status updated successfully';
        if (normalizedStatus === 'active') message = 'User activated successfully';
        else if (normalizedStatus === 'suspended') message = 'User suspended successfully';
        else if (normalizedStatus === 'disabled') message = 'User disabled successfully';

        res.json({
            success: true,
            message,
            user: {
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                status: updatedUser.status
            }
        });
    } catch (error) {
        console.error('❌ UPDATE USER STATUS ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status',
            error: error.message
        });
    }
};

module.exports = {
    authUser,
    registerUser,
    getUserProfile,
    updateUserProfile,
    getUserById,
    addAddress,
    getUsers,
    deleteUser,
    updateUser,
    logoutUser,
    updateFcmToken,
    updateUserStatus
};

