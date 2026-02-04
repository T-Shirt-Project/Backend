const express = require('express');
const router = express.Router();
const { authUser, registerUser, getUserProfile, updateUserProfile, getUserById, addAddress, getUsers, deleteUser, updateUser, logoutUser, verifyEmail, requestOtp, verifyOtp, updateFcmToken } = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

router.post('/', registerUser);
router.post('/login', authUser);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.get('/verifyemail/:token', verifyEmail);
router.post('/logout', protect, logoutUser);
router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);
router.route('/address').post(protect, addAddress);
router.put('/push-token', protect, updateFcmToken);
router.route('/').get(protect, admin, getUsers);
router.route('/:id')
    .get(protect, admin, getUserById)
    .delete(protect, admin, deleteUser)
    .put(protect, admin, updateUser);

module.exports = router;
