const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // 1. Generic SMTP Config using new environment variables
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.FROM_EMAIL;

    if (!host || !user || !pass || !from) {
        console.error('❌ Missing SMTP Configuration in Environment Variables');
        throw new Error('Email service misconfigured');
    }

    // 2. Create Transporter
    const transporter = nodemailer.createTransport({
        host: host,
        port: port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user: user,
            pass: pass
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    // 3. Verify Connection
    try {
        await transporter.verify();
        console.log(`✅ SMTP Connection Verified (${host}:${port})`);
    } catch (error) {
        console.error('❌ SMTP Connection Failed:', error);
        throw new Error('Email service unavailable');
    }

    // 4. Send Email
    const mailOptions = {
        from: from, // sender address
        to: options.email, // list of receivers
        subject: options.subject, // Subject line
        html: options.message // html body
    };

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
