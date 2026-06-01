import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from './auth.js';

const router = Router();

// Список всех дел
router.get('/', authMiddleware, async (req, res) => {
  const user = req.user;

  const result = await pool.query(`
    SELECT
      c.id, c.title, c.case_number, c.difficulty, c.is_free,
      up.status, up.found_words, up.completed_at, up.hint_used
    FROM cases c
    LEFT JOIN user_progress up
      ON up.case_id = c.id AND up.user_id = $1
    WHERE c.published_at IS NOT NULL
    ORDER BY c.case_number ASC
  `, [user.id]);

  const cases = result.rows.map(c => ({
    ...c,
    access:   getAccess(user, c),
    progress: c.status ?? 'not_started',
    found_words: c.found_words ?? [],
  }));

  res.json(cases);
});

// Данные конкретного дела
router.get('/:id', authMiddleware, async (req, res) => {
  const user = req.user;
  const caseId = req.params.id;

  const caseResult = await pool.query(
    'SELECT * FROM cases WHERE id = $1 AND published_at IS NOT NULL',
    [caseId]
  );

  if (!caseResult.rows.length) {
    return res.status(404).json({ error: 'Дело не найдено' });
  }

  const caseData = caseResult.rows[0];

  if (getAccess(user, caseData) === 'locked') {
    return res.status(403).json({ error: 'Требуется подписка' });
  }

  // Прогресс
  const progressResult = await pool.query(
    'SELECT * FROM user_progress WHERE user_id = $1 AND case_id = $2',
    [user.id, caseId]
  );

  res.json({
    ...caseData,
    progress: progressResult.rows[0] ?? null,
  });
});

function getAccess(user, caseData) {
  if (caseData.is_free) return 'available';
  if (user.subscription_type === 'lifetime') return 'available';
  if (user.subscription_type === 'monthly') {
    return new Date(user.subscription_expires_at) > new Date()
      ? 'available' : 'locked';
  }
  return 'locked';
}

export default router;
