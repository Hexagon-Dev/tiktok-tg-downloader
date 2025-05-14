import { config } from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import https from 'https';
import { validateTikTokURL, parseTikTokUrl } from './tiktok.js';
import { validateYoutubeURL, parseYoutubeUrl } from './youtube.js';
import { sleep } from './utils.js';
import { getStats, insertMessage } from './analytics.js';

config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN ?? '', { polling: true });

async function handleTikTokCommand(msg, match) {
  const chatId = msg.chat.id;

  try {
    let url = validateTikTokURL(match[1]);

    // Can not define if it is a video or a photo yet.
    await bot.sendChatAction(chatId, 'upload_photo');

    const data = await parseTikTokUrl(url);

    if (Array.isArray(data)) {
      if (data.length === 1) {
        await bot.sendPhoto(chatId, data[0]);
      } else if (data.length < 11) {
        await bot.sendMediaGroup(chatId, data.map((url) => ({ type: 'photo', media: url })));
      } else {
        // If there are more than 10 photos, send them in groups of 10.
        for (const group of data.reduce((acc, url, index) => {
          const groupIndex = Math.floor(index / 10);

          if (!acc[groupIndex]) {
            acc[groupIndex] = [];
          }

          acc[groupIndex].push({ type: 'photo', media: url });
          return acc;
        }, [])) {
          await bot.sendMediaGroup(chatId, group);
          // Sleep for 500ms to avoid hitting the rate limit.
          await sleep(500);
        }
      }
    } else {
      try {
        await bot.sendVideo(chatId, data);
      } catch (e) {
        try {
          https.get(data, async (response) => {
            if (response.statusCode !== 200) {
              throw new Error(`Failed to send video, error: ${response.statusCode} - ${data}`);
            }

            await bot.sendVideo(chatId, response);
          }).on('error', async (error) => bot.sendMessage(chatId, `Failed to fetch video, error: ${error} - ${data}`));
        } catch (e) {
          throw new Error(`Failed to send video, error: ${e} + - ${data}`);
        }
      }
    }
  } catch (error) {
    await bot.sendMessage(chatId, error.message);
  }
}

async function handleYoutubeCommand(msg, match) {
  const chatId = msg.chat.id;
  const url = match?.at(1);
  const desiredSizeMb = (match?.at(2) ?? '') === '' ? 20 : parseInt(match?.at(2) ?? '20', 10);

  try {
    validateYoutubeURL(url);
  } catch (error) {
    await bot.sendMessage(chatId, error.message);

    return;
  }

  await bot.sendChatAction(chatId, 'upload_video');

  try {
    const { title, stream, cleanup } = await parseYoutubeUrl(url, false, desiredSizeMb);

    await bot.sendVideo(chatId, stream, {}, { filename: `${title}.mp4` });

    cleanup();
  } catch (err) {
    await bot.sendMessage(chatId, `Failed sending video: ${err.message}`);
  }
}

bot.onText(/(.+)/, async (msg) => {
  try {
    insertMessage({ id: msg.message_id, chat: msg.chat, user: msg.from, text: msg.text, created_at: msg.date });
  } catch (error) {
    console.error('Failed to insert message:', error);
  }
});

bot.onText(/(\S+)/, async (msg, match) => {
  if (msg.chat.type !== 'private' || match?.at(1)?.startsWith('/')) {
    return;
  }

  const url = match?.at(1) ?? '';

  if (url.includes('tiktok.com')) {
    await handleTikTokCommand(msg, match);
  } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
    await handleYoutubeCommand(msg, match);
  }
});

bot.onText(/\/tt (\S+)/, handleTikTokCommand);

bot.onText(/\/yt (\S+) ?(\S+)?/, handleYoutubeCommand);

bot.onText(/\/ym (\S+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match?.at(1);

  try {
    validateYoutubeURL(url);
  } catch (error) {
    await bot.sendMessage(chatId, error.message);

    return;
  }

  await bot.sendChatAction(chatId, 'upload_voice');

  try {
    const { title, stream, cleanup } = await parseYoutubeUrl(url, true);

    await bot.sendAudio(chatId, stream, {}, { filename: `${title}.mp3` });

    cleanup();
  } catch (err) {
    await bot.sendMessage(chatId, `Failed sending audio: ${err.message}`);
  }
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;

  if (msg.from?.id.toString() !== process.env.TELEGRAM_ADMIN_ID) {
    await bot.sendMessage(chatId, 'You are not authorized to use this command.');

    return;
  }

  try {
    const {
      counts,
      lastMessages,
      lastUsers,
      topUsers,
    } = getStats();

    await bot.sendMessage(chatId, `
Statistics:

Users: ${counts.users}
Chats: ${counts.chats}
Messages: ${counts.messages}

Last messages:\n` +
      lastMessages.map((message) => `- ${message.text} (${message.created_at}) by ${message.user?.username ?? message.user?.first_name ?? 'Unknown'}`).join('\n')
      + `\n\nLast users:\n` +
      lastUsers.map((user) => `- ${user.username ?? user.first_name} (${user.created_at})`).join('\n')
      + `\n\nTop users:\n` +
      topUsers.map((user) => `- ${user.username ?? user.first_name} (${user.message_count} messages)`).join('\n')
    );
  } catch (error) {
    console.error('Failed to get stats:', error);
    await bot.sendMessage(chatId, 'Failed to get stats.');

    return;
  }
});
