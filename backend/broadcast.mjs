import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:tDFjhDkshRLfWrvzvzZhLGbimNKiJOzb@zephyr.proxy.rlwy.net:29902/railway'
});

const BOT_TOKEN = '8992101075:AAFWt9SedBNz9h-cHurGr9_JzjjeGirGz0A';
const WEBAPP_URL = 'https://bukvennoe-delo.vercel.app';

const { rows } = await pool.query(`SELECT telegram_id, first_name FROM users WHERE telegram_id IS NOT NULL`);

console.log(`📨 Рассылаю ${rows.length} пользователям...`);
let ok = 0, fail = 0;

for (const u of rows) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: u.telegram_id,
        parse_mode: 'Markdown',
        text: `🕵️ *${u.first_name || 'Детектив'}, оплата в Буквенном деле теперь доступна!*\n\n` +
              `Ты уже знаком с игрой — теперь можно открыть все 50+ дел.\n\n` +
              `В честь запуска оплаты дарим скидку *50%* только на *24 часа*:\n\n` +
              `💳 Месяц: ~~199 ₽~~ → *99 ₽*\n` +
              `♾️ Навсегда: ~~990 ₽~~ → *449 ₽*\n\n` +
              `Успей до конца акции — потом цена вернётся 🔒`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔥 Открыть все дела со скидкой', url: `${WEBAPP_URL}/subscribe.html` }]
          ]
        }
      })
    });
    const d = await res.json();
    if (d.ok) { ok++; console.log(`✅ ${u.first_name || u.telegram_id}`); }
    else { fail++; console.log(`❌ ${u.telegram_id}: ${d.description}`); }
    await new Promise(r => setTimeout(r, 100));
  } catch(e) {
    fail++;
    console.log(`❌ ${u.telegram_id}: ${e.message}`);
  }
}

console.log(`\n📊 Итого: ✅ Отправлено: ${ok}, ❌ Ошибок: ${fail}`);
await pool.end();
