const admin = require('../config/firebase');
const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Send a notification to a single user
 * @param {string} userId - ID of the user
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} type - Notification type (order, promotion, etc)
 * @param {object} data - Custom payload (productId, orderId)
 * @param {string} imageUrl - Optional image URL
 */
exports.sendToUser = async (userId, title, body, type, data = {}, imageUrl = null) => {
    try {
        const user = await User.findById(userId);
        if (!user || !user.fcmToken) {
            console.log(`Notification skipped: No FCM token for user ${userId}`);
            return;
        }

        // Save to DB
        await Notification.create({
            userId,
            title,
            body,
            type,
            data,
            isRead: false
        });

        const message = {
            notification: {
                title,
                body,
                ...(imageUrl && { imageUrl })
            },
            data: {
                type,
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            token: user.fcmToken
        };

        await admin.messaging().send(message);
        console.log(`Notification sent to user ${userId}`);
    } catch (error) {
        console.error(`Error sending notification to user ${userId}:`, error.message);
        // Handle invalid token
        if (error.code === 'messaging/registration-token-not-registered') {
            await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
            console.log(`Removed invalid FCM token for user ${userId}`);
        }
    }
};

/**
 * Send a notification to all users (Global Topic)
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} type - Notification type
 * @param {object} data - Custom payload
 * @param {string} imageUrl - Optional image URL
 */
exports.sendToAll = async (title, body, type, data = {}, imageUrl = null) => {
    try {
        // Save to DB (Global Record)
        await Notification.create({
            isGlobal: true,
            title,
            body,
            type,
            data
        });

        const message = {
            notification: {
                title,
                body,
                ...(imageUrl && { imageUrl })
            },
            data: {
                type,
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            topic: 'all_users' // Topic for all users
        };

        await admin.messaging().send(message);
        console.log('Global notification sent to topic: all_users');
    } catch (error) {
        console.error('Error sending global notification:', error.message);
    }
};
