import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from './auth.js';

const router = Router();

function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ===== ADMIN ROUTES =====

router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, case_number, difficulty, is_free, published_at FROM cases ORDER BY case_number');
    res.json(result.rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/:number', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cases WHERE case_number = $1', [req.params.number]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/admin/create', adminAuth, async (req, res) => {
  const { title, case_number, difficulty, is_free, puzzle_data } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO cases (title, case_number, difficulty, is_free, puzzle_data, published_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (case_number) DO UPDATE SET
         title = EXCLUDED.title,
         difficulty = EXCLUDED.difficulty,
         is_free = EXCLUDED.is_free,
         puzzle_data = EXCLUDED.puzzle_data,
         published_at = NOW()
       RETURNING *`,
      [title, case_number, difficulty || 'medium', is_free || false, JSON.stringify(puzzle_data)]
    );
    res.json(result.rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM cases WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== USER ROUTES =====

router.get('/', authMiddleware, async (req, res) => {
  const user = req.user;
  try {
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
      access: getAccess(user, c),
      progress: c.status ?? 'not_started',
      found_words: c.found_words ?? [],
    }));

    res.json(cases);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  const user = req.user;
  const caseId = req.params.id;
  try {
    const caseResult = await pool.query(
      'SELECT * FROM cases WHERE id = $1 AND published_at IS NOT NULL',
      [caseId]
    );
    if (!caseResult.rows.length) return res.status(404).json({ error: 'Дело не найдено' });
    const caseData = caseResult.rows[0];

    if (getAccess(user, caseData) === 'locked') {
      return res.status(403).json({ error: 'Требуется подписка' });
    }

    const progressResult = await pool.query(
      'SELECT * FROM user_progress WHERE user_id = $1 AND case_id = $2',
      [user.id, caseId]
    );

    res.json({ ...caseData, progress: progressResult.rows[0] ?? null });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

function getAccess(user, caseData) {
  if (caseData.is_free) return 'available';
  if (user.subscription_type === 'lifetime') return 'available';
  if (user.subscription_type === 'monthly') {
    return new Date(user.subscription_expires_at) > new Date() ? 'available' : 'locked';
  }
  return 'locked';
}

export default router;
