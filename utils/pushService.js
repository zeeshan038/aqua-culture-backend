// utils/pushService.js
// Sends alarm notifications via Telegram Bot

import 'dotenv/config';

async function sendAlert(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('📵 Telegram token or chat ID not configured. Alert:', message);
    return false;
  }
  
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
      return true;
    } else {
      console.error('❌ Telegram send error:', data.description || 'Unknown error');
      return false;
    }
  } catch (err) {
    console.error('❌ Telegram connection error:', err.message);
    return false;
  }
}

export default { sendAlert };
