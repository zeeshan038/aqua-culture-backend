import express from 'express';
const router = express.Router();

import { getLatest, getHistory, getStats } from '../controllers/sensor.js'

router.get('/latest',getLatest)
router.get('/history',getHistory);
router.get('/stats',getStats)


export default router;