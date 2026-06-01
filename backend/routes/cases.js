import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Middleware проверки админ-ключа
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// GET /api/cases — список дел для пользователя
router.get('/', async (req, res) => {
  const { telegram_id } = req.query;
  try {
    let user = null;
    if (telegram_id) {
      const u = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegram_id]);
      user = u.rows[0] || null;
    }

    const cases = await pool.query('SELECT id, title, case_number, difficulty, is_free, published_at FROM cases WHERE published_at IS NOT NULL ORDER BY case_number');

    const isPremium = user && (
      user.subscription_type === 'forever' ||
      (user.subscription_type === 'monthly' && user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date())
    );

    const result = cases.rows.map(c => ({
      ...c,
      locked: !c.is_free && !isPremium
    }));

    res.json(result);
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cases/:number — одно дело
router.get('/:number', async (req, res) => {
  const { telegram_id } = req.query;
  try {
    const c = await pool.query('SELECT * FROM cases WHERE case_number = $1', [req.params.number]);
    if (!c.rows[0]) return res.status(404).json({ error: 'Not found' });
    const caseData = c.rows[0];

    if (!caseData.is_free && telegram_id) {
      const u = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegram_id]);
      const user = u.rows[0];
      const isPremium = user && (
        user.subscription_type === 'forever' ||
        (user.subscription_type === 'monthly' && user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date())
      );
      if (!isPremium) return res.status(403).json({ error: 'Subscription required' });
    }

    res.json(caseData);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ADMIN ROUTES =====

// GET /api/cases/admin/list
router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, case_number, difficulty, is_free, published_at FROM cases ORDER BY case_number');
    res.json(result.rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cases/admin/:number
router.get('/admin/:number', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cases WHERE case_number = $1', [req.params.number]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cases/admin/create
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

// DELETE /api/cases/admin/:id
router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM cases WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
