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

        // Convert data object values to strings (FCM requirement)
        const stringData = {};
        Object.keys(data).forEach(key => {
            stringData[key] = String(data[key]);
        });

        const message = {
            notification: {
                title,
                body,
                ...(imageUrl && { image: imageUrl })
            },
            data: {
                type,
                ...stringData,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'high_importance_channel',
                    priority: 'high',
                    sound: 'default',
                    ...(imageUrl && { imageUrl })
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        contentAvailable: true,
                        badge: 1
                    }
                },
                fcmOptions: {
                    ...(imageUrl && { imageUrl })
                }
            },
            token: user.fcmToken
        };

        const response = await admin.messaging().send(message);
        console.log(`✅ Notification sent to user ${userId}:`, response);
    } catch (error) {
        console.error(`❌ Error sending notification to user ${userId}:`, error.message);
        // Handle invalid token
        if (error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-registration-token') {
            await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
            console.log(`🗑️ Removed invalid FCM token for user ${userId}`);
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

        // Convert data object values to strings (FCM requirement)
        const stringData = {};
        Object.keys(data).forEach(key => {
            stringData[key] = String(data[key]);
        });

        const message = {
            notification: {
                title,
                body,
                ...(imageUrl && { image: imageUrl })
            },
            data: {
                type,
                ...stringData,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'high_importance_channel',
                    priority: 'high',
                    sound: 'default',
                    ...(imageUrl && { imageUrl })
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        contentAvailable: true,
                        badge: 1
                    }
                },
                fcmOptions: {
                    ...(imageUrl && { imageUrl })
                }
            },
            topic: 'all_users' // Topic for all users
        };

        const response = await admin.messaging().send(message);
        console.log('✅ Global notification sent to topic: all_users', response);
    } catch (error) {
        console.error('❌ Error sending global notification:', error.message);
    }
};
