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
            ]
        })
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({
            $or: [
                { userId: req.user._id, isRead: false },
                { isGlobal: true, isRead: false }
            ]
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
            $or: [
                { userId: req.user._id, isRead: false },
                { isGlobal: true, isRead: false }
            ]
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
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        // Check if user owns this notification or it's global
        if (!notification.isGlobal && notification.userId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        notification.isRead = true;
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
                $or: [
                    { userId: req.user._id },
                    { isGlobal: true }
                ],
                isRead: false
            },
            { isRead: true }
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('❌ Mark all as read error:', error);
        res.status(500).json({ message: 'Failed to mark all as read' });
    }
});

// @desc Delete notification
// @route DELETE /api/notifications/:id
// @access Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        // Check if user owns this notification or it's global
        if (!notification.isGlobal && notification.userId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        await notification.deleteOne();

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('❌ Delete notification error:', error);
        res.status(500).json({ message: 'Failed to delete notification' });
    }
});

// @desc Clear all notifications
// @route DELETE /api/notifications/clear-all
// @access Private
router.delete('/clear-all', protect, async (req, res) => {
    try {
        await Notification.deleteMany({
            $or: [
                { userId: req.user._id },
                { isGlobal: true }
            ]
        });

        res.json({ message: 'All notifications cleared' });
    } catch (error) {
        console.error('❌ Clear all notifications error:', error);
        res.status(500).json({ message: 'Failed to clear notifications' });
    }
});

module.exports = router;
