import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from './auth.js';

const router = Router();

router.get('/:caseId', authMiddleware, async (req, res) => {
  try {
    // Гостевой пользователь — нет данных в БД
    if (!req.user.id) return res.json(null);

    const result = await pool.query(
      'SELECT * FROM user_progress WHERE user_id = $1 AND case_id = $2',
      [req.user.id, req.params.caseId]
    );
    res.json(result.rows[0] ?? null);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:caseId', authMiddleware, async (req, res) => {
  try {
    // Гостевой пользователь — не сохраняем в БД
    if (!req.user.id) return res.json({ ok: true, guest: true });

    const { found_words, hint_used, answers, time_spent_sec } = req.body;
    const { id: userId } = req.user;
    const caseId = req.params.caseId;

    await pool.query(`
      INSERT INTO user_progress
        (user_id, case_id, found_words, hint_used, answers, time_spent_sec)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, case_id) DO UPDATE SET
        found_words    = EXCLUDED.found_words,
        hint_used      = EXCLUDED.hint_used,
        answers        = EXCLUDED.answers,
        time_spent_sec = EXCLUDED.time_spent_sec,
        last_saved_at  = NOW()
    `, [
      userId, caseId,
      JSON.stringify(found_words ?? []),
      hint_used ?? false,
      JSON.stringify(answers ?? {}),
      time_spent_sec ?? 0,
    ]);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:caseId/complete', authMiddleware, async (req, res) => {
  try {
    if (!req.user.id) return res.json({ ok: true, guest: true });

    const { answers } = req.body;
    await pool.query(`
      UPDATE user_progress SET
        status       = 'completed',
        answers      = $3,
        completed_at = NOW()
      WHERE user_id = $1 AND case_id = $2
    `, [req.user.id, req.params.caseId, JSON.stringify(answers)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:caseId/hint', authMiddleware, async (req, res) => {
  try {
    if (!req.user.id) return res.json({ ok: true, guest: true });

    const result = await pool.query(
      'SELECT hint_used FROM user_progress WHERE user_id = $1 AND case_id = $2',
      [req.user.id, req.params.caseId]
    );

    if (result.rows[0]?.hint_used) {
      return res.status(400).json({ error: 'Подсказка уже использована' });
    }

    await pool.query(`
      INSERT INTO user_progress (user_id, case_id, hint_used)
      VALUES ($1, $2, true)
      ON CONFLICT (user_id, case_id) DO UPDATE SET hint_used = true
    `, [req.user.id, req.params.caseId]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

// Статистика пользователя для страницы подписки
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) AS started
      FROM user_progress
      WHERE user_id = $1
    `, [req.user.id]);

    res.json({
      completed: parseInt(result.rows[0].completed) || 0,
      in_progress: parseInt(result.rows[0].in_progress) || 0,
      started: parseInt(result.rows[0].started) || 0,
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});
