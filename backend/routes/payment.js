import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from './auth.js';
import crypto from 'crypto';

const router = Router();

const YUKASSA_SHOP_ID = process.env.YUKASSA_SHOP_ID;
const YUKASSA_SECRET_KEY = process.env.YUKASSA_SECRET_KEY;
const WEBAPP_URL = process.env.WEBAPP_URL;

const PLANS = {
  monthly:  { amount: '199.00', description: 'Буквенное дело — подписка на месяц' },
  lifetime: { amount: '990.00', description: 'Буквенное дело — вечный доступ' },
};

function yukassaAuth() {
  return 'Basic ' + Buffer.from(`${YUKASSA_SHOP_ID}:${YUKASSA_SECRET_KEY}`).toString('base64');
}

// ===== СТАТУС ПОДПИСКИ =====
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
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
    if (!req.user || req.user.id === 0) {
      return res.status(401).json({ error: 'Откройте приложение через Telegram' });
    }

    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Неверный план' });

    const p = PLANS[plan];
    const idempotenceKey = crypto.randomUUID();

    const body = {
      amount: { value: p.amount, currency: 'RUB' },
      confirmation: {
        type: 'redirect',
        return_url: `${WEBAPP_URL || 'https://bukvennoe-delo.vercel.app'}/payment-success.html?plan=${plan}`,
      },
      capture: true,
      description: p.description,
      metadata: {
        user_id:  String(req.user.id),
        plan:     plan,
        tg_id:    String(req.user.telegram_id),
      },
      save_payment_method: plan === 'monthly',
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
      console.error('ЮКасса ошибка:', JSON.stringify(data));
      return res.status(500).json({ error: data.description || data.code || JSON.stringify(data) });
    }

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
    console.error('Payment create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== ВЕБХУК ОТ ЮКАССЫ =====
router.post('/webhook', async (req, res) => {
  // Отвечаем сразу — ЮКасса не будет ждать
  res.json({ ok: true });

  try {
    const event = req.body;
    console.log('💳 ЮКасса вебхук:', event.event, event.object?.id);

    if (event.event === 'payment.succeeded') {
      const payment = event.object;
      const { user_id, plan, tg_id } = payment.metadata || {};

      console.log('📦 Metadata:', { user_id, plan, tg_id });

      if (!user_id || !plan) {
        console.error('❌ Нет user_id или plan в metadata');
        return;
      }

      // Активируем подписку
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
        if (payment.payment_method?.id) {
          await pool.query(
            `UPDATE users SET payment_method_id = $1 WHERE id = $2`,
            [payment.payment_method.id, user_id]
          );
        }
      }

      console.log(`✅ Подписка активирована: user_id=${user_id}, plan=${plan}`);

      // Обновляем статус платежа
      await pool.query(
        `UPDATE payments SET status = 'succeeded' WHERE payment_id = $1`,
        [payment.id]
      );

      // Аналитика — только если user_id реальный (не 0)
      const uid = parseInt(user_id);
      if (uid && uid > 0) {
        await pool.query(
          `INSERT INTO analytics (user_id, event, meta) VALUES ($1, 'subscribe', $2)`,
          [uid, JSON.stringify({ plan })]
        ).catch(e => console.error('Analytics error (non-critical):', e.message));
      }

      // Уведомляем пользователя в Telegram
      if (tg_id && process.env.BOT_TOKEN) {
        const text = plan === 'monthly'
          ? `✅ Подписка активирована!\n\nВсе дела открыты на 30 дней. Удачи, детектив! 🔍`
          : `✅ Постоянный доступ активирован!\n\nВсе дела открыты навсегда. Удачи, детектив! 🔍`;
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tg_id, text }),
        }).catch(e => console.error('Telegram notify error:', e.message));
      }
    }

    if (event.event === 'payment.canceled') {
      await pool.query(
        `UPDATE payments SET status = 'canceled' WHERE payment_id = $1`,
        [event.object.id]
      ).catch(e => console.error('Cancel update error:', e.message));
    }

  } catch (e) {
    console.error('❌ Webhook error:', e.message, e.stack);
  }
});

// ===== СТАТУС ПОДПИСКИ (публичный) =====
router.get('/check', authMiddleware, async (req, res) => {
  try {
    if (!req.user || req.user.id === 0) return res.json({ active: false });
    const now = new Date();
    const active = req.user.subscription_type === 'lifetime' ||
      (req.user.subscription_type === 'monthly' && new Date(req.user.subscription_expires_at) > now);
    res.json({ active, type: req.user.subscription_type, expires_at: req.user.subscription_expires_at });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== ОТМЕНА АВТОПРОДЛЕНИЯ =====
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    if (!req.user || req.user.id === 0) return res.status(401).json({ error: 'Unauthorized' });
    await pool.query(`UPDATE users SET payment_method_id = NULL WHERE id = $1`, [req.user.id]);
    res.json({ ok: true, message: 'Автопродление отменено' });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
