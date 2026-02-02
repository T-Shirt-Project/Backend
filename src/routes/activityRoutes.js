const express = require('express');
const router = express.Router();
const { logActivity, getMyActivity, getAllActivities, getUserActivityAdmin } = require('../controllers/activityController');
const { protect, admin, seller } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, logActivity)
    .get(protect, seller, getAllActivities);

router.get('/me', protect, getMyActivity);
router.get('/user/:id', protect, admin, getUserActivityAdmin);

module.exports = router;
