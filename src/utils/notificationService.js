const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendToToken, sendToTopic } = require('./fcm');

/**
 * Send notification to a specific user
 * @param {string} userId - User ID
 * @param {string} title - Notification Title
 * @param {string} body - Notification Body
 * @param {string} type - 'ORDER', 'PRODUCT', 'OFFER', 'SYSTEM'
 * @param {object} data - Metadata (e.g. { referenceId: '123', imageUrl: '...' })
 * @param {string} status - Optional status for duplicate prevention (e.g. 'SHIPPED')
 */
const notifyUser = async (userId, title, body, type, data = {}, status = null) => {
    try {
        const referenceId = data.referenceId || null;
        const imageUrl = data.imageUrl || null;

        // 1. DUPLICATE PREVENTION: Check if already exists
        // (userId + type + referenceId + status)
        if (status) {
            const existing = await Notification.findOne({
                userId,
                type,
                referenceId,
                status,
                deleted: false
            });
            if (existing) {
                console.log(`Duplicate notification skipped: ${type} - ${status} for user ${userId}`);
                return existing;
            }
        }

        // 2. Create DB Log
        const notification = await Notification.create({
            userId,
            title,
            body,
            type,
            referenceId,
            imageUrl,
            status,
            data
        });

        // 3. Send Push ASYNC (Do not wait for it to return to speed up API)
        // We use a self-invoking function or just don't await the inner logic if we want to be truly async-non-blocking.
        // But for better error handling/logging, we can wrap it.
        (async () => {
            try {
                const user = await User.findById(userId);
                if (user && user.fcmToken) {
                    const result = await sendToToken(user.fcmToken, title, body, { ...data, type, notificationId: notification._id.toString() }, imageUrl);

                    if (result && result.invalidToken) {
                        console.log(`Removing invalid FCM token for user ${userId}`);
                        await User.findByIdAndUpdate(userId, { fcmToken: null });
                    }
                }
            } catch (pushError) {
                console.error('Push Send Background Error:', pushError);
            }
        })();

        return notification;
    } catch (error) {
        // Handle unique constraint error (race condition)
        if (error.code === 11000) {
            console.log('Notification unique constraint hit - skipping duplicate');
            return null;
        }
        console.error('NotifyUser Error:', error);
        return null;
    }
};

/**
 * Broadcast to all users (subscribed to 'promotions' topic)
 */
const broadcastPromotion = async (title, body, data = {}) => {
    try {
        const imageUrl = data.imageUrl || null;
        const type = 'PRODUCT'; // or 'OFFER'

        // Send to Firebase Topic
        // The mobile app should subscribe to 'all_users' or 'promotions' topic
        await sendToTopic('all_users', title, body, { ...data, type }, imageUrl);

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

