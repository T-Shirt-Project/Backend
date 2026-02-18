const nodemailer = require('nodemailer');

// 1. Create generic transporter (Singleton)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false // Helps with some self-signed certs in dev
    },
    pool: true, // Use pooled connections for better performance
    maxConnections: 5,
    maxMessages: 100
});

// 2. Verify connection on startup (or first load)
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ SMTP Connection Error:', error);
    } else {
        console.log('✅ SMTP Service Ready');
    }
});

const sendEmail = async (options) => {
    // 3. Define Email Options
    const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: options.email,
        subject: options.subject,
        html: options.message
    };

    // 4. Send Email
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('❌ Send Mail Error:', error);
        throw new Error('Failed to send email');
    }
};

module.exports = sendEmail;
