// controllers/calibrationController.js

import prisma from '../config/db.js';

const VALID_SENSORS = ['ph', 'temperature', 'do2', 'no2', 'no3', 'nh4'];

/**
 * @Description  Get Calibrations
 * @Route GET /api/calibration
 * @Access Public
 */
export const getCalibrations = async (req, res) => {
  try {
    const data = await prisma.calibration.findMany({
      orderBy: { sensor: 'asc' },
    });
    res.json({
      status: true,
      msg: "Calibrations fetched successfully",
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
 * @Description  Update Calibration
 * @Route PUT /api/calibration/:sensor
 * @Access Public
 */
export const updateCalibration = async (req, res) => {
  const { sensor } = req.params;
  if (!VALID_SENSORS.includes(sensor)) {
    return res.status(400).json({ status: false, msg: 'Invalid sensor name' });
  }

  const { offset_val, scale_val, min_threshold, max_threshold, notes } = req.body;
  try {


    const data = await prisma.calibration.upsert({
      where: { sensor },
      update: {
        ...(offset_val !== undefined && { offsetVal: parseFloat(offset_val) }),
        ...(scale_val !== undefined && { scaleVal: parseFloat(scale_val) }),
        ...(min_threshold !== undefined && { minThreshold: min_threshold !== null ? parseFloat(min_threshold) : null }),
        ...(max_threshold !== undefined && { maxThreshold: max_threshold !== null ? parseFloat(max_threshold) : null }),
        ...(notes !== undefined && { notes: notes || null }),
      },
      create: {
        sensor,
        offsetVal: parseFloat(offset_val ?? 0),
        scaleVal: parseFloat(scale_val ?? 1),
        minThreshold: min_threshold !== undefined && min_threshold !== null ? parseFloat(min_threshold) : null,
        maxThreshold: max_threshold !== undefined && max_threshold !== null ? parseFloat(max_threshold) : null,
        notes: notes || null,
      },
    });

    res.json({
      status: true,
      msg: "Calibration updated successfully",
      data
    });
  } catch (err) {
    res.status(500).json({ status: false, msg: err.message });
  }
};

/**
 * @Description  Reset Calibration — restores offset=0, scale=1, clears thresholds
 * @Route POST /api/calibration/reset/:sensor
 * @Access Public
 */
export const resetCalibration = async (req, res) => {
  try {
    const { sensor } = req.params;
    if (!VALID_SENSORS.includes(sensor)) {
      return res.status(400).json({ status: false, msg: 'Invalid sensor name' });
    }

    const data = await prisma.calibration.upsert({
      where: { sensor },
      update: { offsetVal: 0, scaleVal: 1, minThreshold: null, maxThreshold: null, notes: null },
      create: { sensor, offsetVal: 0, scaleVal: 1 },
    });

    res.json({
      status: true,
      msg: `Calibration for ${sensor} reset to defaults`,
      data
    });
  } catch (err) {
    res.status(500).json({ status: false, msg: err.message });
  }
};


