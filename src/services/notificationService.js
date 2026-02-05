const admin = require('../config/firebase');
const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Send a notification to a single user
 * @param {string} userId - ID of the user
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} type - 'ORDER', 'PRODUCT', 'OFFER', 'SYSTEM'
 * @param {object} data - Custom payload (productId, orderId)
 * @param {string} imageUrl - Optional image URL
 * @param {string} status - Optional status for duplicate prevention
 */
exports.sendToUser = async (userId, title, body, type, data = {}, imageUrl = null, status = null) => {
    try {
        const referenceId = data.orderId || data.productId || data.referenceId || null;

        // 1. DUPLICATE PREVENTION: Check if already exists
        // (userId + type + referenceId + status)
        if (status && status !== 'Placed') { // Allow 'Placed' to trigger since it's initial
            const existing = await Notification.findOne({
                userId,
                type: type.toUpperCase(),
                referenceId,
                status,
                deleted: false
            });
            if (existing) {
                console.log(`Duplicate notification skipped: ${type} - ${status} for user ${userId}`);
                return;
            }
        }

        // 2. Create DB Log (Source of Truth)
        const notification = await Notification.create({
            userId,
            title,
            body,
            imageUrl,
            type: type.toUpperCase(),
            referenceId,
            status,
            data,
            read: false,
            deleted: false
        });

        // 3. Send Push ASYNC (Do not block the main flow)
        setImmediate(async () => {
            try {
                const user = await User.findById(userId);
                if (!user || !user.fcmToken) {
                    console.log(`Push skipped: No FCM token for user ${userId}`);
                    return;
                }

                // Convert data object values to strings (FCM requirement)
                const stringData = {
                    type: type.toUpperCase(),
                    ...Object.keys(data).reduce((acc, key) => {
                        acc[key] = String(data[key]);
                        return acc;
                    }, {}),
                    notificationId: notification._id.toString()
                };

                const message = {
                    notification: {
                        title,
                        body,
                        ...(imageUrl && { image: imageUrl })
                    },
                    data: stringData,
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: 'high_importance_channel',
                            priority: 'high',
                            sound: 'custom_sound',
                            ...(imageUrl && { image: imageUrl })
                        }
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'custom_sound.wav',
                                contentAvailable: true,
                                badge: 1
                            }
                        },
                        fcmOptions: {
                            ...(imageUrl && { image: imageUrl })
                        }
                    },
                    token: user.fcmToken
                };

                const response = await admin.messaging().send(message);
                console.log(`✅ Push sent to user ${userId}:`, response);
            } catch (pushError) {
                console.error(`❌ Push error for user ${userId}:`, pushError.message);
                // Clean up invalid tokens
                if (pushError.code === 'messaging/registration-token-not-registered' ||
                    pushError.code === 'messaging/invalid-registration-token') {
                    await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
                    console.log(`🗑️ Removed invalid FCM token for user ${userId}`);
                }
            }
        });

        return notification;
    } catch (error) {
        // Handle unique constraint error (race condition)
        if (error.code === 11000) {
            console.log('Notification unique constraint hit - skipping duplicate');
            return null;
        }
        console.error(`❌ Error in notification service for user ${userId}:`, error.message);
    }
};

/**
 * Send a notification to all users (Global Topic)
 */
exports.sendToAll = async (title, body, type, data = {}, imageUrl = null) => {
    try {
        const typeUpper = type ? type.toUpperCase() : 'SYSTEM';

        // Save to DB
        await Notification.create({
            isGlobal: true,
            title,
            body,
            imageUrl,
            type: typeUpper,
            data,
            read: false,
            deleted: false
        });

        // Convert data object values to strings
        const stringData = {
            type: typeUpper,
            ...Object.keys(data).reduce((acc, key) => {
                acc[key] = String(data[key]);
                return acc;
            }, {})
        };

        const message = {
            notification: {
                title,
                body,
                ...(imageUrl && { image: imageUrl })
            },
            data: stringData,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'high_importance_channel',
                    priority: 'high',
                    sound: 'custom_sound',
                    ...(imageUrl && { image: imageUrl })
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'custom_sound.wav',
                        contentAvailable: true,
                        badge: 1
                    }
                },
                fcmOptions: {
                    ...(imageUrl && { image: imageUrl })
                }
            },
            topic: 'all_users'
        };

        const response = await admin.messaging().send(message);
        console.log('✅ Global push sent to topic: all_users', response);
    } catch (error) {
        console.error('❌ Error sending global notification:', error.message);
    }
};

