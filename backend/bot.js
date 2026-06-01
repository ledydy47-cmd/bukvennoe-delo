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
  const msg = update.message;
  if (!msg) return;

  const tgUser = msg.from;
  const chatId = msg.chat.id;
  const text = msg.text ?? '';

  let user = null;
  try {
    user = await getOrCreateUser({
      id:         tgUser.id,
      username:   tgUser.username,
      first_name: tgUser.first_name,
    });
  } catch (e) {
    console.error('getOrCreateUser error:', e);
  }

  if (user) {
    await pool.query(
      'INSERT INTO analytics (user_id, event, meta) VALUES ($1, $2, $3)',
      [user.id, 'bot_start', JSON.stringify({ source: text })]
    ).catch(() => {});
  }

  // Одно универсальное сообщение на любой текст
  await sendTelegram('sendMessage', {
    chat_id: chatId,
    parse_mode: 'Markdown',
    text:
      `👋 Привет, ${tgUser.first_name}!\n\n` +
      `🔤 *Буквенное дело* — детективные головоломки в стиле поиска слов.\n\n` +
      `*Как играть:*\n` +
      `• Ищи слова в сетке букв — в любом направлении\n` +
      `• 2 слова из списка отсутствуют в сетке — они часть разгадки\n` +
      `• Из оставшихся букв сложится место преступления\n\n` +
      `Готов раскрыть первое дело?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔤 Открыть игру', web_app: { url: process.env.WEBAPP_URL } }],
        [{ text: '🔓 Подписка — все дела', web_app: { url: `${process.env.WEBAPP_URL}/subscribe.html` } }],
        [{ text: '❓ Как играть', web_app: { url: `${process.env.WEBAPP_URL}/help.html` } }],
        [{ text: '📩 Поддержка', url: 'https://t.me/wbsellan' }],
      ]
    }
  });
}
