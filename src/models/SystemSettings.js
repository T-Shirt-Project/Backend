const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    settingKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    settingValue: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Static method to get a setting value
systemSettingsSchema.statics.getSetting = async function (key, defaultValue = null) {
    const setting = await this.findOne({ settingKey: key });
    return setting ? setting.settingValue : defaultValue;
};

// Static method to set a setting value
systemSettingsSchema.statics.setSetting = async function (key, value, userId = null, description = '') {
    const setting = await this.findOneAndUpdate(
        { settingKey: key },
        {
            settingValue: value,
            updatedBy: userId,
            description: description
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );
    return setting;
};

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

module.exports = SystemSettings;
