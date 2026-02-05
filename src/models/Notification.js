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
    imageUrl: {
        type: String,
        default: null
    },
    type: {
        type: String,
        enum: ['ORDER', 'PRODUCT', 'OFFER', 'SYSTEM', 'order_update', 'promotion'], // keeping old ones for compatibility during migration if any
        default: 'SYSTEM'
    },
    referenceId: { // productId or orderId
        type: String,
        default: null,
        index: true
    },
    data: { // Flexible payload for navigation
        type: Map,
        of: String,
        default: {}
    },
    read: {
        type: Boolean,
        default: false
    },
    deleted: {
        type: Boolean,
        default: false,
        index: true
    },
    status: { // For duplicate prevention status checking
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, { timestamps: true });

// CRITICAL: Unique constraint for duplicate prevention
// (userId + type + referenceId + status/subType)
notificationSchema.index({ userId: 1, type: 1, referenceId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: { status: { $type: "string" }, userId: { $exists: true } }
});

// Index for valid sorting and filtering
notificationSchema.index({ userId: 1, deleted: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

