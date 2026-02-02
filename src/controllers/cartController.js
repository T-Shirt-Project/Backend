const Cart = require('../models/Cart');
const Activity = require('../models/Activity');

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
    const cart = await Cart.findOne({ userId: req.user._id }).populate('items.product');

    if (cart) {
        res.json(cart);
    } else {
        res.json({ userId: req.user._id, items: [] });
    }
};

// @desc    Sync user cart
// @route   POST /api/cart/sync
// @access  Private
const syncCart = async (req, res) => {
    const { items } = req.body;

    let cart = await Cart.findOne({ userId: req.user._id });

    if (cart) {
        cart.items = items;
        await cart.save();
    } else {
        cart = await Cart.create({
            userId: req.user._id,
            items
        });
    }

    // Log activity
    await Activity.create({
        userId: req.user._id,
        role: req.user.role,
        type: 'cart_add',
        targetType: 'Cart',
        description: `Synchronized shopping cart with ${items.length} items.`,
        details: { itemCount: items.length }
    });

    res.status(200).json(cart);
};

// @desc    Clear user cart
// @route   DELETE /api/cart
// @access  Private
const clearCart = async (req, res) => {
    const cart = await Cart.findOne({ userId: req.user._id });

    if (cart) {
        cart.items = [];
        await cart.save();

        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'cart_clear',
            targetType: 'Cart',
            description: `Cleared all items from the shopping cart.`,
        });
    }

    res.json({ message: 'Cart cleared' });
};

// --- ADMIN ONLY FUNCTIONS ---

// @desc    Get any user's cart
// @route   GET /api/cart/user/:id
// @access  Private/Admin
const getUserCartAdmin = async (req, res) => {
    const cart = await Cart.findOne({ userId: req.params.id }).populate('items.product');

    if (cart) {
        res.json(cart);
    } else {
        res.json({ userId: req.params.id, items: [] });
    }
};

// @desc    Clear any user's cart
// @route   DELETE /api/cart/user/:id
// @access  Private/Admin
const clearUserCartAdmin = async (req, res) => {
    const cart = await Cart.findOne({ userId: req.params.id });

    if (cart) {
        cart.items = [];
        await cart.save();

        // Log that an admin cleared the cart
        await Activity.create({
            userId: req.user._id, // Actor is the admin
            role: req.user.role,
            type: 'cart_clear',
            targetType: 'Cart',
            targetId: req.params.id, // Target is the user's ID
            description: `Admin cleared shopping cart for user ID: ${req.params.id}`,
            details: { targetUserId: req.params.id }
        });
    }

    res.json({ message: 'User cart cleared' });
};

module.exports = {
    getCart,
    syncCart,
    clearCart,
    getUserCartAdmin,
    clearUserCartAdmin
};
