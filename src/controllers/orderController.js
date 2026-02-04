const Order = require('../models/Order');
const Activity = require('../models/Activity');
const { notifyUser } = require('../utils/notificationService');

// @desc Create new order
// @route POST /api/orders
const addOrderItems = async (req, res) => {
    const {
        orderItems,
        shippingAddress,
        paymentMethod,
        itemsPrice,
        taxPrice,
        shippingPrice,
        totalPrice,
        originalTotalPrice,
        savings,
        contactPhone
    } = req.body;

    if (orderItems && orderItems.length === 0) {
        res.status(400);
        throw new Error('No order items');
        return;
    } else {
        // Create immutable snapshot of user data at order time
        // This ensures order history remains intact even if user is deleted
        const userSnapshot = {
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone || req.user.phoneNumber || ''
        };

        const order = new Order({
            orderItems,
            user: req.user._id,
            userSnapshot, // Store user snapshot for data integrity
            shippingAddress,
            contactPhone: contactPhone || userSnapshot.phone, // Capture contact phone snapshot
            paymentMethod,
            itemsPrice: itemsPrice || totalPrice,
            taxPrice: taxPrice || 0,
            shippingPrice: shippingPrice || 0,
            totalPrice,
            originalTotalPrice: originalTotalPrice || totalPrice,
            savings: savings || 0,
            status: 'Placed'
        });

        const createdOrder = await order.save();

        const productNames = createdOrder.orderItems.map(item => item.name).join(', ');

        // Identify sellers involved in this order to notify them in their audit logs
        const Product = require('../models/Product');
        const productIds = createdOrder.orderItems.map(item => item.product); // Assuming item.product is the ID
        const products = await Product.find({ _id: { $in: productIds } }).select('seller');
        const sellerIds = [...new Set(products.map(p => p.seller.toString()))];

        // Log activity (User)
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'order_placed',
            targetType: 'Order',
            targetId: createdOrder._id,
            description: `Placed a new order #${createdOrder._id.toString().substring(18).toUpperCase()} for ${productNames}`,
            details: {
                orderId: createdOrder._id,
                productNames,
                amount: createdOrder.totalPrice,
                sellerIds: sellerIds // Critical: Allows sellers to see this activity
            }
        });

        // 7. Send Notification (Order Placed)
        const orderRef = createdOrder._id.toString().substring(18).toUpperCase();
        await notifyUser(
            req.user._id,
            'Order Placed ✅',
            `Your order #${orderRef} has been placed successfully.`,
            'order_update',
            { orderId: createdOrder._id, status: 'Placed' }
        );

        res.status(201).json(createdOrder);
    }
};

// @desc Get order by ID
// @route GET /api/orders/:id
const getOrderById = async (req, res) => {
    // DO NOT populate user here - use userSnapshot for display purposes
    // Orders must remain independent of live user records for history integrity
    const order = await Order.findById(req.params.id);

    if (order) {
        // Check if admin or owner
        // order.user can be null if user hard-deleted, but we check matching IDs if it exists
        const isOwner = order.user && order.user.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        const isSeller = req.user.role === 'seller';

        // Basic authorization: Admin, Seller, or the User who placed the order
        if (!isAdmin && !isSeller && !isOwner) {
            return res.status(401).json({ message: 'Not Authorized' });
        }

        res.json(order);
    } else {
        res.status(404).json({ message: 'Order not found' });
    }
};

// @desc Update order to paid
// @route PUT /api/orders/:id/pay
const updateOrderToPaid = async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (order) {
        order.isPaid = true;
        order.paidAt = Date.now();
        order.paymentResult = {
            id: req.body.id,
            status: req.body.status,
            update_time: req.body.update_time,
            email_address: req.body.email_address,
        };

        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } else {
        res.status(404).json({ message: 'Order not found' });
    }
};

// @desc Update order status
// @route PUT /api/orders/:id/status
// @access Private/Seller or Admin
const updateOrderStatus = async (req, res) => {
    try {
        let { status } = req.body;
        if (status) status = status.trim();

        const orderId = req.params.id;
        const user = req.user;

        // Validate status value
        const validStatuses = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                message: `Invalid order status: '${status}'. Allowed: ${validStatuses.join(', ')}`
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // MIGRATION: Ensure all items have a status (default to current order status if missing)
        // This ensures that if we update one item, others don't fall back to the NEW order status randomly.
        order.orderItems.forEach(item => {
            if (!item.status) {
                item.status = order.status;
            }
        });

        // AUTHORIZATION & ITEM SELECTION
        let targetItemIds = [];

        if (user.role === 'admin') {
            // Admin updates ALL items (except maybe already final ones, but let's stick to simple override)
            // Admin can force status Sync
            targetItemIds = order.orderItems.map(i => i._id.toString());
            console.log(`Admin ${user.name} overriding status for order ${orderId} to ${status}`);
        } else if (user.role === 'seller') {
            // SELLER AUTHORIZATION: Verify seller owns at least one product in the order
            const Product = require('../models/Product');
            const myProducts = await Product.find({ seller: user._id }).select('_id');
            const myProductIds = myProducts.map(p => p._id.toString());

            const sellerItems = order.orderItems.filter(item =>
                item.product && myProductIds.includes(item.product.toString())
            );

            if (sellerItems.length === 0) {
                return res.status(403).json({ message: 'You are not authorized to update this order' });
            }

            // Identify items belonging to this seller
            targetItemIds = sellerItems.map(i => i._id.toString());

            // Seller Restrictions
            if (status === 'Placed') {
                return res.status(400).json({ message: 'Sellers cannot set status back to Placed' });
            }
        } else {
            return res.status(403).json({ message: 'Unauthorized role for status update' });
        }

        // BUSINESS LOGIC: Status Transition Validation (Strict forward flow)
        if (order.status === 'Cancelled') {
            return res.status(400).json({ message: 'Cannot update status of a cancelled order' });
        }

        const statusRank = {
            'Placed': 0,
            'Processing': 1,
            'Shipped': 2,
            'Out for Delivery': 3,
            'Delivered': 4,
            'Cancelled': 99
        };

        const currentRank = statusRank[order.status] || 0;
        const newRank = statusRank[status];

        // Allow Admin to move backward if needed for corrections, but Seller is strict forward
        if (user.role !== 'admin' && status !== 'Cancelled' && newRank < currentRank) {
            // Note: We check Order Level rank, but technically we should check Item Level.
            // For simplicity and backward stability, if Order is "Shipped", we don't let Seller move their item to "Processing"?
            // Actually, if Seller A is "Shipped", and they want to correct to "Processing", they might be blocked if Order is "Shipped".
            // But this matches the previous logic.
            return res.status(400).json({
                message: `Invalid status transition: Cannot move from ${order.status} to ${status}`
            });
        }

        // UPDATE ITEMS
        let updatedCount = 0;
        order.orderItems.forEach(item => {
            if (targetItemIds.includes(item._id.toString())) {
                // Don't update if item is Cancelled (unless Admin forces?)
                if (item.status !== 'Cancelled') {
                    item.status = status;
                    updatedCount++;
                }
            }
        });

        if (updatedCount === 0) {
            return res.status(400).json({ message: 'No eligible active items to update (items might be Cancelled)' });
        }

        // UPDATE ORDER LEVEL STATUS
        // We update the root status to reflect the change, primarily for the "Dashboard" view.
        // If specific items advanced, we advance the Order status.
        // If the new status is "ahead", we adopt it.
        const oldStatus = order.status;
        if (newRank >= currentRank && status !== 'Cancelled') {
            order.status = status;
        }

        // Edge Case: If all items are Delivered, ensure Order is Delivered
        const activeItems = order.orderItems.filter(i => i.status !== 'Cancelled');
        const allDelivered = activeItems.every(i => i.status === 'Delivered');
        if (allDelivered && activeItems.length > 0) {
            order.status = 'Delivered';
            order.isDelivered = true;
            order.deliveredAt = Date.now();
        }

        const updatedOrder = await order.save();

        // AUDIT LOG
        try {
            await Activity.create({
                userId: user._id,
                role: user.role,
                type: 'order_status_change',
                targetType: 'Order',
                targetId: order._id,
                description: `Status updated: ${oldStatus} → ${status} (${user.role})`,
                details: {
                    orderId: order._id,
                    oldStatus,
                    newStatus: status,
                    updatedItemsCount: updatedCount,
                    actorName: user.name,
                    isAdminOverride: user.role === 'admin'
                }
            });
        } catch (auditErr) {
            console.warn('Audit fail:', auditErr.message);
        }

        // NOTIFICATION TRIGGER
        if (order.user) {
            const shortId = order._id.toString().substring(18).toUpperCase();

            // Get names of updated items
            const updatedItemNames = order.orderItems
                .filter(item => targetItemIds.includes(item._id.toString()))
                .map(i => i.name)
                .join(', ');

            let title = `Order Update`;
            let body = `Your order #${shortId} status is now ${status}`;

            // Specific message for Item updates (Multi-seller support)
            if (updatedItemNames && updatedCount < order.orderItems.length) {
                body = `Update for ${updatedItemNames}: Status is now ${status}`;
            }

            switch (status) {
                case 'Processing':
                    title = 'Order Processing ⚙️';
                    if (!updatedItemNames) body = `Your order #${shortId} is now being processed.`;
                    break;
                case 'Shipped':
                    title = 'Order Shipped 🚚';
                    if (!updatedItemNames) body = `Your order #${shortId} has been shipped!`;
                    else body = `Your item(s) (${updatedItemNames}) have been shipped 🚚`;
                    break;
                case 'Out for Delivery':
                    title = 'Out for Delivery 📦';
                    if (!updatedItemNames) body = `Get ready! Your order #${shortId} is out for delivery.`;
                    else body = `Your item(s) (${updatedItemNames}) are out for delivery 📦`;
                    break;
                case 'Delivered':
                    title = 'Delivered 🎉';
                    if (!updatedItemNames) body = `Your order #${shortId} has been delivered. Enjoy!`;
                    else body = `Your item(s) (${updatedItemNames}) have been delivered 🎉`;
                    break;
                case 'Cancelled':
                    title = 'Order Cancelled ❌';
                    body = `Your order #${shortId} has been cancelled.`;
                    break;
            }

            // Only notify if status actually changed or items updated
            // We already filtered for "updatedCount > 0" or status change earlier
            await notifyUser(
                order.user,
                title,
                body,
                'order_update',
                { orderId: order._id, status: status }
            );
        }

        res.json(updatedOrder);
    } catch (error) {
        console.error('Update Status Error:', error);
        res.status(500).json({ message: 'Internal server error during status sync' });
    }
};


// @desc Get logged in user orders
// @route GET /api/orders/myorders
const getMyOrders = async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
};

// @desc Get all orders
// @route GET /api/orders
const getOrders = async (req, res) => {
    const pageSize = Number(req.query.limit) || 20;
    const page = Number(req.query.pageNumber) || 1;
    const { status, userId, sellerId, active } = req.query;

    let query = {};

    // Role-based scoping
    if (req.user.role === 'seller') {
        const Product = require('../models/Product');
        const myProducts = await Product.find({ seller: req.user._id }).select('_id');
        const productIds = myProducts.map(p => p._id);
        query["orderItems.product"] = { $in: productIds };
    } else if (req.user.role === 'admin' && sellerId) {
        const Product = require('../models/Product');
        const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
        const productIds = sellerProducts.map(p => p._id);
        query["orderItems.product"] = { $in: productIds };
    }

    // Filters
    if (status) query.status = status;
    if (userId) query.user = userId;
    if (active === 'true') {
        query.status = { $nin: ['Delivered', 'Cancelled'] };
    }

    if (req.query.startDate || req.query.endDate) {
        query.createdAt = {};
        if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
        if (req.query.endDate) query.createdAt.$lte = new Date(req.query.endDate);
    }

    const count = await Order.countDocuments(query);
    const orders = await Order.find(query)
        .populate('orderItems.product')
        .limit(pageSize)
        .skip(pageSize * (page - 1))
        .sort({ createdAt: -1 });

    res.json({ orders, page, pages: Math.ceil(count / pageSize), totalOrders: count });
};

// @desc Get orders by user ID (Admin)
// @route GET /api/orders/user/:id
const getOrdersByUser = async (req, res) => {
    const orders = await Order.find({ user: req.params.id })
        .populate('orderItems.product')
        .sort({ createdAt: -1 });
    res.json(orders);
};

const getStats = async (req, res) => {
    const User = require('../models/User');
    const Product = require('../models/Product');
    const mongoose = require('mongoose'); // Import mongoose for ObjectId
    const { startDate, endDate, sellerId } = req.query;

    try {
        const matchStage = {
            status: 'Delivered', // Strict revenue rule
        };

        // Date Filtering
        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) matchStage.createdAt.$lte = new Date(endDate);
        }

        let revenuePipeline = [];
        const isAdmin = req.user.role === 'admin';
        const targetSellerId = isAdmin && sellerId && sellerId !== 'all' ? sellerId : (!isAdmin ? req.user._id : null);

        if (targetSellerId) {
            // SELLER SPECIFIC REVENUE (Admin viewing seller OR Seller viewing self)
            // 1. Match delivered orders within date range
            // 2. Unwind items to check ownership
            // 3. Lookup product to verify seller
            // 4. Filter items for this seller
            // 5. Group by date and sum

            console.log(`Calculating revenue for seller: ${targetSellerId}`);

            revenuePipeline = [
                { $match: matchStage },
                { $unwind: '$orderItems' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'orderItems.product',
                        foreignField: '_id',
                        as: 'productInfo'
                    }
                },
                { $unwind: '$productInfo' }, // Convert array to object
                {
                    $match: {
                        'productInfo.seller': typeof targetSellerId === 'string' ? new mongoose.Types.ObjectId(targetSellerId) : targetSellerId
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        dailyRevenue: { $sum: { $multiply: ["$orderItems.price", { $ifNull: ["$orderItems.qty", "$orderItems.quantity", 1] }] } },
                        count: { $sum: 1 } // Items count, not order count
                    }
                },
                { $sort: { _id: 1 } }
            ];

        } else {
            // ADMIN GLOBAL REVENUE
            // Sum total order value
            revenuePipeline = [
                { $match: matchStage },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        dailyRevenue: { $sum: "$totalPrice" },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ];
        }

        const revenueResults = await Order.aggregate(revenuePipeline);

        // Process Graph Data
        let totalRevenue = 0;
        const dailyRevenueMap = {};

        revenueResults.forEach(item => {
            totalRevenue += item.dailyRevenue;
            dailyRevenueMap[item._id] = item.dailyRevenue;
        });

        const graphData = Object.keys(dailyRevenueMap).map(date => ({
            date,
            revenue: dailyRevenueMap[date]
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        // Get other counts (independent of 'Delivered' status for general stats, except maybe inventory)
        // General stats usually show TOTAL orders placed, not just delivered.
        // But for consistency with "Revenue", maybe we should stick to general activity?
        // Let's keep existing logic for counts: All non-cancelled orders usually.

        let countQuery = {};
        if (startDate || endDate) {
            countQuery.createdAt = matchStage.createdAt;
        }

        // Refine count query for role
        if (targetSellerId) {
            // It's hard to count "orders" for a seller efficiently without similar aggregation if we only want orders containing their products.
            // But for unrelated counts (Users, Sellers), mostly Admin cares. 
            // Sellers care about "My Orders".

            // Simplification for Performance: Use a separate count for "Total Orders" if needed, 
            // but here we can just return the Delivered Count derived from aggregation or do a simple count.
            // Let's keep it simple and just do a count for "All Non-Cancelled" for the card.

            const Product = require('../models/Product');
            const sellerProducts = await Product.find({ seller: targetSellerId }).select('_id');
            const sPIds = sellerProducts.map(p => p._id);
            countQuery["orderItems.product"] = { $in: sPIds };
        }

        // Exclude Cancelled for general "Orders" stat
        countQuery.status = { $nin: ['Cancelled', 'Failed'] };

        const totalOrders = await Order.countDocuments(countQuery);

        // Entitity Counts (Admin Only)
        let totalUsers = 0;
        let totalSellers = 0;

        if (isAdmin && !targetSellerId) {
            totalUsers = await User.countDocuments({ role: 'user' });
            totalSellers = await User.countDocuments({ role: 'seller' });
        }

        // Products Count
        const productQuery = targetSellerId ? { seller: targetSellerId } : {};
        const totalProducts = await Product.countDocuments(productQuery);

        res.json({
            totalOrders,
            totalUsers,
            totalSellers,
            totalProducts,
            totalRevenue,
            graphData
        });

    } catch (error) {
        console.error('Stats Aggregation Error:', error);
        res.status(500).json({ message: 'Failed to calculate analytics' });
    }
};

// @desc Cancel order or specific item
// @route PUT /api/orders/:id/cancel
const cancelOrder = async (req, res) => {
    const order = await Order.findById(req.params.id);
    const { itemId } = req.body;

    if (order) {
        if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }

        // Helper to check if a status allows cancellation
        const isCancellable = (status) => {
            // BACKWARD COMPATIBILITY: If item status is undefined, check order status
            // RULE: Can only cancel if 'Placed'. 
            // If status is 'Processing' or later, CANNOT cancel.
            const s = status || order.status;
            return s === 'Placed';
        };

        if (itemId) {
            // ITEM LEVEL CANCELLATION
            const item = order.orderItems.find(i => i._id.toString() === itemId);
            if (!item) {
                res.status(404).json({ message: 'Order item not found' });
                return;
            }

            if (!isCancellable(item.status)) {
                res.status(400).json({
                    message: `Item cannot be cancelled as it is already ${item.status || order.status || 'Processing'}`
                });
                return;
            }

            if (item.status === 'Cancelled') {
                res.status(400).json({ message: 'Item is already cancelled' });
                return;
            }

            item.status = 'Cancelled';

            // Recalculate Order Status
            // If all items are Cancelled, Order is Cancelled
            const allCancelled = order.orderItems.every(i => i.status === 'Cancelled');
            if (allCancelled) {
                order.status = 'Cancelled';
            }

        } else {
            // FULL ORDER CANCELLATION
            // Verify ALL items (or at least one active item) are cancellable
            // If ANY active item is not 'Placed', fail the whole cancellation
            const activeItems = order.orderItems.filter(i => i.status !== 'Cancelled');
            const canCancelAll = activeItems.every(i => isCancellable(i.status));

            if (!canCancelAll) {
                res.status(400).json({
                    message: 'Order cannot be cancelled because one or more items are already being processed.'
                });
                return;
            }

            order.status = 'Cancelled';
            order.orderItems.forEach(item => {
                if (item.status !== 'Cancelled') {
                    item.status = 'Cancelled';
                }
            });
        }

        const updatedOrder = await order.save();

        const productNames = itemId
            ? order.orderItems.find(i => i._id.toString() === itemId).name
            : order.orderItems.map(item => item.name).join(', ');

        const targetDescription = itemId
            ? `Cancelled item: ${productNames} in Order #${order._id.toString().substring(18).toUpperCase()}`
            : `Order #${order._id.toString().substring(18).toUpperCase()} was officially cancelled by ${req.user.role}.`;

        // Find unique sellers for these products to tag them in the log
        const Product = require('../models/Product');
        const productIds = itemId
            ? [order.orderItems.find(i => i._id.toString() === itemId).product]
            : order.orderItems.map(i => i.product);

        const orderProducts = await Product.find({ _id: { $in: productIds } });
        const sellerIds = [...new Set(orderProducts.map(p => p.seller.toString()))];

        // Log cancellation
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'order_cancelled',
            targetType: 'Order',
            targetId: order._id,
            description: targetDescription,
            details: {
                orderId: order._id,
                itemId: itemId || null,
                status: 'Cancelled',
                productNames,
                userName: req.user.name,
                sellerIds
            }
        });

        res.json(updatedOrder);
    } else {
        res.status(404).json({ message: 'Order not found' });
    }
};

// @desc Get seller's orders (orders containing their products)
// @route GET /api/orders/seller/my-orders
// @access Private/Seller
const getSellerOrders = async (req, res) => {
    try {
        const Product = require('../models/Product');
        const pageSize = 10;
        const page = Number(req.query.page) || 1;

        let query = {};
        let productIds = [];
        const isAdmin = req.user.role === 'admin' || req.user.role === 'Admin';

        if (!isAdmin) {
            // Get seller's products
            const myProducts = await Product.find({ seller: req.user._id }).select('_id');
            productIds = myProducts.map(p => p._id.toString());
            // Find orders that contain at least one of seller's products
            query = { "orderItems.product": { $in: productIds } };
        }

        // Optional status filter
        if (req.query.status && req.query.status !== 'all') {
            query.status = req.query.status;
        }

        const count = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .populate('orderItems.product')
            .populate('user', 'name email')
            .limit(pageSize)
            .skip(pageSize * (page - 1))
            .sort({ createdAt: -1 });

        // Filter order items to show only seller's products (unless Admin)
        const filteredOrders = orders.map(order => {
            const orderObj = order.toObject();

            if (!isAdmin) {
                orderObj.orderItems = orderObj.orderItems.filter(item =>
                    item.product && productIds.includes(item.product._id ? item.product._id.toString() : item.product.toString())
                );
            }

            // Calculate total for displayed items
            orderObj.sellerTotal = orderObj.orderItems.reduce((sum, item) =>
                sum + (item.price * (item.qty || 1)), 0
            );
            orderObj.sellerItemCount = orderObj.orderItems.length;
            return orderObj;
        });

        res.json({
            orders: filteredOrders,
            page,
            pages: Math.ceil(count / pageSize),
            totalOrders: count
        });
    } catch (error) {
        console.error('Get Seller Orders Error:', error);
        res.status(500).json({ message: 'Failed to fetch orders' });
    }
};

// @desc Get seller-specific order details
// @route GET /api/orders/seller/:id
// @access Private/Seller
const getSellerOrderDetails = async (req, res) => {
    try {
        const Product = require('../models/Product');

        const order = await Order.findById(req.params.id)
            .populate('orderItems.product')
            .populate('user', 'name email');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        let sellerItems = [];
        const isAdmin = req.user.role === 'admin' || req.user.role === 'Admin';

        if (isAdmin) {
            // Admin sees everything
            sellerItems = order.orderItems;
        } else {
            // Get seller's products
            const myProducts = await Product.find({ seller: req.user._id }).select('_id');
            const productIds = myProducts.map(p => p._id.toString());

            // Check if seller has any products in this order
            sellerItems = order.orderItems.filter(item => {
                if (!item.product) return false;
                const productId = item.product._id ? item.product._id.toString() : item.product.toString();
                return productIds.includes(productId);
            });

            if (sellerItems.length === 0) {
                console.warn(`403 FORBIDDEN: User ${req.user._id} (Role: ${req.user.role}) attempted to view order ${req.params.id}`);
                return res.status(403).json({
                    message: 'You are not authorized to view this order'
                });
            }
        }

        // Return order with appropriate items
        const orderObj = order.toObject();
        orderObj.orderItems = sellerItems;
        orderObj.sellerTotal = sellerItems.reduce((sum, item) =>
            sum + (item.price * (item.qty || item.quantity || 1)), 0
        );
        orderObj.sellerItemCount = sellerItems.length;

        res.json(orderObj);
    } catch (error) {
        console.error('Get Seller Order Details Error:', error);
        res.status(500).json({ message: 'Failed to fetch order details' });
    }
};

module.exports = {
    addOrderItems,
    getOrderById,
    updateOrderToPaid,
    updateOrderStatus,
    getMyOrders,
    getOrders,
    getOrdersByUser,
    getStats,
    cancelOrder,
    getSellerOrders,
    getSellerOrderDetails
};
