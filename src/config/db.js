const mongoose = require('mongoose');

// Disable buffering to fail fast when DB is not connected
mongoose.set('bufferCommands', false);

const connectDB = async () => {
    try {
        // Use explicit IPv4 to avoid IPv6 (::1) issues
        const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tshirt_platform';

        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        console.error('Please ensure MongoDB is running on port 27017');
        process.exit(1);
    }
};

module.exports = connectDB;
