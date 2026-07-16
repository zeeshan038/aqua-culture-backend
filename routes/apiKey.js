import express from 'express';
const router = express.Router();

import { getKeys, createKey, deleteKey, toggleKey } from '../controllers/apiKey.js'

router.get('/keys',getKeys);
router.post('/keys',createKey);
router.delete('/keys/:id',deleteKey);
router.put('/keys/:id/toggle',toggleKey);


export default router;



