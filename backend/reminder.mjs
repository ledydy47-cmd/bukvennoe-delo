import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tDFjhDkshRLfWrvzvzZhLGbimNKiJOzb@zephyr.proxy.rlwy.net:29902/railway'
});

const BOT_TOKEN = process.env.BOT_TOKEN || '8992101075:AAFWt9SedBNz9h-cHurGr9_JzjjeGirGz0A';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://bukvennoe-delo.vercel.app';

// Находим пользователей которые:
// 1. Прошли все бесплатные дела (3 завершены)
// 2. Не купили подписку
// 3. Не получали напоминание последние 3 дня
const { rows } = await pool.query(`
  SELECT u.telegram_id, u.first_name
  FROM users u
  WHERE u.subscription_type = 'free'
  AND (
    SELECT COUNT(*) FROM user_progress up
    JOIN cases c ON c.id = up.case_id
    WHERE up.user_id = u.id
    AND up.status = 'completed'
    AND c.is_free = true
  ) >= 3
  AND NOT EXISTS (
    SELECT 1 FROM analytics a
    WHERE a.user_id = u.id
    AND a.event = 'reminder_sent'
    AND a.created_at > NOW() - INTERVAL '3 days'
  )
`);

console.log(`📨 Найдено ${rows.length} пользователей для напоминания`);
let ok = 0;

for (const u of rows) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: u.telegram_id,
        parse_mode: 'Markdown',
        text: `🕵️ *${u.first_name || 'Детектив'}*, нераскрытые дела ждут тебя!\n\n` +
              `Ты уже доказал что умеешь раскрывать преступления — впереди ещё 47 дел.\n\n` +
              `Открой все дела всего за *99 ₽/месяц* 🔓`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔓 Открыть все дела', url: `${WEBAPP_URL}/subscribe.html` }]
          ]
        }
      })
    });
    const d = await res.json();
    if (d.ok) {
      ok++;
      // Записываем что отправили напоминание
      await pool.query(
        `INSERT INTO analytics (user_id, event, meta) 
         SELECT id, 'reminder_sent', '{}' FROM users WHERE telegram_id = $1`,
        [u.telegram_id]
      );
      console.log(`✅ ${u.first_name || u.telegram_id}`);
    }
    await new Promise(r => setTimeout(r, 100));
  } catch(e) {
    console.log(`❌ ${e.message}`);
  }
}

console.log(`\n✅ Напоминаний отправлено: ${ok}`);
await pool.end();
