const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { // Targeted user (null if global)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    isGlobal: {
        type: Boolean,
        default: false,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['order_update', 'promotion', 'product', 'system'],
        default: 'system'
    },
    data: { // Flexible payload for navigation (productId, orderId, etc)
        type: Map,
        of: String,
        default: {}
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true // For sorting
    }
}, { timestamps: true });

// Index for valid sorting and filtering
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
