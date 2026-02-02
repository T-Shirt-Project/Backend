const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./src/config/db');
const userRoutes = require('./src/routes/userRoutes');
const productRoutes = require('./src/routes/productRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const cartRoutes = require('./src/routes/cartRoutes');
const activityRoutes = require('./src/routes/activityRoutes');
const passport = require('passport');
const passportConfig = require('./src/config/passportConfig');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Initialize Passport Strategy
passportConfig();

// API Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/categories', require('./src/routes/categoryRoutes'));

// Make uploads folder static
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

app.get('/', (req, res) => {
    res.send('API is running...');
});

const { notFound, errorHandler } = require('./src/middleware/errorMiddleware');

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Start server ONLY after successful DB connection
const startServer = async () => {
    try {
        // Wait for MongoDB connection
        await connectDB();

        // Only start server after DB is connected
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
