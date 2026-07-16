import express from 'express';
const router = express.Router();

import {getCalibrations, updateCalibration, resetCalibration} from '../controllers/calibration.js'

router.get('/get-all', getCalibrations);
router.put('/update/:sensor', updateCalibration);
router.post('/reset/:sensor', resetCalibration);


export default router;