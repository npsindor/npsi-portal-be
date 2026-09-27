import nodemailer from "nodemailer";

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

export const isMailConfigured = () => Boolean(transporter);

export const sendMail = async ({ to, subject, html, text }) => {
  if (!transporter) {
    console.warn(`[mailer] SMTP not configured — skipping email to ${to}: ${subject}`);
    return { skipped: true };
  }
  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
  });
};
