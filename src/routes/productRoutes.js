const express = require('express');
const router = express.Router();
const { getProducts, getProductById, createProduct, updateProduct, deleteProduct, createProductReview, toggleLikeProduct } = require('../controllers/productController');
const { protect, admin, seller, loadUser } = require('../middleware/authMiddleware');

router.route('/').get(loadUser, getProducts).post(protect, seller, createProduct);
router.route('/:id').get(loadUser, getProductById).put(protect, seller, updateProduct).delete(protect, seller, deleteProduct);

router.route('/:id/reviews').post(protect, createProductReview);
router.route('/:id/like').post(protect, toggleLikeProduct);

module.exports = router;
