import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { analyzeDocument, getInsights } from '../controllers/aiController.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/analyze/:documentId', analyzeDocument);
router.get('/insights/:documentId', getInsights);

export default router;
