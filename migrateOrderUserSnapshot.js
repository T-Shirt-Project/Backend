/**
 * Migration Script: Add userSnapshot to Existing Orders
 * 
 * This script updates all existing orders to include userSnapshot field
 * by copying data from the referenced user document.
 * 
 * Run this ONCE after deploying the new Order schema.
 * 
 * Usage: node migrateOrderUserSnapshot.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./src/models/Order');
const User = require('./src/models/User');

const migrateOrders = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tshirt-store');
        console.log('✅ Connected to MongoDB');

        // Find all orders without userSnapshot
        const orders = await Order.find({ userSnapshot: { $exists: false } }).populate('user');
        console.log(`📊 Found ${orders.length} orders to migrate`);

        let successCount = 0;
        let failCount = 0;
        let noUserCount = 0;

        for (const order of orders) {
            try {
                if (!order.user) {
                    // User was already deleted (hard delete in old system)
                    // Create a placeholder userSnapshot
                    order.userSnapshot = {
                        name: 'Deleted User',
                        email: 'deleted@unknown.com',
                        phone: ''
                    };
                    noUserCount++;
                    console.log(`⚠️  Order ${order._id}: User not found, using placeholder`);
                } else {
                    // User exists, copy data to userSnapshot
                    order.userSnapshot = {
                        name: order.user.name,
                        email: order.user.email,
                        phone: order.user.phone || order.user.phoneNumber || ''
                    };
                    console.log(`✅ Order ${order._id}: Migrated user data for ${order.user.name}`);
                }

                await order.save();
                successCount++;
            } catch (err) {
                console.error(`❌ Failed to migrate order ${order._id}:`, err.message);
                failCount++;
            }
        }

        console.log('\n📈 Migration Summary:');
        console.log(`   ✅ Successfully migrated: ${successCount}`);
        console.log(`   ⚠️  Orders with deleted users: ${noUserCount}`);
        console.log(`   ❌ Failed: ${failCount}`);
        console.log('\n✨ Migration complete!');

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

// Run migration
migrateOrders();
