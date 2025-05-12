import { config } from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import https from 'https';
import { validateTikTokURL, parseTikTokUrl } from './tiktok.js';
import { validateYoutubeURL, parseYoutubeUrl } from './youtube.js';
import { sleep } from './utils.js';

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

// Handle url as a tiktok command by default.
bot.onText(new RegExp('(\S+)'), async (msg, match) => {
  if (msg.chat.type !== 'private' || match?.at(1)?.startsWith('/')) {
    return;
  }

  await handleTikTokCommand(msg, match);
});

bot.onText(/\/tt (\S+)/, handleTikTokCommand);

bot.onText(/\/yt (\S+) ?(\S+)?/, async (msg, match) => {
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
});

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
