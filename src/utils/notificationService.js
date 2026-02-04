const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendToToken, sendToTopic } = require('./fcm');

/**
 * Send notification to a specific user
 * @param {string} userId - User ID
 * @param {string} title - Notification Title
 * @param {string} body - Notification Body
 * @param {string} type - 'order_update', 'promotion', 'system'
 * @param {object} data - Metadata (e.g. { orderId: '123' })
 */
const notifyUser = async (userId, title, body, type, data = {}) => {
    try {
        // 1. Create DB Log
        const notification = await Notification.create({
            userId,
            title,
            body,
            type,
            referenceId: data.referenceId || null
        });

        // 2. Fetch User FCM Token
        const user = await User.findById(userId);
        if (user && user.fcmToken) {
            // 3. Send Push
            await sendToToken(user.fcmToken, title, body, { ...data, type });
        } else {
            // Log that user has no token?
            // console.log(`User ${userId} has no FCM token`);
        }

        return notification;
    } catch (error) {
        console.error('NotifyUser Error:', error);
        // Do not throw, return null to prevent blocking flow
        return null;
    }
};

/**
 * Broadcast to all users (subscribed to 'promotions' topic)
 * @param {string} title 
 * @param {string} body 
 * @param {object} data 
 */
const broadcastPromotion = async (title, body, data = {}) => {
    try {
        // We do NOT log individual notifications for every user in DB to avoid write flood.
        // If needed, we could have a 'SystemNotification' collection, but for now we skip DB logs per user.
        // Or we assume the user just sees it in status bar.

        // Use Firebase Topics
        await sendToTopic('promotions', title, body, { ...data, type: 'promotion' });

        return true;
    } catch (error) {
        console.error('Broadcast Error:', error);
        return false;
    }
};

module.exports = {
    notifyUser,
    broadcastPromotion
};
