const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

// @desc Get user notifications
// @route GET /api/notifications
// @access Private
router.get('/', protect, async (req, res) => {
    try {
        const query = {
            deleted: false,
            $or: [{ userId: req.user._id }]
        };

        // Only Admin sees global system notifications
        if (req.user.role === 'admin') {
            query.$or.push({ isGlobal: true });
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({
            ...query,
            read: false
        });

        res.json({
            notifications,
            unreadCount
        });
    } catch (error) {
        console.error('❌ Get notifications error:', error);
        res.status(500).json({ message: 'Failed to fetch notifications' });
    }
});

// @desc Get unread notification count
// @route GET /api/notifications/unread-count
// @access Private
router.get('/unread-count', protect, async (req, res) => {
    try {
        const query = {
            deleted: false,
            read: false,
            $or: [{ userId: req.user._id }]
        };

        if (req.user.role === 'admin') {
            query.$or.push({ isGlobal: true });
        }

        const unreadCount = await Notification.countDocuments(query);

        res.json({ unreadCount });
    } catch (error) {
        console.error('❌ Get unread count error:', error);
        res.status(500).json({ message: 'Failed to fetch unread count' });
    }
});

// @desc Mark notification as read
// @route PUT /api/notifications/:id/read
// @access Private
router.put('/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            $or: [
                { userId: req.user._id },
                { isGlobal: true }
            ]
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        // Integrity check: Only admin can touch global
        if (notification.isGlobal && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        notification.read = true;
        await notification.save();

        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('❌ Mark as read error:', error);
        res.status(500).json({ message: 'Failed to mark notification as read' });
    }
});

// @desc Mark all notifications as read
// @route PUT /api/notifications/read-all
// @access Private
router.put('/read-all', protect, async (req, res) => {
    try {
        const query = {
            userId: req.user._id,
            read: false,
            deleted: false
        };
        // Note: We don't mark GLOBAL as read in batch to avoid side effects for other admins
        // unless explicitly requested, but for now let's keep it safe (user scoped only)

        await Notification.updateMany(query, { read: true });

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('❌ Mark all as read error:', error);
        res.status(500).json({ message: 'Failed to mark all as read' });
    }
});

// @desc Delete notification (Soft Delete)
// @route DELETE /api/notifications/:id
// @access Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            $or: [
                { userId: req.user._id },
                { isGlobal: true }
            ]
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        if (notification.isGlobal && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        notification.deleted = true;
        await notification.save();

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('❌ Delete notification error:', error);
        res.status(500).json({ message: 'Failed to delete notification' });
    }
});

// @desc Clear all notifications (Soft Delete)
// @route POST /api/notifications/clear-all
// @access Private
router.post('/clear-all', protect, async (req, res) => {
    try {
        // Only clear USER's notifications, never Global ones via clear-all
        await Notification.updateMany(
            { userId: req.user._id },
            { deleted: true }
        );

        res.json({ message: 'All notifications cleared' });
    } catch (error) {
        console.error('❌ Clear all notifications error:', error);
        res.status(500).json({ message: 'Failed to clear notifications' });
    }
});

module.exports = router;

