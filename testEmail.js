require('dotenv').config();
const sendEmail = require('./src/utils/sendEmail');

const testEmail = async () => {
    console.log("\n==========================================");
    console.log("📧  EMAIL CONFIGURATION TEST");
    console.log("==========================================");

    // masked password for display
    const pass = process.env.SMTP_PASSWORD ?
        `${process.env.SMTP_PASSWORD.substring(0, 5)}...` : "NOT SET";

    console.log(`HOST:     ${process.env.SMTP_HOST}`);
    console.log(`PORT:     ${process.env.SMTP_PORT}`);
    console.log(`USER:     ${process.env.SMTP_EMAIL}`);
    console.log(`PASS:     ${pass}`);
    console.log(`FROM:     ${process.env.FROM_EMAIL}`);
    console.log("------------------------------------------");

    if (!process.env.SMTP_PASSWORD || process.env.SMTP_PASSWORD.includes("REPLACE")) {
        console.error("\n❌ ERROR: SMTP_PASSWORD is not set in .env file.");
        console.error("👉 Please update d:\\T-Shirt\\backend\\.env with your Brevo SMTP Key.");
        return;
    }

    console.log("Attempting to send test email...");

    try {
        await sendEmail({
            email: process.env.SMTP_EMAIL, // Send to self
            subject: 'Test Email Success ✅',
            message: 'Your email configuration is working perfectly!',
            html: '<h1 style="color:green">It Works!</h1><p>Your backend is correctly configured to send emails.</p>'
        });
        console.log("\n✅ SUCCESS: Email sent successfully!");
        console.log("👉 Check your inbox at: " + process.env.SMTP_EMAIL);
    } catch (error) {
        console.error("\n❌ FAILED: Could not send email.");

        if (error.responseCode === 535) {
            console.error("\n🔑 AUTHENTICATION ERROR (535)");
            console.error("The SMTP Password or Email is incorrect.");
            console.error("1. Go to Brevo (Sendinblue) -> Settings -> SMTP & API.");
            console.error("2. Generate a NEW 'SMTP Key'.");
            console.error("3. Update SMTP_PASSWORD in backend/.env");
        } else {
            console.error("Error details:", error.message);
        }
    }
    console.log("==========================================\n");
};

testEmail();
