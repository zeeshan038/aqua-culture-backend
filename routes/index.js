import express from 'express';
const router = express.Router();

import sensorRoutes from './sensor.js'
import alarmRoutes from "./alaram.js"
import calibrationRoutes from "./calibration.js"
import apiKeyRoutes from "./apiKey.js"

router.use('/sensor',sensorRoutes)
router.use("/alarm",alarmRoutes)
router.use("/calibration",calibrationRoutes)
router.use("/api-key",apiKeyRoutes)




export default router;
