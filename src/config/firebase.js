const admin = require('firebase-admin');

try {
    // Check if we have the service account in environment variables (Render/Prod)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin Initialized via ENV');
    }
    // Check if we have a local file (Dev)
    else {
        // You would typically put serviceAccountKey.json in src/config/
        // Ignoring if missing to prevent crash during simple dev without keys
        // const serviceAccount = require('./serviceAccountKey.json');

        // For now, we initialize purely with default credentials if available, 
        // or just mock it if we anticipate no keys yet.
        // admin.initializeApp();
        console.log('Firebase Service Account not found in ENV. Push notifications may not work.');
    }
} catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
}

module.exports = admin;
