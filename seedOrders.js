const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Import models
const User = require('./src/models/User');
const Product = require('./src/models/Product');
const Order = require('./src/models/Order');

const seedOrders = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tshirt_platform');
        console.log('✅ MongoDB Connected');

        // Find or create test users
        let admin = await User.findOne({ email: 'admin@test.com' });
        if (!admin) {
            admin = await User.create({
                name: 'Admin User',
                email: 'admin@test.com',
                password: 'password123',
                role: 'admin',
                status: 'active'
            });
            console.log('✅ Admin user created');
        }

        let seller1 = await User.findOne({ email: 'seller1@test.com' });
        if (!seller1) {
            seller1 = await User.create({
                name: 'Seller One',
                email: 'seller1@test.com',
                password: 'password123',
                role: 'seller',
                status: 'active'
            });
            console.log('✅ Seller 1 created');
        }

        let seller2 = await User.findOne({ email: 'seller2@test.com' });
        if (!seller2) {
            seller2 = await User.create({
                name: 'Seller Two',
                email: 'seller2@test.com',
                password: 'password123',
                role: 'seller',
                status: 'active'
            });
            console.log('✅ Seller 2 created');
        }

        let customer1 = await User.findOne({ email: 'customer1@test.com' });
        if (!customer1) {
            customer1 = await User.create({
                name: 'John Doe',
                email: 'customer1@test.com',
                password: 'password123',
                role: 'user',
                status: 'active'
            });
            console.log('✅ Customer 1 created');
        }

        let customer2 = await User.findOne({ email: 'customer2@test.com' });
        if (!customer2) {
            customer2 = await User.create({
                name: 'Jane Smith',
                email: 'customer2@test.com',
                password: 'password123',
                role: 'user',
                status: 'active'
            });
            console.log('✅ Customer 2 created');
        }

        // Create sample products for sellers
        const products = [];

        // Seller 1 products
        const seller1Product1 = await Product.create({
            seller: seller1._id,
            name: 'Classic White T-Shirt',
            description: 'Premium cotton white t-shirt',
            price: 499,
            originalPrice: 699,
            images: ['https://via.placeholder.com/300x300/FFFFFF/000000?text=White+Tee'],
            category: 'Casual',
            type: 'T-Shirt',
            stock: 50,
            isVisible: true
        });
        products.push(seller1Product1);

        const seller1Product2 = await Product.create({
            seller: seller1._id,
            name: 'Black Polo Shirt',
            description: 'Stylish black polo shirt',
            price: 799,
            originalPrice: 999,
            images: ['https://via.placeholder.com/300x300/000000/FFFFFF?text=Black+Polo'],
            category: 'Formal',
            type: 'Polo',
            stock: 30,
            isVisible: true
        });
        products.push(seller1Product2);

        // Seller 2 products
        const seller2Product1 = await Product.create({
            seller: seller2._id,
            name: 'Blue Denim Shirt',
            description: 'Comfortable denim shirt',
            price: 1299,
            originalPrice: 1599,
            images: ['https://via.placeholder.com/300x300/4169E1/FFFFFF?text=Denim+Shirt'],
            category: 'Casual',
            type: 'Shirt',
            stock: 25,
            isVisible: true
        });
        products.push(seller2Product1);

        const seller2Product2 = await Product.create({
            seller: seller2._id,
            name: 'Red Graphic Tee',
            description: 'Trendy graphic t-shirt',
            price: 599,
            originalPrice: 799,
            images: ['https://via.placeholder.com/300x300/FF0000/FFFFFF?text=Red+Tee'],
            category: 'Casual',
            type: 'T-Shirt',
            stock: 40,
            isVisible: true
        });
        products.push(seller2Product2);

        console.log('✅ Products created');

        // Clear existing orders (optional - comment out if you want to keep existing)
        // await Order.deleteMany({});
        // console.log('🗑️  Existing orders cleared');

        // Create sample orders
        const orders = [];

        // Order 1: Customer 1 buys from Seller 1 only
        const order1 = await Order.create({
            user: customer1._id,
            orderItems: [
                {
                    product: seller1Product1._id,
                    qty: 2,
                    price: 499,
                    name: seller1Product1.name,
                    image: seller1Product1.images[0],
                    size: 'M'
                },
                {
                    product: seller1Product2._id,
                    qty: 1,
                    price: 799,
                    name: seller1Product2.name,
                    image: seller1Product2.images[0],
                    size: 'L'
                }
            ],
            shippingAddress: {
                street: '123 Main Street',
                city: 'Mumbai',
                state: 'Maharashtra',
                zipCode: '400001',
                country: 'India'
            },
            paymentMethod: 'COD',
            totalPrice: 1797,
            status: 'Placed'
        });
        orders.push(order1);

        // Order 2: Customer 2 buys from Seller 2 only
        const order2 = await Order.create({
            user: customer2._id,
            orderItems: [
                {
                    product: seller2Product1._id,
                    qty: 1,
                    price: 1299,
                    name: seller2Product1.name,
                    image: seller2Product1.images[0],
                    size: 'L'
                }
            ],
            shippingAddress: {
                street: '456 Park Avenue',
                city: 'Delhi',
                state: 'Delhi',
                zipCode: '110001',
                country: 'India'
            },
            paymentMethod: 'COD',
            totalPrice: 1299,
            status: 'Processing'
        });
        orders.push(order2);

        // Order 3: Customer 1 buys from BOTH sellers (multi-seller order)
        const order3 = await Order.create({
            user: customer1._id,
            orderItems: [
                {
                    product: seller1Product1._id,
                    qty: 1,
                    price: 499,
                    name: seller1Product1.name,
                    image: seller1Product1.images[0],
                    size: 'S'
                },
                {
                    product: seller2Product2._id,
                    qty: 2,
                    price: 599,
                    name: seller2Product2.name,
                    image: seller2Product2.images[0],
                    size: 'M'
                }
            ],
            shippingAddress: {
                street: '789 Beach Road',
                city: 'Bangalore',
                state: 'Karnataka',
                zipCode: '560001',
                country: 'India'
            },
            paymentMethod: 'COD',
            totalPrice: 1697,
            status: 'Shipped'
        });
        orders.push(order3);

        // Order 4: Customer 2 buys from BOTH sellers
        const order4 = await Order.create({
            user: customer2._id,
            orderItems: [
                {
                    product: seller1Product2._id,
                    qty: 1,
                    price: 799,
                    name: seller1Product2.name,
                    image: seller1Product2.images[0],
                    size: 'XL'
                },
                {
                    product: seller2Product1._id,
                    qty: 1,
                    price: 1299,
                    name: seller2Product1.name,
                    image: seller2Product1.images[0],
                    size: 'M'
                }
            ],
            shippingAddress: {
                street: '321 Lake View',
                city: 'Chennai',
                state: 'Tamil Nadu',
                zipCode: '600001',
                country: 'India'
            },
            paymentMethod: 'COD',
            totalPrice: 2098,
            status: 'Delivered'
        });
        orders.push(order4);

        // Order 5: Customer 1 buys from Seller 1
        const order5 = await Order.create({
            user: customer1._id,
            orderItems: [
                {
                    product: seller1Product1._id,
                    qty: 3,
                    price: 499,
                    name: seller1Product1.name,
                    image: seller1Product1.images[0],
                    size: 'L'
                }
            ],
            shippingAddress: {
                street: '555 Garden Street',
                city: 'Pune',
                state: 'Maharashtra',
                zipCode: '411001',
                country: 'India'
            },
            paymentMethod: 'COD',
            totalPrice: 1497,
            status: 'Placed'
        });
        orders.push(order5);

        console.log('✅ Sample orders created');
        console.log('\n📊 Summary:');
        console.log(`   - ${products.length} products created`);
        console.log(`   - ${orders.length} orders created`);
        console.log('\n👥 Test Accounts:');
        console.log('   Admin: admin@test.com / password123');
        console.log('   Seller 1: seller1@test.com / password123');
        console.log('   Seller 2: seller2@test.com / password123');
        console.log('   Customer 1: customer1@test.com / password123');
        console.log('   Customer 2: customer2@test.com / password123');
        console.log('\n🎯 Order Distribution:');
        console.log('   - Seller 1: 4 orders (2 single-seller, 2 multi-seller)');
        console.log('   - Seller 2: 3 orders (1 single-seller, 2 multi-seller)');
        console.log('   - Multi-seller orders: 2 (Order 3 & 4)');
        console.log('\n✅ Seeding complete!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding data:', error);
        process.exit(1);
    }
};

seedOrders();
