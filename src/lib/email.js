const nodemailer = require('nodemailer');

const getFrontendUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return 'https://www.serpsupport.com';
  }
  return process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim().replace(/\/$/, '') : 'http://localhost:3000';
};

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendWelcomeEmail = async (email, name) => {
  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Welcome to SerpSupport!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background-color: #f9f9f9; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://www.serpsupport.com/icon.png" alt="SerpSupport Logo" style="width: 80px; height: auto;" />
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h1 style="color: #00b899; font-size: 24px; margin-top: 0; text-align: center;">Welcome, ${name}! 🎉</h1>
            <p style="font-size: 16px; line-height: 1.6;">Your account has been successfully created.</p>
            <p style="font-size: 16px; line-height: 1.6;">We're thrilled to have you join us at SerpSupport. If you have any questions or need help getting started, simply reply to this email.</p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="${getFrontendUrl()}" style="display: inline-block; background-color: #00b899; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 16px;">Go to Dashboard</a>
            </div>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} SerpSupport. All rights reserved.</p>
          </div>
        </div>
      `
    });
    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending welcome email:", error);
  }
};

const sendNewMatchEmail = async (email, name, isGiver, otherDomain) => {
  try {
    const roleText = isGiver ? `give a backlink to ${otherDomain}` : `receive a backlink from ${otherDomain}`;
    
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "You have a new connection match! 🎉",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background-color: #f9f9f9; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://www.serpsupport.com/icon.png" alt="SerpSupport Logo" style="width: 80px; height: auto;" />
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h1 style="color: #00b899; font-size: 24px; margin-top: 0; text-align: center;">New Connection Match! 🔗</h1>
            <p style="font-size: 16px; line-height: 1.6;">Hi ${name},</p>
            <p style="font-size: 16px; line-height: 1.6;">We found a new match for you! You have been selected to <strong>${roleText}</strong>.</p>
            <p style="font-size: 16px; line-height: 1.6;">Please log in to your dashboard to review this connection and start the exchange process.</p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="${getFrontendUrl()}" style="display: inline-block; background-color: #00b899; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 16px;">View Connection</a>
            </div>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} SerpSupport. All rights reserved.</p>
          </div>
        </div>
      `
    });
    console.log("Match email sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending match email:", error);
  }
};

const sendConnectionAcceptedEmail = async (email, name, acceptedDomain) => {
  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your connection request was accepted! 🎉",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background-color: #f9f9f9; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://www.serpsupport.com/icon.png" alt="SerpSupport Logo" style="width: 80px; height: auto;" />
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h1 style="color: #00b899; font-size: 24px; margin-top: 0; text-align: center;">Connection Accepted! ✅</h1>
            <p style="font-size: 16px; line-height: 1.6;">Hi ${name},</p>
            <p style="font-size: 16px; line-height: 1.6;">Great news! <strong>${acceptedDomain}</strong> has accepted your connection request.</p>
            <p style="font-size: 16px; line-height: 1.6;">You can now start messaging them to organize your backlink exchange.</p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="${getFrontendUrl()}/inbox" style="display: inline-block; background-color: #00b899; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 16px;">Go to Inbox</a>
            </div>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} SerpSupport. All rights reserved.</p>
          </div>
        </div>
      `
    });
    console.log("Connection accepted email sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending connection accepted email:", error);
  }
};

module.exports = {
  sendWelcomeEmail,
  sendNewMatchEmail,
  sendConnectionAcceptedEmail,
};
