const express = require('express');
const router = express.Router();
const { authUser, registerUser, getUserProfile, updateUserProfile, getUserById, addAddress, getUsers, deleteUser, updateUser, logoutUser, updateFcmToken } = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

router.post('/', registerUser);
router.post('/login', authUser);
router.post('/logout', protect, logoutUser);
router.put('/push-token', protect, updateFcmToken);
router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);
router.route('/address').post(protect, addAddress);
router.route('/').get(protect, admin, getUsers);
router.route('/:id')
    .get(protect, admin, getUserById)
    .delete(protect, admin, deleteUser)
    .put(protect, admin, updateUser);

module.exports = router;
