const Category = require('../models/Category');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({});
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create a category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        // Case-insensitive duplicate check
        const categoryExists = await Category.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (categoryExists) {
            return res.status(400).json({ message: 'Category already exists' });
        }

        const category = await Category.create({
            name,
            description
        });

        res.status(201).json(category);
    } catch (error) {
        res.status(400).json({ message: 'Invalid category data' });
    }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        const category = await Category.findById(req.params.id);

        if (category) {
            // Check for duplicates if name is changing
            if (name && name.toLowerCase() !== category.name.toLowerCase()) {
                const categoryExists = await Category.findOne({
                    name: { $regex: new RegExp(`^${name}$`, 'i') },
                    _id: { $ne: req.params.id }
                });

                if (categoryExists) {
                    return res.status(400).json({ message: 'Category name already in use' });
                }
            }

            category.name = name || category.name;
            category.description = description || category.description;

            const updatedCategory = await category.save();
            res.json(updatedCategory);
        } else {
            res.status(404).json({ message: 'Category not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const Product = require('../models/Product');

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (category) {
            // Check if any product uses this category (stored as 'type' in Product model)
            const count = await Product.countDocuments({ type: category.name });

            if (count > 0) {
                return res.status(400).json({ message: `Cannot delete: ${count} products use this category.` });
            }

            await category.deleteOne();
            res.json({ message: 'Category removed' });
        } else {
            res.status(404).json({ message: 'Category not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
