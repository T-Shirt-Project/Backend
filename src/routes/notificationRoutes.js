const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

// @desc Get user notifications
// @route GET /api/notifications
// @access Private
router.get('/', protect, async (req, res) => {
    try {
        const notifications = await Notification.find({
            $or: [
                { userId: req.user._id },
                { isGlobal: true }
            ],
            deleted: false // Always filter out deleted
        })
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({
            userId: req.user._id,
            read: false,
            deleted: false
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
        const unreadCount = await Notification.countDocuments({
            userId: req.user._id,
            read: false,
            deleted: false
        });

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
            userId: req.user._id
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
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
        await Notification.updateMany(
            {
                userId: req.user._id,
                read: false,
                deleted: false
            },
            { read: true }
        );

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
            userId: req.user._id
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
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

