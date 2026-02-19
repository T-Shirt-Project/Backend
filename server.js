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
dotenv.config();

const app = express();

// 1. FIX CORS: Restrict to allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://t-shirtadmin.web.app',
        'http://t-shirtadmin.web.app'
    ];
app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security Check: Ensure JWT secrets are provided in production
if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
        console.error('❌ CRITICAL: JWT_SECRET and JWT_REFRESH_SECRET must be set in production!');
        process.exit(1);
    }
}


app.use(express.json());

// Global request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Passport Strategy removed


// API Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/app', require('./src/routes/appRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/categories', require('./src/routes/categoryRoutes'));
app.use('/api/settings', require('./src/routes/settingsRoutes'));

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
        // 2. FIX BINDING: Explicitly bind to 0.0.0.0 to listen on public IP
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
