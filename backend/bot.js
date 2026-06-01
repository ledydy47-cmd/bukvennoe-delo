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

  // /start
  if (text.startsWith('/start')) {
    if (user) {
      await pool.query(
        'INSERT INTO analytics (user_id, event, meta) VALUES ($1, $2, $3)',
        [user.id, 'bot_start', JSON.stringify({ source: text })]
      ).catch(() => {});
    }

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
          [{ text: '🔓 Подписка — все дела', url: `${process.env.WEBAPP_URL}/subscribe.html` }],
        ]
      }
    });
    return;
  }

  // /help
  if (text === '/help') {
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text:
        `❓ *Как играть в Буквенное дело*\n\n` +
        `*1. Ищи слова в сетке*\n` +
        `Проведи пальцем по буквам чтобы выделить слово. Слова могут идти в любом направлении — горизонтально, вертикально, по диагонали, в обе стороны.\n\n` +
        `*2. Найди все 11 слов из 13*\n` +
        `2 слова из списка в сетке отсутствуют — это убийца и орудие преступления.\n\n` +
        `*3. Собери последнее слово*\n` +
        `После того как найдёшь все 11 слов, оставшиеся буквы подсветятся красным — собери из них слово и узнаешь место преступления.\n\n` +
        `*4. Введи ответы*\n` +
        `Впиши убийцу, орудие и место в поля внизу и нажми «Проверить».`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔤 Играть', web_app: { url: process.env.WEBAPP_URL } }]
        ]
      }
    });
    return;
  }

  // /subscribe
  if (text === '/subscribe') {
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text:
        `🔓 *Подписка — Буквенное дело*\n\n` +
        `*📅 На месяц — 199 ₽*\n` +
        `Все текущие дела + новые каждую неделю\n\n` +
        `*♾️ Навсегда — 990 ₽*\n` +
        `Все текущие и будущие дела навсегда\n\n` +
        `Оформить подписку можно прямо в приложении.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Оформить подписку', web_app: { url: `${process.env.WEBAPP_URL}/subscribe.html` } }]
        ]
      }
    });
    return;
  }

  // /support
  if (text === '/support') {
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text:
        `📩 *Поддержка*\n\n` +
        `Если у тебя возник вопрос или проблема — напиши нам напрямую.\n\n` +
        `Мы отвечаем в течение 24 часов.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✉️ Написать в поддержку', url: 'https://t.me/bukvennoe_delo_support' }]
        ]
      }
    });
    return;
  }

  // Любое другое сообщение
  await sendTelegram('sendMessage', {
    chat_id: chatId,
    text: 'Используй кнопку ниже чтобы открыть игру 👇',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔤 Открыть игру', web_app: { url: process.env.WEBAPP_URL } }]
      ]
    }
  });
}
