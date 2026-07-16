import express from 'express';
const router = express.Router();

import { getRules, getHistory, testAlert, setLimits, toggleAcknowledge } from '../controllers/alarm.js'

router.get('/get-all',          getRules);
router.get('/history',          getHistory);
router.post('/test-alert',   testAlert);
router.post('/set-limits',      setLimits);
router.put('/acknowledge/:id',  toggleAcknowledge);


export default router;