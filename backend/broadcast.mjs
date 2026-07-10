import pg from 'pg';

const BOT_TOKEN = '8992101075:AAFWt9SedBNz9h-cHurGr9_JzjjeGirGz0A';
const WEBAPP_URL = 'https://bukvennoe-delo.vercel.app';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:tDFjhDkshRLfWrvzvzZhLGbimNKiJOzb@zephyr.proxy.rlwy.net:29902/railway' });

const { rows } = await pool.query(`SELECT telegram_id, first_name FROM users WHERE subscription_type = 'free'`);

console.log(`Отправляем ${rows.length} пользователям...`);

let success = 0;
let failed = 0;

for (const user of rows) {
  const name = user.first_name || 'Детектив';
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegram_id,
        text: `🕵️ ${name}, нераскрытые дела ждут тебя...\n\nВ архиве скопились новые загадочные преступления — убийства, кражи, исчезновения. Каждое дело уникально и ждёт именно тебя.\n\nОткрой все дела со скидкой 50% 👇`,
        reply_markup: {
          inline_keyboard: [[
            { text: '🔓 Открыть все дела за 99 ₽', url: `${WEBAPP_URL}/subscribe.html` }
          ]]
        }
      })
    });
    const data = await res.json();
    if (data.ok) {
      success++;
      console.log(`✅ ${user.telegram_id} (${name})`);
    } else {
      failed++;
      console.log(`❌ ${user.telegram_id} (${name}): ${data.description}`);
    }
  } catch (e) {
    failed++;
    console.log(`❌ ${user.telegram_id}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 100));
}

console.log(`\nГотово! ✅ ${success} отправлено, ❌ ${failed} ошибок`);
await pool.end();
