/**
 * Mailer (nodemailer). Talks to Mailpit in dev, real SMTP in prod.
 * Verification / digest emails are Phase 1 / Phase 6; this is the transport.
 */
import nodemailer from 'nodemailer';
import { config } from '../config.js';

export const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: false, // Mailpit + STARTTLS later
  auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  ignoreTLS: config.isDev,
});

/** Send a transactional email. Returns nodemailer info; safe to await or ignore. */
export async function sendMail({ to, subject, html, text }) {
  return transporter.sendMail({
    from: config.MAIL_FROM,
    to,
    subject,
    html,
    text,
  });
}

/** Verify SMTP connectivity on boot (non-fatal if it fails). Times out after 5s
 *  so an unreachable SMTP host (e.g. no Mailpit in prod) can't stall boot. */
export async function verifyMailer() {
  try {
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('verify timeout')), 5000)),
    ]);
    return true;
  } catch {
    return false;
  }
}
