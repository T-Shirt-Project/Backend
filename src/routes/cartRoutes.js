const express = require('express');
const router = express.Router();
const { getCart, syncCart, clearCart, getUserCartAdmin, clearUserCartAdmin } = require('../controllers/cartController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getCart)
    .post(protect, syncCart)
    .delete(protect, clearCart);

router.route('/user/:id')
    .get(protect, admin, getUserCartAdmin)
    .delete(protect, admin, clearUserCartAdmin);

module.exports = router;
