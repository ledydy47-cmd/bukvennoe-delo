import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from './auth.js';

const router = Router();

// Статус подписки пользователя
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    res.json({
      subscription_type:       user.subscription_type ?? 'free',
      subscription_expires_at: user.subscription_expires_at ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Заглушка создания платежа — заполним после подключения ЮКассы
router.post('/create', authMiddleware, async (req, res) => {
  res.json({ error: 'Оплата скоро будет доступна' });
});

export default router;
