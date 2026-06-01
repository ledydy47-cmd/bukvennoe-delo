import dotenv from 'dotenv';
dotenv.config();
import pool from './db.js';
import { getOrCreateUser } from './routes/auth.js';

async function sendTelegram(method, body) {
  const res = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return res.json();
}

export async function handleBotUpdate(update) {
  if (update.message?.text?.startsWith('/start')) {
    const tgUser = update.message.from;

    const user = await getOrCreateUser({
      id:         tgUser.id,
      username:   tgUser.username,
      first_name: tgUser.first_name,
    });

    await pool.query(
      'INSERT INTO analytics (user_id, event, meta) VALUES ($1, $2, $3)',
      [user.id, 'bot_start', JSON.stringify({ source: update.message.text })]
    );

    await sendTelegram('sendMessage', {
      chat_id: tgUser.id,
      text: `👋 Привет, ${tgUser.first_name}!\n\n🔤 Добро пожаловать в *Буквенное дело*\n\nИщи слова, собирай улики и раскрывай убийства!\n\n🆓 Два дела бесплатно — начни прямо сейчас!`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{
          text: '🔤 Открыть игру',
          web_app: { url: process.env.WEBAPP_URL }
        }]]
      }
    });
  }
}
