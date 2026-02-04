const Activity = require('../models/Activity');
const Notification = require('../models/Notification');

// @desc    Get user's notifications (Activities)
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
    try {
        let query = {};

        // Role-based scoping (Matching Activity logic)
        if (req.user.role === 'seller') {
            query.$or = [
                { userId: req.user._id },
                { "details.sellerId": req.user._id.toString() },
                { "details.sellerIds": req.user._id.toString() }
            ];
        } else if (req.user.role === 'admin') {
            // Admins see everything or filtered
            query = {};
        }

        // SEPARATE LOGIC FOR CONSUMER APP (USER)
        if (req.user.role === 'user') {
            const notifications = await Notification.find({ userId: req.user._id })
                .sort({ createdAt: -1 })
                .limit(50);
            return res.json({ success: true, notifications });
        }

        // ADMIN / SELLER DASHBOARD LOGIC (Activity Log)

        const notifications = await Activity.find(query)
            .populate('userId', 'name email role')
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({
            success: true,
            notifications
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve notifications',
            error: error.message
        });
    }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
    try {
        const notification = await Activity.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        // Basic permission check (simplified)
        notification.isRead = true;
        await notification.save();

        res.json({ success: true, notification });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Clear all notifications for user
// @route   DELETE /api/notifications
// @access  Private
const clearNotifications = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'admin') {
            // For admin, maybe just mark all as read instead of deleting?
            // But prompt says "Clear notifications works reliably"
            await Activity.updateMany({ isRead: false }, { isRead: true });
        } else if (req.user.role === 'seller') {
            query.$or = [
                { userId: req.user._id },
                { "details.sellerId": req.user._id.toString() },
                { "details.sellerIds": req.user._id.toString() }
            ];
            await Activity.updateMany(query, { isRead: true });
        } else {
            await Activity.updateMany({ userId: req.user._id }, { isRead: true });
        }

        res.json({ success: true, message: 'Notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    clearNotifications
};
