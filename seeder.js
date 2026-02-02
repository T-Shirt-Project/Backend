const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Product = require('./src/models/Product');
const Order = require('./src/models/Order');
const Activity = require('./src/models/Activity');
const Cart = require('./src/models/Cart');
const connectDB = require('./src/config/db');

dotenv.config();

connectDB();

const importData = async () => {
    try {
        await Activity.deleteMany();
        await Order.deleteMany();
        await Product.deleteMany();
        await User.deleteMany();
        await Cart.deleteMany();

        const users = [
            {
                name: 'System Admin',
                email: 'admin@example.com',
                password: 'password123',
                role: 'admin',
                status: 'active'
            },
            {
                name: 'Premium Seller',
                email: 'seller@example.com',
                password: 'password123',
                role: 'seller',
                status: 'active'
            },
            {
                name: 'Regular Buyer',
                email: 'user@example.com',
                password: 'password123',
                role: 'user',
                status: 'active'
            }
        ];

        const createdUsers = await User.insertMany(users);
        const adminUser = createdUsers[0];
        const sellerUser = createdUsers[1];

        const products = [
            {
                name: 'Premium Round Neck Tee',
                images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'],
                description: 'A classic 100% cotton round neck t-shirt for versatile everyday wear. Features premium stitching and a soft-touch finish.',
                category: 'Men',
                type: 'Round Neck',
                price: 999.00,
                stock: 50,
                seller: sellerUser._id,
                isVisible: true
            },
            {
                name: 'Signature V-Neck Collection',
                images: ['https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'],
                description: 'Elegant V-neck silhouette designed for a modern aesthetic. Breathable fabric suitable for all seasons.',
                category: 'Men',
                type: 'V Neck',
                price: 1249.00,
                stock: 35,
                seller: sellerUser._id,
                isVisible: true
            },
            {
                name: 'Women\'s Essential Polo',
                images: ['https://images.unsplash.com/photo-1576566588028-4147f3842f27?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'],
                description: 'Premium polo shirt featuring a refined collar and tailored fit. Perfect for casual professional settings.',
                category: 'Women',
                type: 'Polo',
                price: 1499.00,
                stock: 20,
                seller: sellerUser._id,
                isVisible: true
            },
            {
                name: 'Heritage Series V-Neck',
                images: ['https://images.unsplash.com/photo-1554568218-0f1715e72254?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'],
                description: 'A timeless V-neck piece from our Heritage collection. Sustainable cotton with long-lasting vibrant colors.',
                category: 'Women',
                type: 'V Neck',
                price: 1199.00,
                stock: 45,
                seller: sellerUser._id,
                isVisible: true
            }
        ];

        await Product.insertMany(products);

        console.log('--- DATA SYNCHRONIZATION COMPLETE ---');
        console.log('Users: 3 identities initialized');
        console.log('Products: 4 assets deployed');
        process.exit();
    } catch (error) {
        console.error(`ERROR: ${error.message}`);
        process.exit(1);
    }
};

const destroyData = async () => {
    try {
        await Activity.deleteMany();
        await Order.deleteMany();
        await Product.deleteMany();
        await User.deleteMany();
        await Cart.deleteMany();

        console.log('--- DATA PURGE COMPLETE ---');
        process.exit();
    } catch (error) {
        console.error(`ERROR: ${error.message}`);
        process.exit(1);
    }
};

if (process.argv[2] === '-d') {
    destroyData();
} else {
    importData();
}
