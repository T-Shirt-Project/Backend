const express = require('express');
const router = express.Router();
const {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/categoryController');
const { protect, admin } = require('../middleware/authMiddleware');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public (needed for product filtering)
router.route('/')
    .get(getCategories)
    .post(protect, admin, createCategory);  // Admin only

// @desc    Update/Delete category
// @route   PUT/DELETE /api/categories/:id
// @access  Private/Admin only
router.route('/:id')
    .put(protect, admin, updateCategory)    // Admin only
    .delete(protect, admin, deleteCategory); // Admin only

module.exports = router;
