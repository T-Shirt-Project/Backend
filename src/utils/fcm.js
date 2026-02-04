const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Ideally, use environment variable GOOGLE_APPLICATION_CREDENTIALS for the path to the service account key
// or parse the JSON string from an env var if provided.
// For now, we assume standard auto-discovery or explicit path in .env
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccount = require(require('path').resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin Initialized with service account path');
    } else {
        admin.initializeApp(); // Uses GOOGLE_APPLICATION_CREDENTIALS env var
        console.log('Firebase Admin Initialized with default credentials');
    }
} catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
}

const sendToToken = async (token, title, body, data = {}) => {
    if (!token) return;

    // Ensure data values are strings
    const stringData = Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
    }, {});

    const message = {
        notification: {
            title,
            body
        },
        data: stringData,
        token: token
    };

    try {
        const response = await admin.messaging().send(message);
        return { success: true, response };
    } catch (error) {
        console.error('Error sending message:', error);
        return { success: false, error };
    }
};

const sendToTopic = async (topic, title, body, data = {}) => {
    const stringData = Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
    }, {});

    const message = {
        notification: {
            title,
            body
        },
        data: stringData,
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
