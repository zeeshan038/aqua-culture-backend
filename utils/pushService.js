// utils/pushService.js
// Sends alarm notifications via PushPlus (pushplus.plus) for WeChat alerts in China

import 'dotenv/config';

async function sendAlert(message) {
  const token = process.env.PUSHPLUS_TOKEN;
  if (!token) {
    console.log('📵 PushPlus token not configured. Alert:', message);
    return false;
  }
  
  try {
    // PushPlus API format: POST to http://www.pushplus.plus/send
    // Body: { "token": "...", "title": "...", "content": "..." }
    const response = await fetch('http://www.pushplus.plus/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token,
        title: '🐟 AquaMonitor Alert',
        content: message
      })
    });

    const data = await response.json();

    if (response.ok && data.code === 200) {
      console.log('📲 WeChat alert sent via PushPlus');
      return true;
    } else {
      console.error('❌ PushPlus send error:', data.msg || 'Unknown error');
      return false;
    }
  } catch (err) {
    console.error('❌ PushPlus connection error:', err.message);
    return false;
  }
}

export default { sendAlert };
