const crypto = require('crypto');

// Derive a 32-byte key from the JWT_SECRET (or explicit ENCRYPTION_KEY)
const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-secret-key-do-not-use-in-prod';
const key = crypto.createHash('sha256').update(String(secret)).digest();

const IV_LENGTH = 16; // AES block size

const encrypt = (text) => {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error('Encryption Error:', error);
        throw new Error('Encryption failed');
    }
};

const decrypt = (text) => {
    if (!text) return null;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Decryption Error:', error);
        throw new Error('Decryption failed');
    }
};

module.exports = {
    encrypt,
    decrypt
};
