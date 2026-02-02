const express = require('express');
const router = express.Router();
const {
    addOrderItems,
    getOrderById,
    updateOrderToPaid,
    updateOrderStatus,
    getMyOrders,
    getOrders,
    getStats,
    cancelOrder,
    getSellerOrders,
    getSellerOrderDetails
} = require('../controllers/orderController');
const { protect, admin, seller } = require('../middleware/authMiddleware');

router.route('/').post(protect, addOrderItems).get(protect, seller, getOrders);
router.route('/stats').get(protect, seller, getStats);
router.route('/myorders').get(protect, getMyOrders);

// Seller-specific order routes (must be before /:id to avoid conflicts)
router.route('/seller/my-orders').get(protect, seller, getSellerOrders);
router.route('/seller/:id').get(protect, seller, getSellerOrderDetails);

router.route('/:id').get(protect, getOrderById);
router.route('/:id/cancel').put(protect, cancelOrder);
router.route('/:id/pay').put(protect, updateOrderToPaid);
router.route('/:id/status').put(protect, seller, updateOrderStatus);
router.route('/user/:id').get(protect, admin, require('../controllers/orderController').getOrdersByUser);

module.exports = router;
