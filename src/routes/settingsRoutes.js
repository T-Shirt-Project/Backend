const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
    getMobileAccessSetting,
    updateMobileAccessSetting,
    getAllSettings
} = require('../controllers/settingsController');

// Public route - needed for mobile access check
router.get('/mobile-access', getMobileAccessSetting);

// Admin-only routes
router.put('/mobile-access', protect, admin, updateMobileAccessSetting);
router.get('/', protect, admin, getAllSettings);

module.exports = router;
