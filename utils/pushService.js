// utils/pushService.js
// Sends alarm notifications via Telegram Bot & Resend Email

import 'dotenv/config';
import emailService from './emailService.js';

async function sendAlert(message) {
  // Trigger email alert
  const emailPromise = emailService.sendEmailAlert(message);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  let telegramSent = false;
  if (!token || !chatId) {
    console.log('📵 Telegram token or chat ID not configured. Alert:', message);
  } else {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: `🚨 <b>Marcel Alert</b>\n\n${message}`,
          parse_mode: 'HTML'
        })
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        console.log('📲 Telegram alert sent successfully');
        telegramSent = true;
      } else {
        console.error('❌ Telegram send error:', data.description || 'Unknown error');
      }
    } catch (err) {
      console.error('❌ Telegram connection error:', err.message);
    }
  }

  const emailSent = await emailPromise;
  return telegramSent || emailSent;
}

export default { sendAlert };

