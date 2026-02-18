const nodemailer = require('nodemailer');
const sendEmail = async (options) => {
    // 1. Create Transporter
    const transporter = nodemailer.createTransport({
        host: process.env.ZOHO_SMTP_HOST,
        port: process.env.ZOHO_SMTP_PORT,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.ZOHO_SMTP_USER,
            pass: process.env.ZOHO_SMTP_PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    });
    // 2. Define Email Options
    const mailOptions = {
        from: process.env.ZOHO_FROM_EMAIL,
        to: options.email,
        subject: options.subject,
        html: options.message
    };
    // 3. Send Email
    await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
