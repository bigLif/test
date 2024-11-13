import nodemailer from 'nodemailer';

// Create reusable transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
     secure: true, // Utilisez `true` seulement pour le port 465
     requireTLS: true, // Tente de mettre à niveau la connexion
      connectionTimeout: 10000, // Temps en millisecondes (10 secondes)
  socketTimeout: 10000, // Temps en millisecondes (10 secondes)
  });
};

export const sendEmail = async (to, subject, text) => {
  try {
    const transporter = createTransporter();
    
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html: text.replace(/\n/g, '<br>')
    });

    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    // Log the error but don't throw it - this prevents email errors from breaking the app flow
    console.error('Error sending email:', error);
    return false;
  }
};
