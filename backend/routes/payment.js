import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from './auth.js';
import crypto from 'crypto';

const router = Router();

const YUKASSA_SHOP_ID = process.env.YUKASSA_SHOP_ID;
const YUKASSA_SECRET_KEY = process.env.YUKASSA_SECRET_KEY;
const WEBAPP_URL = process.env.WEBAPP_URL;

const PLANS = {
  monthly:  { amount: '199.00', description: 'Буквенное дело — подписка на месяц',   save_payment: true  },
  lifetime: { amount: '990.00', description: 'Буквенное дело — вечный доступ',        save_payment: false },
};

function yukassaAuth() {
  return 'Basic ' + Buffer.from(`${YUKASSA_SHOP_ID}:${YUKASSA_SECRET_KEY}`).toString('base64');
}

// ===== СТАТУС ПОДПИСКИ =====
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    // Проверяем не истекла ли месячная подписка
    if (user.subscription_type === 'monthly' && user.subscription_expires_at) {
      if (new Date(user.subscription_expires_at) < new Date()) {
        await pool.query(
          "UPDATE users SET subscription_type = 'free', subscription_expires_at = NULL WHERE id = $1",
          [user.id]
        );
        return res.json({ subscription_type: 'free', subscription_expires_at: null });
      }
    }
    res.json({
      subscription_type:       user.subscription_type ?? 'free',
      subscription_expires_at: user.subscription_expires_at ?? null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== СОЗДАТЬ ПЛАТЁЖ =====
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Неверный план' });

    const p = PLANS[plan];
    const idempotenceKey = crypto.randomUUID();

    const body = {
      amount: { value: p.amount, currency: 'RUB' },
      confirmation: {
        type: 'redirect',
        return_url: `${WEBAPP_URL}/payment-success.html?plan=${plan}`,
      },
      capture: true,
      description: p.description,
      metadata: {
        user_id:  String(req.user.id),
        plan:     plan,
        tg_id:    String(req.user.telegram_id),
      },
      save_payment_method: p.save_payment,
    };

    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization':   yukassaAuth(),
        'Content-Type':    'application/json',
        'Idempotence-Key': idempotenceKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('ЮКасса ошибка:', data);
      return res.status(500).json({ error: data.description || 'Ошибка оплаты' });
    }

    // Сохраняем платёж в БД
    await pool.query(
      `INSERT INTO payments (user_id, payment_id, plan, amount, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       ON CONFLICT (payment_id) DO NOTHING`,
      [req.user.id, data.id, plan, p.amount]
    );

    res.json({
      payment_id:       data.id,
      confirmation_url: data.confirmation.confirmation_url,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== ВЕБХУК ОТ ЮКАССЫ =====
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('ЮКасса вебхук:', event.event, event.object?.id);

    if (event.event === 'payment.succeeded') {
      const payment = event.object;
      const { user_id, plan } = payment.metadata;

      if (plan === 'lifetime') {
        await pool.query(
          `UPDATE users SET subscription_type = 'lifetime', subscription_expires_at = NULL WHERE id = $1`,
          [user_id]
        );
      } else if (plan === 'monthly') {
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        await pool.query(
          `UPDATE users SET subscription_type = 'monthly', subscription_expires_at = $1 WHERE id = $2`,
          [expires, user_id]
        );
        // Сохраняем payment_method_id для автоплатежей
        if (payment.payment_method?.id) {
          await pool.query(
            `UPDATE users SET payment_method_id = $1 WHERE id = $2`,
            [payment.payment_method.id, user_id]
          );
        }
      }

      // Обновляем статус платежа
      await pool.query(
        `UPDATE payments SET status = 'succeeded' WHERE payment_id = $1`,
        [payment.id]
      );

      // Аналитика
      await pool.query(
        `INSERT INTO analytics (user_id, event, meta) VALUES ($1, 'subscribe', $2)`,
        [user_id, JSON.stringify({ plan })]
      );
    }

    if (event.event === 'payment.canceled') {
      await pool.query(
        `UPDATE payments SET status = 'canceled' WHERE payment_id = $1`,
        [event.object.id]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== АВТОПРОДЛЕНИЕ (запускать крон каждый день) =====
router.post('/auto-renew', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    // Находим пользователей у кого подписка истекает в течение 1 дня
    const expiring = await pool.query(`
      SELECT id, payment_method_id, telegram_id
      FROM users
      WHERE subscription_type = 'monthly'
        AND subscription_expires_at < NOW() + INTERVAL '1 day'
        AND payment_method_id IS NOT NULL
    `);

    let renewed = 0;
    for (const user of expiring.rows) {
      try {
        const idempotenceKey = crypto.randomUUID();
        const response = await fetch('https://api.yookassa.ru/v3/payments', {
          method: 'POST',
          headers: {
            'Authorization':   yukassaAuth(),
            'Content-Type':    'application/json',
            'Idempotence-Key': idempotenceKey,
          },
          body: JSON.stringify({
            amount: { value: '199.00', currency: 'RUB' },
            capture: true,
            payment_method_id: user.payment_method_id,
            description: 'Буквенное дело — автопродление подписки',
            metadata: { user_id: String(user.id), plan: 'monthly', tg_id: String(user.telegram_id) },
          }),
        });
        const data = await response.json();
        if (data.status === 'succeeded') {
          const expires = new Date();
          expires.setDate(expires.getDate() + 30);
          await pool.query(
            `UPDATE users SET subscription_expires_at = $1 WHERE id = $2`,
            [expires, user.id]
          );
          renewed++;
        }
      } catch (err) {
        console.error(`Ошибка автопродления для user ${user.id}:`, err.message);
      }
    }
    res.json({ ok: true, renewed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
