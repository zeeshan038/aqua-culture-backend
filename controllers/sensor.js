//Prisma
import prisma from '../config/db.js';


/**
 * @Description  Get Latest Data
 * @Route GET /api/sensors/latest
 * @Access Public
 */
export const getLatest = async (req, res) => {
  try {
    // Prevent any caching so every request always returns fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const data = await prisma.sensorLog.findFirst({
      orderBy: { recordedAt: 'desc' },
    });
    return res.json({
      status: true,
      msg: "Sensors data fetched successfully",
      data
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};

/**
 * @Description  Get History Data
 * @Route GET /api/sensors/history?from=ISO&to=ISO&limit=200
 * @Access Public
 */
export const getHistory = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 200;
  const skip = (page - 1) * limit;
  const { from, to } = req.query;
  try {
    const where = {};
    if (from || to) {
      where.recordedAt = {};
      if (from) where.recordedAt.gte = new Date(from);
      if (to) where.recordedAt.lte = new Date(to);
    }

    const [total, data] = await Promise.all([
      prisma.sensorLog.count({ where }),
      prisma.sensorLog.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({
      status: true,
      msg: "Sensors history fetched successfully",
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};

/**
 * @Description  Get Sensor Statistics
 * @Route GET /api/sensors/stats?sensor=ph&period=24h
 * @Access Public
 */
export const getStats = async (req, res) => {
  try {
    const { sensor = 'ph', period = '24h' } = req.query;
    const validSensors = ['ph', 'temperature', 'do2', 'no2', 'no3', 'nh4'];

    if (!validSensors.includes(sensor)) {
      return res.status(400).json({
        status: false,
        msg: 'Invalid sensor name'
      });
    }

    const hoursMap = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 };
    const hours = hoursMap[period] ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const rows = await prisma.sensorLog.findMany({
      where: { recordedAt: { gte: since } },
      select: { [sensor]: true },
    });

    const values = rows.map(r => r[sensor]).filter(v => v != null);
    const count = values.length;
    const min = count ? Math.min(...values) : null;
    const max = count ? Math.max(...values) : null;
    const avg = count ? values.reduce((a, b) => a + b, 0) / count : null;

    res.json({
      status: true,
      msg: "Sensors statistics fetched successfully",
      sensor,
      period,
      data: { min, max, avg: avg?.toFixed(4), count },
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};


