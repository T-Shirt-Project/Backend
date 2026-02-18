const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // 1. Config: Prefer Port 587 (STARTTLS) for better cloud compatibility
    const port = parseInt(process.env.ZOHO_SMTP_PORT) || 587;
    const isSecure = port === 465; // True for 465, False for 587

    console.log(`🔌 Connecting to SMTP: ${process.env.ZOHO_SMTP_HOST}:${port} (Secure: ${isSecure})`);

    // 2. Create Transporter with robust settings
    const transporter = nodemailer.createTransport({
        host: process.env.ZOHO_SMTP_HOST,
        port: port,
        secure: isSecure,
        auth: {
            user: process.env.ZOHO_SMTP_USER,
            pass: process.env.ZOHO_SMTP_PASS
        },
        tls: {
            ciphers: 'SSLv3', // Help with some older SMTP servers
            rejectUnauthorized: false // Allow self-signed certs if needed
        },
        connectionTimeout: 10000, // 10 seconds timeout
        greetingTimeout: 5000,    // 5 seconds for greeting
        debug: true,              // Show debug output
        logger: true              // Log to console
    });

    // 3. Define Email Options
    const mailOptions = {
        from: process.env.ZOHO_FROM_EMAIL,
        to: options.email,
        subject: options.subject,
        html: options.message
    };

    // 4. Send Email with verification
    try {
        await transporter.verify();
        console.log('✅ SMTP Connection Verified');

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent: ${info.messageId}`);
    } catch (error) {
        console.error('❌ SMTP Error:', error);
        throw error; // Re-throw to be handled by controller
    }
};

module.exports = sendEmail;
