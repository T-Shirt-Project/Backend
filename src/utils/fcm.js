const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccount = require(require('path').resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin Initialized with service account path');
    } else {
        // Fallback to default credentials if path not provided
        if (!admin.apps.length) {
            admin.initializeApp();
            console.log('Firebase Admin Initialized with default credentials');
        }
    }
} catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
}

/**
 * Send push notification to a specific token
 */
const sendToToken = async (token, title, body, data = {}, imageUrl = null) => {
    if (!token) return;

    // Ensure all data values are strings for FCM
    const stringData = Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
    }, {});

    const message = {
        notification: {
            title,
            body,
            ...(imageUrl && { imageUrl })
        },
        data: stringData,
        android: {
            priority: 'high',
            notification: {
                channelId: 'high_importance_channel',
                priority: 'high',
                defaultSound: true,
                defaultVibrateTimings: true,
                ...(imageUrl && { imageUrl })
            }
        },
        apns: {
            payload: {
                aps: {
                    contentAvailable: true,
                    badge: 1, // Will be overridden or handled by app logic
                    sound: 'default'
                }
            },
            fcmOptions: {
                ...(imageUrl && { image: imageUrl })
            }
        },
        token: token
    };

    try {
        const response = await admin.messaging().send(message);
        return { success: true, response };
    } catch (error) {
        console.error('Error sending message:', error);
        // Handle invalid/expired tokens (Registration token is not a valid FCM registration token)
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
            // Signal to caller that token is invalid
            return { success: false, error, invalidToken: true };
        }
        return { success: false, error };
    }
};

/**
 * Send push notification to a topic
 */
const sendToTopic = async (topic, title, body, data = {}, imageUrl = null) => {
    const stringData = Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
    }, {});

    const message = {
        notification: {
            title,
            body,
            ...(imageUrl && { imageUrl })
        },
        data: stringData,
        android: {
            priority: 'high',
            notification: {
                channelId: 'high_importance_channel',
                priority: 'high',
                ...(imageUrl && { imageUrl })
            }
        },
        topic: topic
    };

    try {
        const response = await admin.messaging().send(message);
        return { success: true, response };
    } catch (error) {
        console.error(`Error sending to topic ${topic}:`, error);
        return { success: false, error };
    }
};

module.exports = {
    sendToToken,
    sendToTopic
};

