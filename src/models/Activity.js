const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    role: { // Role of the actor
        type: String,
        required: true,
        enum: ['admin', 'seller', 'user']
    },
    type: { // Action type
        type: String,
        required: true,
        enum: [
            'registration', 'login', 'logout',
            'profile_updated', 'status_change', 'role_change', 'user_deleted',
            'product_view', 'product_created', 'product_updated', 'product_deleted',
            'cart_add', 'cart_remove', 'cart_clear',
            'order_placed', 'order_received', 'order_status_change', 'order_cancelled', 'cancel_requested',
            'address_added', 'address_updated', 'address_deleted',
            'comment_added', 'system_action'
        ]
    },
    targetType: { // Type of affected entity
        type: String,
        required: true,
        enum: ['User', 'Seller', 'Product', 'Order', 'Address', 'System', 'Cart', 'Comment']
    },
    targetId: { // ID of the affected entity
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    description: { // Human-readable description
        type: String,
        required: true
    },
    details: { // Technical metadata
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Index for faster lookups by user and date
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ type: 1 });

const Activity = mongoose.model('Activity', activitySchema);
module.exports = Activity;
