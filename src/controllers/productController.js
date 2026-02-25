const Product = require('../models/Product');
const Order = require('../models/Order');
const Comment = require('../models/Comment');
const Activity = require('../models/Activity');
const notificationService = require('../services/notificationService');


// @desc Fetch all products
// @route GET /api/products
const getProducts = async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;

    // Search keyword
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

    // Style (Silhouette) Filter logic
    if (req.query.style && req.query.style !== 'All') {
        query.type = req.query.style;
    }

    // Role-based visibility
    // ADMIN: Sees all products
    // SELLER: Sees only their products (dashboard view) OR public products (browsing) ?? 
    // Usually sellers browse as users, but have a dashboard. 
    // The previous logic forced seller role to ONLY see own products globally, which might be wrong for "Browsing"
    // But assuming this endpoint is mixed use:

    // IF explicitly asking for my products (e.g. Dashboard)
    // Or if standard user visibility:

    if (req.user && req.user.role === 'seller' && req.query.mode === 'dashboard') {
        query.seller = req.user._id;
    } else if (req.user && req.user.role === 'admin') {
        // Admin sees everything, no extra filter
    } else {
        // Public / Normal User: Only see Visible products
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
        let canReview = false;

        if (req.user) {
            if (req.user.role === 'admin') {
                canSeeCount = true;
            } else if (req.user.role === 'seller' && product.seller && (product.seller._id.toString() === req.user._id.toString() || product.seller.toString() === req.user._id.toString())) {
                canSeeCount = true;
            }

            // Check if user can review (Has MORE delivered items than reviews)
            const deliveredOrders = await Order.find({
                user: req.user._id,
                "orderItems.product": product._id,
                $or: [
                    { "orderItems": { $elemMatch: { product: product._id, status: 'Delivered' } } },
                    { status: 'Delivered' }
                ]
            });

            let eligibleItemsCount = 0;
            deliveredOrders.forEach(order => {
                order.orderItems.forEach(item => {
                    if (item.product.toString() === product._id.toString()) {
                        if (item.status === 'Delivered' || (order.status === 'Delivered' && (!item.status || item.status === 'Placed'))) {
                            eligibleItemsCount++;
                        }
                    }
                });
            });

            // Count existing reviews
            const existingReviewsCount = await Comment.countDocuments({
                user: req.user._id,
                product: product._id
            });

            if (eligibleItemsCount > existingReviewsCount) {
                canReview = true;
            }
        }

        if (canSeeCount) {
            orderCount = await Order.countDocuments({
                "orderItems.product": product._id,
                status: { $nin: ['Cancelled', 'Failed'] }
            });
        }

        res.json({
            ...product.toObject(),
            reviews: comments,
            orderCount: canSeeCount ? orderCount : undefined,
            canReview
        });
    } else {
        res.status(404).json({ message: 'Product not found' });
    }
};

// @desc Create a product (Seller/Admin)
// @route POST /api/products
const createProduct = async (req, res) => {
    try {
        const { name, price, description, images, category, type, stock, discountPrice } = req.body;

        const product = new Product({
            name,
            price,
            description,
            images: images ? (Array.isArray(images) ? images : [images]) : [],
            category,
            type,
            stock,
            discountPrice,
            seller: req.user._id,
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
            'PRODUCT',
            { productId: createdProduct._id.toString() },
            createdProduct.images.length > 0 ? createdProduct.images[0] : null
        );


        res.status(201).json(createdProduct);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc Update a product
// @route PUT /api/products/:id
const updateProduct = async (req, res) => {
    try {
        const { name, price, description, category, type, stock, isVisible, images, discountPrice } = req.body;
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

            const oldPrice = product.price;

            // Prepare update object
            const updateFields = {
                name: name || product.name,
                price: price !== undefined ? price : product.price,
                description: description || product.description,
                category: category || product.category,
                type: type || product.type,
                stock: stock !== undefined ? stock : product.stock,
                isVisible: isVisible !== undefined ? isVisible : product.isVisible
            };
            if (images) updateFields.images = images;

            let updatedProduct;

            const query = { _id: req.params.id };
            if (req.user.role !== 'admin') {
                query.seller = req.user._id;
            }

            // Handle Discount logic (Set to null/0 removes it)
            if (discountPrice === null || discountPrice === 0 || discountPrice === "") {
                updatedProduct = await Product.findOneAndUpdate(
                    query,
                    { $set: updateFields, $unset: { discountPrice: 1 } },
                    { new: true, runValidators: true }
                );
            } else if (discountPrice !== undefined) {
                // Validation
                if (discountPrice < 0 || discountPrice >= updateFields.price) {
                    return res.status(400).json({ message: 'Invalid discount value. Ensure it is positive and strictly less than the original price.' });
                }
                updateFields.discountPrice = discountPrice;
                updatedProduct = await Product.findOneAndUpdate(
                    query,
                    { $set: updateFields },
                    { new: true, runValidators: true }
                );
            } else {
                updatedProduct = await Product.findOneAndUpdate(
                    query,
                    { $set: updateFields },
                    { new: true, runValidators: true }
                );
            }

            // Calculate changed fields for log
            const changes = {};
            if (oldValues.name !== updatedProduct.name) changes.name = { old: oldValues.name, new: updatedProduct.name };
            if (oldValues.price !== updatedProduct.price) changes.price = { old: oldValues.price, new: updatedProduct.price };
            if (oldValues.stock !== updatedProduct.stock) changes.stock = { old: oldValues.stock, new: updatedProduct.stock };
            if (oldValues.isVisible !== updatedProduct.isVisible) changes.visibility = { old: oldValues.isVisible, new: updatedProduct.isVisible };
            if (oldValues.category !== updatedProduct.category) changes.gender = { old: oldValues.category, new: updatedProduct.category };
            if (oldValues.type !== updatedProduct.type) changes.style = { old: oldValues.type, new: updatedProduct.type };

            // Log Activity
            await Activity.create({
                userId: req.user._id,
                role: req.user.role,
                type: 'product_updated',
                targetType: 'Product',
                targetId: updatedProduct._id,
                description: `Updated product attributes for: ${updatedProduct.name}`,
                details: {
                    name: updatedProduct.name,
                    changes: Object.keys(changes).length > 0 ? changes : 'No semantic changes'
                }
            });

            // NOTIFICATION: Price Drop Logic
            if (price !== undefined && price < oldPrice) {
                notificationService.sendToAll(
                    'Price Drop Alert! 🔥',
                    `${updatedProduct.name} is now available for just ₹${price}!`,
                    'OFFER',
                    { productId: updatedProduct._id.toString() },
                    updatedProduct.images.length > 0 ? updatedProduct.images[0] : null
                );
            }


            res.json(updatedProduct);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc Create new review (Strict Rule)
// @route POST /api/products/:id/reviews
const createProductReview = async (req, res) => {
    const { rating, content } = req.body;
    const product = await Product.findById(req.params.id);

    if (product) {
        // STRICT RULE: Check if user ordered this product and it is delivered
        // 1. Find all orders containing this product
        const orders = await Order.find({
            user: req.user._id,
            "orderItems.product": req.params.id,
            $or: [
                { "orderItems": { $elemMatch: { product: req.params.id, status: 'Delivered' } } },
                { status: 'Delivered' } // Backward compat
            ]
        });

        if (!orders || orders.length === 0) {
            return res.status(400).json({ message: 'You can only review products you have purchased and received (Delivered status).' });
        }

        // 2. Collect all delivered item IDs for this product
        let eligibleItems = [];
        orders.forEach(order => {
            order.orderItems.forEach(item => {
                if (item.product.toString() === req.params.id) {
                    // Check status: Item explicit Delivered OR Order explicit Delivered (and item status missing/undefined)
                    if (item.status === 'Delivered' || (order.status === 'Delivered' && (!item.status || item.status === 'Placed'))) {
                        eligibleItems.push(item);
                    }
                }
            });
        });

        if (eligibleItems.length === 0) {
            return res.status(400).json({ message: 'Item is not marked as Delivered yet.' });
        }

        // 3. Check existing reviews
        const existingReviews = await Comment.find({
            user: req.user._id,
            product: req.params.id
        });

        const reviewedItemIds = existingReviews
            .map(r => r.orderItemId ? r.orderItemId.toString() : null)
            .filter(id => id !== null);

        // 4. Find the first eligible item that is NOT reviewed
        const targetItem = eligibleItems.find(item => !reviewedItemIds.includes(item._id.toString()));

        if (!targetItem) {
            // If we have reviews but no eligible items left
            return res.status(400).json({ message: 'You have already reviewed this product.' });
        }

        // Proceed to create review linked to targetItem._id
        const review = await Comment.create({
            user: req.user._id,
            product: req.params.id,
            rating: Number(rating),
            content,
            orderItemId: targetItem._id
        });

        // Update product rating and numReviews
        const reviews = await Comment.find({ product: req.params.id });
        product.numReviews = reviews.length;
        product.rating = reviews.reduce((acc, item) => item.rating + acc, 0) / reviews.length;

        product.reviews.push({
            name: req.user.name,
            rating: Number(rating),
            comment: content,
            user: req.user._id,
            orderItemId: targetItem._id
        });
        await product.save();

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

// @desc Delete review (Admin)
// @route DELETE /api/products/:id/reviews/:reviewId
const deleteProductReview = async (req, res) => {
    const { id, reviewId } = req.params;

    // Find Product and Review
    const product = await Product.findById(id);
    const review = await Comment.findById(reviewId);

    if (!product || !review) {
        return res.status(404).json({ message: 'Product or Review not found' });
    }

    await review.deleteOne();

    // Remove from product.reviews array (backward compat)
    if (product.reviews) {
        product.reviews = product.reviews.filter(r =>
            (r._id && r._id.toString() !== reviewId) &&
            (r.user && r.user.toString() !== review.user.toString())
        );
    }

    // Recalculate stats
    const reviews = await Comment.find({ product: id });
    product.numReviews = reviews.length;
    product.rating = reviews.length > 0
        ? reviews.reduce((acc, item) => item.rating + acc, 0) / reviews.length
        : 0;

    await product.save();

    res.json({ message: 'Review removed' });
};

// @desc Update review (Admin)
// @route PUT /api/products/:id/reviews/:reviewId
const updateProductReview = async (req, res) => {
    const { id, reviewId } = req.params;
    const { content } = req.body; // Admin usually just moderates text, maybe rating logic is risky to touch

    const review = await Comment.findById(reviewId);
    if (!review) {
        return res.status(404).json({ message: 'Review not found' });
    }

    review.comment = content || review.comment;
    await review.save();

    // Sync with product embedded array
    const product = await Product.findById(id);
    if (product && product.reviews) {
        const embeddedReview = product.reviews.find(r => r._id && r._id.toString() === reviewId);
        if (embeddedReview) {
            embeddedReview.comment = content || embeddedReview.comment;
        } else {
            // Fallback match user
            const byUser = product.reviews.find(r => r.user && r.user.toString() === review.user.toString());
            if (byUser) byUser.comment = content || byUser.comment;
        }
        await product.save();
    }

    res.json(review);
};

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    createProductReview,
    toggleLikeProduct,
    deleteProductReview,
    updateProductReview
};
