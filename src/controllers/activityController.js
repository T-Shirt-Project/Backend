const Activity = require('../models/Activity');

// @desc    Log a new activity
// @route   POST /api/activity
// @access  Private
const logActivity = async (req, res) => {
    const { type, details } = req.body;

    const activity = await Activity.create({
        userId: req.user._id,
        type,
        details
    });

    res.status(201).json(activity);
};

// @desc    Get user's own activity
// @route   GET /api/activity/me
// @access  Private
const getMyActivity = async (req, res) => {
    const activities = await Activity.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50);
    res.json(activities);
};

// --- ADMIN ONLY FUNCTIONS ---

// @desc    Get all activities (with filters)
// @route   GET /api/activity
// @access  Private
const getAllActivities = async (req, res) => {
    try {
        const {
            userId, role, type, targetType,
            startDate, endDate, sellerId,
            actorSearch,
            page = 1, limit = 20
        } = req.query;

        const pageSize = parseInt(limit) || 20;
        const currentPage = parseInt(page) || 1;
        const skip = (currentPage - 1) * pageSize;

        let query = {};

        // Role-based scoping
        if (req.user.role === 'seller') {
            // Sellers see their own activities OR activities where they are tagged as relevant
            query.$or = [
                { userId: req.user._id },
                { "details.sellerId": req.user._id.toString() },
                { "details.sellerIds": req.user._id.toString() }
            ];
        } else if (req.user.role === 'admin') {
            if (userId) query.userId = userId;
            if (sellerId) query.userId = sellerId;
            if (role) query.role = role;

            // Actor Search
            if (actorSearch) {
                const User = require('../models/User');
                const matchingUsers = await User.find({
                    $or: [
                        { name: { $regex: actorSearch, $options: 'i' } },
                        { email: { $regex: actorSearch, $options: 'i' } }
                    ]
                }).select('_id');
                const userIds = matchingUsers.map(u => u._id);
                if (query.userId) {
                    query.userId = { $in: [query.userId, ...userIds] };
                } else {
                    query.userId = { $in: userIds };
                }
            }
        } else {
            return res.status(403).json({ message: 'Access denied: Unauthorized role' });
        }

        if (type && type !== 'all') query.type = type;
        if (targetType && targetType !== 'all') query.targetType = targetType;

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const total = await Activity.countDocuments(query);
        const activities = await Activity.find(query)
            .populate('userId', 'name email role')
            .sort({ createdAt: -1 })
            .limit(pageSize)
            .skip(skip);

        res.json({
            activities: activities || [],
            page: currentPage,
            pages: Math.ceil(total / pageSize) || 1,
            total: total || 0
        });
    } catch (error) {
        console.error('Audit Log Error:', error);
        res.status(500).json({
            message: 'Failed to retrieve audit logs',
            error: error.message
        });
    }
};

// @desc    Get specific user's activity (Legacy/Direct)
// @route   GET /api/activity/user/:id
// @access  Private/Admin
const getUserActivityAdmin = async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });

    const activities = await Activity.find({ userId: req.params.id })
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .limit(100);
    res.json(activities);
};

module.exports = {
    logActivity,
    getMyActivity,
    getAllActivities,
    getUserActivityAdmin
};
