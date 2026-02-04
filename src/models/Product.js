const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rating: { type: Number, required: true },
    comment: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderItemId: { type: mongoose.Schema.Types.ObjectId, required: false }, // Optional for backward compatibility
}, { timestamps: true });

const productSchema = new mongoose.Schema({
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    discountPrice: { type: Number, default: null },
    originalPrice: { type: Number },
    images: [{ type: String }],
    category: { type: String, required: true },
    type: { type: String, default: 'T-Shirt' },
    stock: { type: Number, required: true, default: 0 },
    isVisible: { type: Boolean, default: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reviews: [reviewSchema],
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
