import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from './auth.js';

const router = Router();

router.post('/event', authMiddleware, async (req, res) => {
  try {
    const { event, case_id, meta } = req.body;
    await pool.query(
      'INSERT INTO analytics (user_id, event, case_id, meta) VALUES ($1, $2, $3, $4)',
      [req.user.id, event, case_id ?? null, JSON.stringify(meta ?? {})]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/dashboard', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const totals = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') AS new_users_7d,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days') AS new_users_30d,
        (SELECT COUNT(DISTINCT user_id) FROM analytics WHERE event = 'app_open' AND created_at > NOW() - INTERVAL '1 day') AS dau,
        (SELECT COUNT(DISTINCT user_id) FROM analytics WHERE event = 'app_open' AND created_at > NOW() - INTERVAL '7 days') AS wau,
        (SELECT COUNT(*) FROM user_progress WHERE status = 'completed') AS total_completions,
        (SELECT COUNT(*) FROM users WHERE subscription_type = 'monthly') AS monthly_subs,
        (SELECT COUNT(*) FROM users WHERE subscription_type = 'lifetime') AS lifetime_subs
    `);
    const byDay = await pool.query(`
      SELECT DATE(created_at) AS date, event, COUNT(*) AS count, COUNT(DISTINCT user_id) AS unique_users
      FROM analytics
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at), event
      ORDER BY date DESC, event
    `);
    const topCases = await pool.query(`
      SELECT c.title, c.case_number,
        COUNT(up.id) AS started,
        COUNT(CASE WHEN up.status = 'completed' THEN 1 END) AS completed,
        ROUND(AVG(up.time_spent_sec) / 60.0, 1) AS avg_minutes
      FROM cases c
      LEFT JOIN user_progress up ON up.case_id = c.id
      GROUP BY c.id, c.title, c.case_number
      ORDER BY started DESC
    `);
    const funnel = await pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN event = 'bot_start' THEN user_id END) AS bot_start,
        COUNT(DISTINCT CASE WHEN event = 'app_open' THEN user_id END) AS app_open,
        COUNT(DISTINCT CASE WHEN event = 'game_start' THEN user_id END) AS game_start,
        COUNT(DISTINCT CASE WHEN event = 'game_complete' THEN user_id END) AS game_complete,
        COUNT(DISTINCT CASE WHEN event = 'paywall_shown' THEN user_id END) AS paywall_shown,
        COUNT(DISTINCT CASE WHEN event = 'subscribe' THEN user_id END) AS subscribed
      FROM analytics
    `);
    res.json({ totals: totals.rows[0], byDay: byDay.rows, topCases: topCases.rows, funnel: funnel.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== СПИСОК ПОЛЬЗОВАТЕЛЕЙ =====
router.get('/users', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const filter = req.query.filter || 'all';
    let where = '';
    if (filter === 'monthly') where = "WHERE subscription_type = 'monthly'";
    if (filter === 'lifetime') where = "WHERE subscription_type = 'lifetime'";
    if (filter === 'free') where = "WHERE subscription_type IS NULL OR subscription_type = 'free'";

    const result = await pool.query(`
      SELECT
        u.id,
        u.telegram_id,
        u.first_name,
        u.last_name,
        u.username,
        u.subscription_type,
        u.subscription_expires_at,
        u.created_at,
        COUNT(DISTINCT up.id) FILTER (WHERE up.status = 'completed') AS completed_cases,
        COUNT(DISTINCT up.id) AS total_cases_started,
        MAX(a.created_at) AS last_active
      FROM users u
      LEFT JOIN user_progress up ON up.user_id = u.id
      LEFT JOIN analytics a ON a.user_id = u.id
      ${where}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 500
    `);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
