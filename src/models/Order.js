const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    // Optional reference to user (nullable - can be null if user is deleted)
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },

    // REQUIRED: Immutable snapshot of user data at time of order
    // This ensures order history remains intact even after user deletion
    userSnapshot: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String }
    },

    orderItems: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        qty: { type: Number, required: true },
        price: { type: Number, required: true }, // Price at time of purchase
        originalPrice: { type: Number }, // Original price at time of purchase
        name: { type: String, required: true },
        image: { type: String },
        size: { type: String, required: true },
        status: {
            type: String,
            required: true,
            default: 'Placed',
            enum: ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled']
        }
    }],

    // Shipping address snapshot (immutable)
    shippingAddress: {
        name: { type: String },
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, required: true },
        phone: { type: String }
    },
    contactPhone: { type: String },

    paymentMethod: { type: String, required: true, default: 'COD' },
    status: {
        type: String,
        required: true,
        default: 'Placed',
        enum: ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled']
    },
    itemsPrice: { type: Number, required: true, default: 0.0 },
    taxPrice: { type: Number, required: true, default: 0.0 },
    shippingPrice: { type: Number, required: true, default: 0.0 },
    totalPrice: { type: Number, required: true },
    originalTotalPrice: { type: Number, default: 0.0 },
    savings: { type: Number, default: 0.0 },
    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date },
    isDelivered: { type: Boolean, default: false },
    deliveredAt: { type: Date },
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
