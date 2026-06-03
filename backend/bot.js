import dotenv from 'dotenv';
dotenv.config();
import pool from './db.js';
import { getOrCreateUser } from './routes/auth.js';

async function sendTelegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
      id: tgUser.id,
      username: tgUser.username,
      first_name: tgUser.first_name
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

    // Сначала отправляем гифку
    await sendTelegram('sendAnimation', {
      chat_id: chatId,
      animation: 'AAMCAgADGQEDK5r8ah1YM1D5PObsXjzPwrPXYfTYCPQAAqqdAAJLMfBIrftSnohblQUBAAdtAAM7BA',
    });

    // Потом приветственное сообщение с кнопками
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `👋 Привет, ${tgUser.first_name}!\n\n🔤 *Буквенное дело* — детективные головоломки в стиле поиска слов.\n\n*Как играть:*\n• Ищи слова в сетке букв — в любом направлении\n• 2 слова из списка отсутствуют в сетке — они часть разгадки\n• Из оставшихся букв сложится место преступления\n\nГотов раскрыть первое дело?`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔤 Открыть игру', web_app: { url: process.env.WEBAPP_URL } }],
          [{ text: '❓ Как играть', url: `${process.env.WEBAPP_URL}/help.html` }],
          [{ text: '📩 Поддержка', url: 'https://t.me/bukv_support' }]
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
      text: `❓ *Как играть в Буквенное дело*\n\n1️⃣ Открой дело и изучи список слов\n2️⃣ Найди слова в сетке букв — они могут идти в любом направлении\n3️⃣ *Важно:* 2 слова из списка в сетке отсутствуют\n4️⃣ Оставшиеся буквы сложатся в место преступления\n5️⃣ Впиши ответы и раскрой дело!\n\n💡 Есть одна подсказка — используй с умом`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔤 Открыть игру', web_app: { url: process.env.WEBAPP_URL } }]
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
      text: `🔓 *Подписка — все дела*\n\n• 199₽ — на месяц\n• 990₽ — навсегда ⭐️\n\nОткрой все дела и раскрывай новые преступления каждую неделю!`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔓 Оформить подписку', url: `${process.env.WEBAPP_URL}/subscribe.html` }]
        ]
      }
    });
    return;
  }

  // /cancel — отмена подписки
  if (text === '/cancel') {
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `❌ *Отмена автопродления подписки*

` +
            `Чтобы отменить автоматическое продление подписки:

` +
            `1️⃣ Напишите нам в поддержку
` +
            `2️⃣ Укажите ваш Telegram ID: \`${tgUser.id}\`
` +
            `3️⃣ Мы отменим автопродление в течение 24 часов

` +
            `После отмены подписка останется активной до конца оплаченного периода.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📩 Написать в поддержку', url: 'https://t.me/bukv_support' }],
          [{ text: '◀️ Назад к игре', web_app: { url: process.env.WEBAPP_URL } }]
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
      text: `📩 *Поддержка*\n\nЕсли возникли вопросы или проблемы — напиши нам, поможем!`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📩 Написать в поддержку', url: 'https://t.me/bukv_support' }]
        ]
      }
    });
    return;
  }

  // fallback
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
