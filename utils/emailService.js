import { Resend } from 'resend';
import 'dotenv/config';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Sends a general email.
 * @param {string} subject 
 * @param {string} htmlBody 
 * @returns {Promise<boolean>}
 */
export async function sendEmail(subject, htmlBody) {
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const to = process.env.EMAIL_TO;

  if (!resend) {
    console.warn('⚠️ Resend is not configured (RESEND_API_KEY is missing).');
    return false;
  }

  if (!to) {
    console.warn('⚠️ EMAIL_TO is not configured in environment variables.');
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html: htmlBody,
    });

    if (error) {
      console.error('❌ Resend API Error:', error);
      return false;
    }

    console.log('📧 Email alert sent successfully:', data.id);
    return true;
  } catch (err) {
    console.error('❌ Failed to send email alert:', err.message);
    return false;
  }
}

/**
 * Sends a structured SCADA alert email.
 * @param {string} message 
 * @returns {Promise<boolean>}
 */
export async function sendEmailAlert(message) {
  // Strip HTML tags for the subject line
  const cleanSubject = message.replace(/<[^>]*>/g, '').replace(/\n/g, ' ');
  
  const htmlBody = `
    <div style="font-family: sans-serif; padding: 20px; border-radius: 8px; border: 1px solid #f5c6cb; background-color: #f8d7da; color: #721c24; max-width: 600px; margin: 20px auto;">
      <h2 style="margin-top: 0; color: #721c24; border-bottom: 1px solid #f5c6cb; padding-bottom: 10px;">🚨 Marcel SCADA Alert</h2>
      <div style="font-size: 16px; line-height: 1.6; margin: 15px 0;">
        ${message}
      </div>
      <hr style="border: 0; border-top: 1px solid #f5c6cb; margin: 20px 0;" />
      <p style="font-size: 12px; color: #804d51; margin-bottom: 0;">
        This is an automated alert from the AquaMonitor SCADA gateway.
      </p>
    </div>
  `;

  return sendEmail(cleanSubject, htmlBody);
}

export default {
  sendEmail,
  sendEmailAlert,
};
