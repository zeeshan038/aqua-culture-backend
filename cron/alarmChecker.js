// cron/alarmChecker.js
// Runs every 30 seconds — checks latest sensor data against all active alarm rules.
// Fires Telegram alert + logs to AlarmHistory when a threshold is breached.

import prisma from '../config/db.js';
import pushService from '../utils/pushService.js';

// Cooldown map: ruleId → timestamp of last alert sent
// Prevents spamming the same alarm every 30s
const cooldownMap = new Map();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

async function checkAlarms(io) {
  try {
    // 1. Get the latest sensor reading
    const latest = await prisma.sensorLog.findFirst({
      orderBy: { recordedAt: 'desc' },
    });

    if (!latest) return; // No data yet

    // 2. Get all active alarm rules
    const rules = await prisma.alarmRule.findMany({
      where: { isActive: true },
    });

    if (!rules.length) return;

    for (const rule of rules) {
      const sensorValue = latest[rule.sensor];

      // Skip if this sensor has no reading
      if (sensorValue == null) continue;

      // 3. Check if threshold is breached
      const breached =
        (rule.condition === 'above' && sensorValue > rule.threshold) ||
        (rule.condition === 'below' && sensorValue < rule.threshold);

      if (!breached) continue;

      // 4. Check if an active alarm already exists
      const existingActiveAlarm = await prisma.alarmHistory.findFirst({
        where: { ruleId: rule.id, acknowledged: false },
      });

      if (existingActiveAlarm) {
        // Just update the timestamp, do NOT create a new row or send another SMS
        await prisma.alarmHistory.update({
          where: { id: existingActiveAlarm.id },
          data: { lastTriggeredAt: new Date(), value: sensorValue },
        });

        if (io) {
          io.emit('alarm:triggered', {
            rule,
            value: sensorValue,
            history: existingActiveAlarm,
          });
        }
        continue;
      }

      // 5. Apply cooldown — don't re-alert within 5 minutes for same rule if it's a NEW alarm
      // (Though since we only trigger new alarms when there are no active ones, this might be redundant but safe to keep)
      const lastAlert = cooldownMap.get(rule.id);
      if (lastAlert && Date.now() - lastAlert < COOLDOWN_MS) continue;

      cooldownMap.set(rule.id, Date.now());

      // 6. Build alert message
      const conditionText = rule.condition === 'above' ? 'exceeded' : 'dropped below';
      const alertMsg =
        rule.message ||
        `⚠️ <b>${rule.sensor.toUpperCase()}</b> ${conditionText} threshold!\n` +
        `Value: <b>${sensorValue}</b> | Limit: <b>${rule.threshold}</b>`;

      // 7. Send Push notification
      const smsSent = await pushService.sendAlert(alertMsg);

      // 8. Save to AlarmHistory
      const historyEntry = await prisma.alarmHistory.create({
        data: {
          ruleId:      rule.id,
          sensor:      rule.sensor,
          value:       sensorValue,
          message:     alertMsg,
          smsSent,
        },
      });

      console.log(`🚨 Alarm triggered: ${rule.sensor} is ${sensorValue} (${rule.condition} ${rule.threshold})`);

      // 9. Emit real-time alarm event via Socket.io (if io is provided)
      if (io) {
        io.emit('alarm:triggered', {
          rule,
          value: sensorValue,
          history: historyEntry,
        });
      }
    }
  } catch (err) {
    console.error('❌ Alarm checker error:', err.message);
  }
}

/**
 * Start the alarm checker.
 * @param {import('socket.io').Server} io  — Socket.io server instance
 * @param {number} intervalMs              — How often to check (default: 30s)
 */
export function startAlarmChecker(io, intervalMs = 30_000) {
  console.log(`🔔 Alarm checker started (every ${intervalMs / 1000}s)`);

  // Run once immediately on startup
  checkAlarms(io);

  // Then run on interval
  setInterval(() => checkAlarms(io), intervalMs);
}
