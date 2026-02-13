const mongoose = require('mongoose');
const dotenv = require('dotenv');
const SystemSettings = require('./src/models/SystemSettings');
const connectDB = require('./src/config/db');

dotenv.config();

const initializeSystemSettings = async () => {
    try {
        await connectDB();

        console.log('🔧 Initializing System Settings...');

        // Set mobile access to disabled by default
        await SystemSettings.setSetting(
            'mobileAccessEnabled',
            false,
            null,
            'Global mobile access control for admin dashboard'
        );

        console.log('✅ Mobile Access Setting initialized to: false (disabled)');
        console.log('📱 Admin can enable mobile access from Settings page');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error initializing system settings:', error);
        process.exit(1);
    }
};

initializeSystemSettings();
