const SystemSettings = require('../models/SystemSettings');

// @desc    Get mobile access setting
// @route   GET /api/settings/mobile-access
// @access  Public (needed for access check)
const getMobileAccessSetting = async (req, res) => {
    try {
        const mobileAccessEnabled = await SystemSettings.getSetting('mobileAccessEnabled', false);
        res.json({ mobileAccessEnabled });
    } catch (error) {
        console.error('Error fetching mobile access setting:', error);
        res.status(500).json({ message: 'Failed to fetch mobile access setting' });
    }
};

// @desc    Update mobile access setting
// @route   PUT /api/settings/mobile-access
// @access  Admin only
const updateMobileAccessSetting = async (req, res) => {
    try {
        const { mobileAccessEnabled } = req.body;

        if (typeof mobileAccessEnabled !== 'boolean') {
            return res.status(400).json({ message: 'mobileAccessEnabled must be a boolean' });
        }

        await SystemSettings.setSetting(
            'mobileAccessEnabled',
            mobileAccessEnabled,
            req.user._id,
            'Global mobile access control for admin dashboard'
        );

        res.json({
            success: true,
            mobileAccessEnabled,
            message: `Mobile access ${mobileAccessEnabled ? 'enabled' : 'disabled'} successfully`
        });
    } catch (error) {
        console.error('Error updating mobile access setting:', error);
        res.status(500).json({ message: 'Failed to update mobile access setting' });
    }
};

// @desc    Get all system settings
// @route   GET /api/settings
// @access  Admin only
const getAllSettings = async (req, res) => {
    try {
        const settings = await SystemSettings.find().populate('updatedBy', 'name email');
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
};

module.exports = {
    getMobileAccessSetting,
    updateMobileAccessSetting,
    getAllSettings
};
