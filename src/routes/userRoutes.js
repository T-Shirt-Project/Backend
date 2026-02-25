const express = require('express');
const router = express.Router();
const { authUser, registerUser, getUserProfile, updateUserProfile, getUserById, addAddress, getUsers, deleteUser, updateUser, logoutUser, updateFcmToken, updateUserStatus, updateUserRole } = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per `window` (here, per 15 minutes)
    message: { message: 'Too many login attempts from this IP, please try again after 15 minutes' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.post('/', registerUser);
router.post('/login', loginLimiter, authUser);
router.post('/logout', protect, logoutUser);
router.put('/push-token', protect, updateFcmToken);
router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);
router.route('/address').post(protect, addAddress);
router.route('/').get(protect, admin, getUsers);
router.route('/:id')
    .get(protect, admin, getUserById)
    .delete(protect, admin, deleteUser)
    .put(protect, admin, updateUser);

// Dedicated status update endpoint
router.patch('/:id/status', protect, admin, updateUserStatus);
router.patch('/:id/role', protect, admin, updateUserRole);

module.exports = router;
