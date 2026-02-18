const nodemailer = require('nodemailer');
const sendEmail = async (options) => {
    const port = parseInt(process.env.ZOHO_SMTP_PORT) || 587;

    // 1. Create Transporter
    const transporter = nodemailer.createTransport({
        host: process.env.ZOHO_SMTP_HOST,
        port: port,
        secure: port === 465, // Port 465 requires SSL/TLS
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
    console.log(`📧 Sending email to ${options.email} via ${process.env.ZOHO_SMTP_HOST}:${port}`);
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${options.email}`);
};

module.exports = sendEmail;
