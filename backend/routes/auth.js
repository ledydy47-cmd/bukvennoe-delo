import crypto from 'crypto';
import pool from '../db.js';

export function verifyTelegramData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (hash !== expectedHash) return null;

    const userParam = params.get('user');
    return userParam ? JSON.parse(userParam) : null;
  } catch {
    return null;
  }
}

export async function getOrCreateUser(telegramUser) {
  const { id, username, first_name } = telegramUser;

  const existing = await pool.query(
    'SELECT * FROM users WHERE telegram_id = $1',
    [id]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE users SET last_seen_at = NOW() WHERE telegram_id = $1',
      [id]
    );
    return existing.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name)
     VALUES ($1, $2, $3) RETURNING *`,
    [id, username || '', first_name || '']
  );

  return result.rows[0];
}

export function authMiddleware(req, res, next) {
  const initData = req.headers['x-init-data'];

  // В режиме разработки пропускаем проверку
  if (process.env.NODE_ENV !== 'production' && !initData) {
    req.user = { id: 1, telegram_id: 0, subscription_type: 'lifetime' };
    return next();
  }

  const telegramUser = verifyTelegramData(initData);
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  getOrCreateUser(telegramUser).then(user => {
    req.user = user;
    next();
  }).catch(() => res.status(500).json({ error: 'Server error' }));
}
