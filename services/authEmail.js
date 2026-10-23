const nodemailer = require('nodemailer');

function getTransportConfig() {
  const from = process.env.MAIL_FROM;
  if (!from) return null;

  if (process.env.SMTP_URL) {
    return { from, transport: nodemailer.createTransport(process.env.SMTP_URL) };
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user, pass }
    })
  };
}

function isEmailDeliveryConfigured() {
  return Boolean(getTransportConfig());
}

async function sendVerificationCode(email, code, purpose) {
  const config = getTransportConfig();
  if (!config) throw new Error('Email delivery is not configured.');

  const registration = purpose === 'registration';
  await config.transport.sendMail({
    from: config.from,
    to: email,
    subject: registration ? 'Verify your DIGITAL Axis account' : 'Reset your DIGITAL Axis password',
    text: `Your DIGITAL Axis ${registration ? 'verification' : 'password reset'} code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`
  });
}

module.exports = { isEmailDeliveryConfigured, sendVerificationCode };