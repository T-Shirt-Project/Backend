const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.BREVO_SMTP_USER || process.env.SMTP_EMAIL,
        pass: process.env.BREVO_SMTP_PASS || process.env.SMTP_PASSWORD
    }
});

const sendOTP = async (email, otp) => {
    try {
        const mailOptions = {
            from: process.env.BREVO_FROM_EMAIL || process.env.FROM_EMAIL || '"Support" <no-reply@example.com>',
            to: email,
            subject: 'Verify Your Email Address',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #333;">Welcome!</h2>
                    </div>
                    <div style="text-align: center;">
                        <p style="font-size: 16px; color: #555;">Please use the following OTP to verify your email address:</p>
                        <h1 style="font-size: 32px; letter-spacing: 5px; color: #4CAF50; margin: 20px 0;">${otp}</h1>
                        <p style="font-size: 14px; color: #888;">This code will expire in 10 minutes.</p>
                    </div>
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
                        <p style="font-size: 12px; color: #999;">If you didn't request this, please ignore this email.</p>
                    </div>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = { sendOTP };
