export const triggerDoCalibration = async (req, res) => {
  const { type } = req.body;

  if (!['zero', 'full'].includes(type)) {
    return res.status(400).json({
      status: false,
      msg: "Invalid calibration type. Must be 'zero' or 'full'."
    });
  }

  try {
    const modbus = req.app.get('modbus');
    if (!modbus) {
      return res.status(500).json({
        status: false,
        msg: "Modbus service instance not available"
      });
    }

    const result = await modbus.calibrateDO(type);

    return res.json({
      status: true,
      msg: `Successfully initiated ${type}-point hardware calibration for the DO sensor.`,
      data: result
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      msg: `Failed to calibrate DO sensor: ${err.message}`
    });
  }
};
