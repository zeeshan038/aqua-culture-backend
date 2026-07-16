// controllers/alarmController.js
import prisma from '../config/db.js';
import pushService from '../utils/pushService.js';

/**
 * @Description  Get Alarm Rules
 * @Route GET /api/alarms/rules
 * @Access Public
 */
export const getRules = async (req, res) => {
  try {
    const data = await prisma.alarmRule.findMany({
      orderBy: { id: 'asc' },
    });
    return res.json({
      status: true,
      msg: "Alarm rules fetched successfully",
      data
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};

/**
 * @Description  Create Alarm Rule
 * @Route POST /api/alarms/rules
 * @Access Public
 */
export const createRule = async (req, res) => {
  const { sensor, condition, threshold, message } = req.body;

  try {
    const validSensors = ['ph', 'temperature', 'do2', 'no2', 'no3', 'nh4'];
    if (!validSensors.includes(sensor)) {
      return res.status(400).json({
        status: false,
        msg: 'Invalid sensor'
      });
    }

    if (!['above', 'below'].includes(condition)) {
      return res.status(400).json({
        status: false,
        msg: 'Condition must be "above" or "below"'
      });
    }

    const data = await prisma.alarmRule.create({
      data: { sensor, condition, threshold: parseFloat(threshold), message: message || null },
    });
    res.json({
      status: true,
      msg: "Alarm rule created successfully",
      data
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};

/**
 * @Description  Set Low & High Limits for multiple sensors at once.
 *               Matches the "Alarm Setpoints Configuration" UI modal.
 *               Deletes existing rules for each sensor, then recreates them.
 * @Route POST /api/alarm/set-limits
 * @Access Public
 */
export const setLimits = async (req, res) => {
  const { limits } = req.body;

  const validSensors = ['ph', 'temperature', 'do2', 'no2', 'no3', 'nh4'];

  if (!Array.isArray(limits) || limits.length === 0) {
    return res.status(400).json({
      status: false,
      msg: '"limits" must be a non-empty array'
    });
  }

  // Validate all entries before touching the DB
  for (const entry of limits) {
    if (!validSensors.includes(entry.sensor)) {
      return res.status(400).json({ status: false, msg: `Invalid sensor: "${entry.sensor}"` });
    }
    if (entry.lowLimit === undefined || entry.highLimit === undefined) {
      return res.status(400).json({ status: false, msg: `"${entry.sensor}" must have both lowLimit and highLimit` });
    }
    if (parseFloat(entry.lowLimit) >= parseFloat(entry.highLimit)) {
      return res.status(400).json({ status: false, msg: `"${entry.sensor}" lowLimit must be less than highLimit` });
    }
  }

  try {
    const sensors = limits.map(l => l.sensor);

    // Manual upsert: find existing rule by sensor+condition → update, else create
    // Works without needing a named unique index on the Prisma client
    for (const { sensor, lowLimit, highLimit } of limits) {
      for (const [condition, threshold] of [
        ['below', parseFloat(lowLimit)],
        ['above', parseFloat(highLimit)],
      ]) {
        const existing = await prisma.alarmRule.findFirst({
          where: { sensor, condition },
        });

        if (existing) {
          await prisma.alarmRule.update({
            where: { id: existing.id },
            data: { threshold },
          });
        } else {
          await prisma.alarmRule.create({
            data: { sensor, condition, threshold },
          });
        }
      }
    }

    const data = await prisma.alarmRule.findMany({
      where: { sensor: { in: sensors } },
      orderBy: [{ sensor: 'asc' }, { condition: 'asc' }],
    });

    res.json({
      status: true,
      msg: `Alarm limits updated for: ${sensors.join(', ')}`,
      data
    });
  } catch (err) {
    res.status(500).json({ status: false, msg: err.message });
  }
};



/**
 * @Description  Update Alarm Rule
 * @Route PUT /api/alarms/rules/:id
 * @Access Public
 */
export const updateRule = async (req, res) => {
  const id = parseInt(req.params.id);
  const { sensor, condition, threshold, message, is_active, isActive } = req.body;
  try {
    const data = await prisma.alarmRule.update({
      where: { id },
      data: {
        ...(sensor !== undefined && { sensor }),
        ...(condition !== undefined && { condition }),
        ...(threshold !== undefined && { threshold: parseFloat(threshold) }),
        ...(message !== undefined && { message: message || null }),
        ...((is_active !== undefined || isActive !== undefined) && {
          isActive: is_active !== undefined ? Boolean(is_active) : Boolean(isActive),
        }),
      },
    });
    return res.json({
      status: true,
      msg: "Alarm rule updated successfully",
      data
    });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({
      status: false,
      msg: 'Rule not found'
    });
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};

/**
 * @Description  Delete Alarm Rule
 * @Route DELETE /api/alarms/rules/:id
 * @Access Public
 */
export const deleteRule = async (req, res) => {
  try {
    await prisma.alarmRule.delete({ where: { id: parseInt(req.params.id) } });
    res.json({
      status: true,
      msg: "Alarm rule deleted successfully",
    });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({
      status: false,
      msg: 'Rule not found'
    });
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};

/**
 * @Description  Get Alarm History
 * @Route GET /api/alarms/history
 * @Access Public
 */
export const getHistory = async (req, res) => {
  const limit = parseInt(req.query.limit ?? '5');
  const page = parseInt(req.query.page ?? '1');
  const skip = (page - 1) * limit;
  try {
    const [total, data] = await Promise.all([
      prisma.alarmHistory.count(),
      prisma.alarmHistory.findMany({
        orderBy: { triggeredAt: 'desc' },
        skip,
        take: limit,
        include: { rule: { select: { sensor: true } } },
      }),
    ]);

    return res.json({
      status: true,
      msg: "Alarm history fetched successfully",
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    
    });
  } catch (err) {

    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};

/**
 * @Description  Test WeChat Push Notification
 * @Route POST /api/alarms/test-alert
 * @Access Public
 */
export const testAlert = async (req, res) => {
  try {
    const sent = await pushService.sendAlert('🧪 Test alert from AquaMonitor SCADA system!');
    res.json({ success: sent, message: sent ? 'Alert sent!' : 'PushPlus not configured' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};



/**
 * @Description Toggle Acknowledgement on an alarm history entry
 * @Route PUT /api/alarm/acknowledge/:id
 * @Access Public
 */
export const toggleAcknowledge = async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const alarm = await prisma.alarmHistory.findUnique({ where: { id } });
    if (!alarm) return res.status(404).json({ status: false, msg: 'Alarm not found' });

    const nowAcknowledged = !alarm.acknowledged;

    const data = await prisma.alarmHistory.update({
      where: { id },
      data: {
        acknowledged: nowAcknowledged,
        acknowledgedAt: nowAcknowledged ? new Date() : null,
      },
    });
    return res.json({
      status: true,
      msg: nowAcknowledged ? "Alarm acknowledged" : "Alarm un-acknowledged",
      data
    });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({
      status: false,
      msg: 'Alarm not found'
    });
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};