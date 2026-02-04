const Product = require('../models/Product');
const Order = require('../models/Order');
const Comment = require('../models/Comment');
const Activity = require('../models/Activity');

// @desc Fetch all products
// @route GET /api/products
const getProducts = async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;

    const keyword = req.query.keyword
        ? {
            name: {
                $regex: req.query.keyword,
                $options: 'i',
            },
        }
        : {};

    let query = { ...keyword };

    // Gender Filter logic for "Both"
    if (req.query.category && req.query.category !== 'All') {
        if (req.query.category === 'Men') {
            query.category = { $in: ['Men', 'Both'] };
        } else if (req.query.category === 'Women') {
            query.category = { $in: ['Women', 'Both'] };
        } else {
            query.category = req.query.category;
        }
    }

    // Role-based filtering
    if (req.user) {
        if (req.user.role === 'seller') {
            query.seller = req.user._id;
        } else if (req.user.role === 'admin') {
            // Admin sees everything
        } else {
            query.isVisible = true;
        }
    } else {
        query.isVisible = true;
    }

    // Sorting
    let sort = { createdAt: -1 };
    if (req.query.sort) {
        switch (req.query.sort) {
            case 'price_asc': sort = { price: 1 }; break;
            case 'price_desc': sort = { price: -1 }; break;
            case 'oldest': sort = { createdAt: 1 }; break;
            case 'newest': sort = { createdAt: -1 }; break;
            default: sort = { createdAt: -1 };
        }
    }

    const count = await Product.countDocuments(query);
    const products = await Product.find(query)
        .populate('seller', 'name email')
        .limit(pageSize)
        .skip(pageSize * (page - 1))
        .sort(sort);

    // Attach order count
    const productsWithCounts = await Promise.all(products.map(async (p) => {
        let orderCount = 0;
        let canSeeCount = false;

        if (req.user) {
            if (req.user.role === 'admin') {
                canSeeCount = true;
            } else if (req.user.role === 'seller' && p.seller && (p.seller._id.toString() === req.user._id.toString() || p.seller.toString() === req.user._id.toString())) {
                canSeeCount = true;
            }
        }

        if (canSeeCount) {
            orderCount = await Order.countDocuments({
                "orderItems.product": p._id,
                status: { $nin: ['Cancelled', 'Failed'] } // Exclude cancelled/failed orders
            });
        }

        return { ...p.toObject(), orderCount: canSeeCount ? orderCount : undefined };
    }));

    res.json({
        products: productsWithCounts,
        page,
        pages: Math.ceil(count / pageSize),
        totalProducts: count
    });
};

// @desc Fetch single product
// @route GET /api/products/:id
const getProductById = async (req, res) => {
    const product = await Product.findById(req.params.id).populate('seller', 'name email');
    if (product) {
        const comments = await Comment.find({ product: product._id }).populate('user', 'name');

        // Log activity if user is logged in
        if (req.user) {
            await Activity.create({
                userId: req.user._id,
                role: req.user.role,
                type: 'product_view',
                targetType: 'Product',
                targetId: product._id,
                description: `Viewed product: ${product.name}`,
                details: { name: product.name, sellerId: product.seller?._id }
            });
        }

        let orderCount = 0;
        let canSeeCount = false;

        if (req.user) {
            if (req.user.role === 'admin') {
                canSeeCount = true;
            } else if (req.user.role === 'seller' && product.seller && (product.seller._id.toString() === req.user._id.toString() || product.seller.toString() === req.user._id.toString())) {
                canSeeCount = true;
            }
        }

        if (canSeeCount) {
            orderCount = await Order.countDocuments({
                "orderItems.product": product._id,
                status: { $nin: ['Cancelled', 'Failed'] }
            });
        }

        res.json({ ...product.toObject(), reviews: comments, orderCount: canSeeCount ? orderCount : undefined });
    } else {
        res.status(404).json({ message: 'Product not found' });
    }
};

const notificationService = require('../services/notificationService');

// @desc Create a product (Seller/Admin)
// @route POST /api/products
const createProduct = async (req, res) => {
    const { name, price, description, category, type, countInStock, images } = req.body;

    const product = new Product({
        name,
        price,
        description,
        category, // Gender: Men, Women, Both
        type,     // Style: Round Neck, V Neck, Polo
        stock: countInStock,
        seller: req.user._id,
        images: images || [],
        isVisible: true
    });

    const createdProduct = await product.save();

    // Log Activity (Seller)
    await Activity.create({
        userId: req.user._id,
        role: req.user.role,
        type: 'product_created',
        targetType: 'Product',
        targetId: createdProduct._id,
        description: `Published a new product: ${createdProduct.name}`,
        details: {
            name: createdProduct.name,
            category: createdProduct.category,
            price: createdProduct.price,
            type: createdProduct.type
        }
    });

    // Send Notification (Async)
    notificationService.sendToAll(
        'New Arrival 👕',
        `Check out our new ${name} just for you!`,
        'product',
        { productId: createdProduct._id.toString() },
        createdProduct.images.length > 0 ? createdProduct.images[0] : null
    );

    res.status(201).json(createdProduct);
};

// @desc Update a product
// @route PUT /api/products/:id
const updateProduct = async (req, res) => {
    const { name, price, description, category, type, stock, isVisible, images } = req.body;
    const product = await Product.findById(req.params.id);

    if (product) {
        if (product.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            res.status(401).json({ message: 'Not authorized to update this product' });
            return;
        }

        const oldValues = {
            name: product.name,
            price: product.price,
            stock: product.stock,
            isVisible: product.isVisible,
            category: product.category,
            type: product.type
        };

        product.name = name || product.name;
        const oldPrice = product.price;
        product.price = price !== undefined ? price : product.price;
        product.description = description || product.description;
        product.category = category || product.category;
        product.type = type || product.type;
        product.stock = stock !== undefined ? stock : product.stock;
        product.isVisible = isVisible !== undefined ? isVisible : product.isVisible;
        if (images) product.images = images;

        const updatedProduct = await product.save();

        // Calculate changed fields for log
        const changes = {};
        if (oldValues.name !== product.name) changes.name = { old: oldValues.name, new: product.name };
        if (oldValues.price !== product.price) changes.price = { old: oldValues.price, new: product.price };
        if (oldValues.stock !== product.stock) changes.stock = { old: oldValues.stock, new: product.stock };
        if (oldValues.isVisible !== product.isVisible) changes.visibility = { old: oldValues.isVisible, new: product.isVisible };
        if (oldValues.category !== product.category) changes.gender = { old: oldValues.category, new: product.category };
        if (oldValues.type !== product.type) changes.style = { old: oldValues.type, new: product.type };

        // Log Activity
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'product_updated',
            targetType: 'Product',
            targetId: product._id,
            description: `Updated product attributes for: ${product.name}`,
            details: {
                name: product.name,
                changes: Object.keys(changes).length > 0 ? changes : 'No semantic changes'
            }
        });

        // NOTIFICATION: Price Drop Logic
        if (price !== undefined && price < oldPrice) {
            notificationService.sendToAll(
                'Price Drop Alert! 🔥',
                `${product.name} is now available for just ₹${price}!`,
                'promotion',
                { productId: product._id.toString() },
                product.images.length > 0 ? product.images[0] : null
            );
        }

        res.json(updatedProduct);
    } else {
        res.status(404).json({ message: 'Product not found' });
    }
};

// @desc Create new review (Strict Rule)
// @route POST /api/products/:id/reviews
const createProductReview = async (req, res) => {
    const { rating, content } = req.body;
    const product = await Product.findById(req.params.id);

    if (product) {
        // STRICT RULE: Check if user ordered this product and it is delivered
        const hasOrdered = await Order.findOne({
            user: req.user._id,
            "orderItems.product": req.params.id,
            status: 'Delivered'
        });

        if (!hasOrdered) {
            return res.status(400).json({ message: 'You can only review products you have purchased and received.' });
        }

        const alreadyReviewed = await Comment.findOne({
            user: req.user._id,
            product: req.params.id
        });

        if (alreadyReviewed) {
            return res.status(400).json({ message: 'Product already reviewed' });
        }

        const review = await Comment.create({
            user: req.user._id,
            product: req.params.id,
            name: req.user.name,
            rating: Number(rating),
            content,
        });

        // Log Activity
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'comment_added',
            targetType: 'Comment',
            targetId: review._id,
            description: `Added a ${rating}-star review for: ${product.name}`,
            details: { productId: product._id, rating, content: content.substring(0, 50) }
        });

        res.status(201).json({ message: 'Review added' });
    } else {
        res.status(404).json({ message: 'Product not found' });
    }
};

// @desc Toggle Like/Wishlist
// @route POST /api/products/:id/like
const toggleLikeProduct = async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (product) {
        const index = product.likes.indexOf(req.user._id);
        if (index === -1) {
            product.likes.push(req.user._id);
        } else {
            product.likes.splice(index, 1);
        }
        await product.save();
        res.json(product.likes);
    } else {
        res.status(404).json({ message: 'Product not found' });
    }
}

// @desc Delete a product
// @route DELETE /api/products/:id
const deleteProduct = async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (product) {
        if (product.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            res.status(401).json({ message: 'Not authorized to delete this product' });
            return;
        }

        // Log Activity before deletion
        await Activity.create({
            userId: req.user._id,
            role: req.user.role,
            type: 'product_deleted',
            targetType: 'Product',
            targetId: product._id,
            description: `Permanently removed product: ${product.name}`,
            details: { name: product.name, category: product.category, price: product.price }
        });

        await product.deleteOne();
        res.json({ message: 'Product removed' });
    } else {
        res.status(404).json({ message: 'Product not found' });
    }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, deleteProduct, createProductReview, toggleLikeProduct };
