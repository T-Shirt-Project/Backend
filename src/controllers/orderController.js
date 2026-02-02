const Order = require('../models/Order');
const Activity = require('../models/Activity');

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
            paymentMethod,
            itemsPrice,
            taxPrice,
            shippingPrice,
            totalPrice,
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
// @access Private/Seller only (Admin cannot update)
const updateOrderStatus = async (req, res) => {
    try {
        let { status } = req.body;

        // sanitize status string
        if (status) status = status.trim();

        const orderId = req.params.id;
        console.log(`Attempting to update order ${orderId} to status: '${status}' by user: ${req.user._id} (${req.user.role})`);

        // Validate status value
        const validStatuses = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
        if (!status || !validStatuses.includes(status)) {
            console.error(`Invalid status received: '${status}'`);
            return res.status(400).json({
                message: `Invalid order status: '${status}'. Allowed: ${validStatuses.join(', ')}`
            });
        }

        // Prevent manual setting of "Placed" status (system-controlled)
        if (status === 'Placed') {
            return res.status(400).json({
                message: 'Order Placed status is system-controlled and cannot be set manually'
            });
        }

        const order = await Order.findById(orderId).populate('orderItems.product');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // SELLER AUTHORIZATION: Verify seller owns at least one product in the order
        if (req.user.role === 'seller') {
            const Product = require('../models/Product');
            const myProducts = await Product.find({ seller: req.user._id }).select('_id');
            const productIds = myProducts.map(p => p._id.toString());

            // Check if seller has any product in the order (Handling potential null products if deleted)
            const hasOwnProduct = order.orderItems.some(item =>
                item.product && productIds.includes(item.product._id.toString())
            );

            if (!hasOwnProduct) {
                console.error(`User ${req.user._id} not authorized to update order ${orderId}`);
                return res.status(403).json({
                    message: 'You are not authorized to update this order'
                });
            }
        }

        // Prevent updating already delivered orders (Unless it's an error correction, but typically locked)
        // Allowing 'Delivered' -> 'Delivered' is idempotent, but 'Delivered' -> 'Shipped' is weird.
        // Assuming strict forward flow except cancellation.
        if (order.status === 'Delivered' && status !== 'Delivered') {
            return res.status(400).json({
                message: 'Cannot change status of an order that is already Delivered'
            });
        }

        // Prevent updating cancelled orders
        if (order.status === 'Cancelled') {
            return res.status(400).json({
                message: 'Cannot update status of cancelled orders'
            });
        }

        // Define status progression order
        const statusOrder = {
            'Placed': 0,
            'Processing': 1,
            'Shipped': 2,
            'Out for Delivery': 3,
            'Delivered': 4,
            'Cancelled': -1
        };

        const currentStatusLevel = statusOrder[order.status] !== undefined ? statusOrder[order.status] : -99;
        const newStatusLevel = statusOrder[status];

        // Prevent backward transitions (except to Cancelled or if current status is invalid/custom)
        if (status !== 'Cancelled' && currentStatusLevel !== -99 && newStatusLevel < currentStatusLevel) {
            return res.status(400).json({
                message: `Invalid status transition: Cannot move from ${order.status} to ${status}`
            });
        }

        // Store old status for logging
        const oldStatus = order.status;

        // Update order status
        order.status = status;

        // Update delivery flags
        if (status === 'Delivered') {
            order.isDelivered = true;
            order.deliveredAt = Date.now();
        }

        const updatedOrder = await order.save();
        console.log(`Order ${orderId} updated successfully to ${status}`);

        // Log activity for audit trail with actor role tracking
        try {
            await Activity.create({
                userId: req.user._id,
                role: req.user.role,
                type: 'order_status_change',
                targetType: 'Order',
                targetId: order._id,
                description: `[${req.user.role.toUpperCase()}] ${req.user.name} updated order #${order._id.toString().substring(18).toUpperCase()} status: ${oldStatus} → ${status}`,
                details: {
                    orderId: order._id,
                    oldStatus,
                    newStatus: status,
                    actorRole: req.user.role,
                    actorId: req.user._id,
                    actorName: req.user.name,
                    targetUserId: order.user,
                    timestamp: new Date(),
                    isAdminOverride: req.user.role === 'admin'
                }
            });
        } catch (auditErr) {
            console.error('Audit log failed, but order updated:', auditErr);
            // Non-blocking error
        }

        res.json(updatedOrder);
    } catch (error) {
        console.error('Update Order Status Error:', error);
        res.status(500).json({
            message: 'Failed to update order status',
            error: error.message
        });
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
    const { startDate, endDate, sellerId, productId } = req.query;

    let dateQuery = {};
    if (startDate || endDate) {
        dateQuery.createdAt = {};
        if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
        if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
    }

    if (req.user.role === 'admin') {
        let orderQuery = { ...dateQuery, status: { $nin: ['Cancelled', 'Failed'] } };

        // If filtering by specific seller
        if (sellerId) {
            const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
            orderQuery["orderItems.product"] = { $in: sellerProducts.map(p => p._id) };
        }

        const totalOrders = await Order.countDocuments(orderQuery);
        const totalUsers = await User.countDocuments({ role: 'user' });
        const totalSellers = await User.countDocuments({ role: 'seller' });

        const orders = await Order.find(orderQuery);

        let revenue = 0;
        const sellerProducts = sellerId ? await Product.find({ seller: sellerId }).select('_id') : [];
        const sellerProductIds = sellerProducts.map(p => p._id.toString());

        orders.forEach(order => {
            order.orderItems.forEach(item => {
                const itemProductId = item.product?._id ? item.product._id.toString() : item.product.toString();
                if (!sellerId || sellerProductIds.includes(itemProductId)) {
                    revenue += item.price * (item.qty || item.quantity || 1);
                }
            });
        });

        res.json({
            totalOrders,
            totalUsers,
            totalSellers,
            totalRevenue: revenue,
        });
    } else {
        // Seller
        const myProducts = await Product.find({ seller: req.user._id });
        const productIds = myProducts.map(p => p._id.toString());

        let orderQuery = {
            ...dateQuery,
            "orderItems.product": { $in: myProducts.map(p => p._id) },
            status: { $nin: ['Cancelled', 'Failed'] }
        };

        if (productId) {
            orderQuery["orderItems.product"] = productId;
        }

        const orders = await Order.find(orderQuery);

        let sellerRevenue = 0;
        orders.forEach(order => {
            order.orderItems.forEach(item => {
                if (productId) {
                    if (item.product.toString() === productId) {
                        sellerRevenue += item.price * (item.qty || item.quantity || 1);
                    }
                } else if (productIds.includes(item.product.toString())) {
                    sellerRevenue += item.price * (item.qty || item.quantity || 1);
                }
            });
        });

        res.json({
            totalOrders: orders.length,
            totalProducts: myProducts.length,
            totalRevenue: sellerRevenue,
        });
    }
};

// @desc Cancel order
// @route PUT /api/orders/:id/cancel
const cancelOrder = async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (order) {
        if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }

        if (order.status !== 'Placed') {
            res.status(400).json({ message: 'Order cannot be cancelled as it is already ' + order.status });
            return;
        }

        order.status = 'Cancelled';
        const updatedOrder = await order.save();

        const productNames = order.orderItems.map(item => item.name).join(', ');

        // Find unique sellers for these products to tag them in the log
        const Product = require('../models/Product');
        const orderProducts = await Product.find({ _id: { $in: order.orderItems.map(i => i.product) } });
        const sellerIds = [...new Set(orderProducts.map(p => p.seller.toString()))];

        if (req.user.role === 'user') {
            // Log as cancel request
            await Activity.create({
                userId: req.user._id,
                role: 'user',
                type: 'cancel_requested',
                targetType: 'Order',
                targetId: order._id,
                description: `Submitted a cancellation request for order #${order._id.toString().substring(18).toUpperCase()}`,
                details: { orderId: order._id, reason: req.body.reason || 'User initiated', sellerIds }
            });
        }

        // Log general cancellation
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'order_cancelled',
            targetType: 'Order',
            targetId: order._id,
            description: `Order #${order._id.toString().substring(18).toUpperCase()} was officially cancelled by ${req.user.role}.`,
            details: {
                orderId: order._id,
                status: 'Cancelled',
                productNames,
                userName: req.user.name,
                sellerIds // Used for role-based scoping in getAllActivities
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
        const page = Number(req.query.page) || 1;
        const pageSize = 20;

        // Get all products owned by this seller
        const myProducts = await Product.find({ seller: req.user._id }).select('_id');
        const productIds = myProducts.map(p => p._id.toString());

        if (productIds.length === 0) {
            return res.json({ orders: [], page: 1, pages: 0, totalOrders: 0 });
        }

        // Find orders that contain at least one of seller's products
        const query = { "orderItems.product": { $in: productIds } };

        // Optional status filter
        if (req.query.status) {
            query.status = req.query.status;
        }

        const count = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .populate('orderItems.product')
            .limit(pageSize)
            .skip(pageSize * (page - 1))
            .sort({ createdAt: -1 });

        // Filter order items to show only seller's products
        const filteredOrders = orders.map(order => {
            const orderObj = order.toObject();
            orderObj.orderItems = orderObj.orderItems.filter(item =>
                productIds.includes(item.product._id.toString())
            );
            // Calculate seller-specific total
            orderObj.sellerTotal = orderObj.orderItems.reduce((sum, item) =>
                sum + (item.price * item.qty), 0
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

        // Get seller's products
        const myProducts = await Product.find({ seller: req.user._id }).select('_id');
        const productIds = myProducts.map(p => p._id.toString());

        const order = await Order.findById(req.params.id)
            .populate('orderItems.product');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check if seller has any products in this order
        const sellerItems = order.orderItems.filter(item =>
            productIds.includes(item.product._id.toString())
        );

        if (sellerItems.length === 0) {
            return res.status(403).json({
                message: 'You are not authorized to view this order'
            });
        }

        // Return order with only seller's items
        const orderObj = order.toObject();
        orderObj.orderItems = sellerItems;
        orderObj.sellerTotal = sellerItems.reduce((sum, item) =>
            sum + (item.price * item.qty), 0
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
