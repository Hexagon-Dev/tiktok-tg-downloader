require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.onText(/\/tt (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  let meta;
  const url = match[1];

  if (!url || !/https:\/\/(vm|www)\.tiktok\.com/.test(url)) {
    await bot.sendMessage(chatId, 'Please provide a TikTok URL.');

    return
  }

  try {
    meta = await retry(() => getMeta(url, true));
  } catch (error) {
    await bot.sendMessage(chatId, 'Failed to fetch tiktok url, error: ' + error);

    return;
  }

  if (meta.images.length) {
    if (meta.images.length === 1) {
      await bot.sendPhoto(chatId, meta.images[0]);
    } else if (meta.images.length < 11) {
      await bot.sendMediaGroup(chatId, meta.images.map((url) => ({ type: 'photo', media: url })));
    } else {
      meta.images.reduce((acc, url, index) => {
        const groupIndex = Math.floor(index / 10);

        if (!acc[groupIndex]) {
          acc[groupIndex] = [];
        }

        acc[groupIndex].push({ type: 'photo', media: url });
        return acc;
      }, []).forEach(group => bot.sendMediaGroup(chatId, group));
    }
  } else if (meta.url) {
    try {
      await bot.sendVideo(chatId, meta.url);
    } catch (e) {
      try {
        require('https').get(meta.url, async (response) => {
          if (response.statusCode !== 200) {
            await bot.sendMessage(chatId, 'Failed to send video, error: ' + response.statusCode + ' - ' + meta.url);

            return;
          }

          await bot.sendVideo(chatId, response);
        }).on('error', async (error) => bot.sendMessage(chatId, 'Failed to fetch video, error: ' + error + ' - ' + meta.url));
      } catch (e) {
        await bot.sendMessage(chatId, 'Failed to send video, error: ' + e + ' - ' + meta.url);
      }
    }
  } else {
    await bot.sendMessage(chatId, 'Failed to fetch tiktok url, URL is not available.');
  }
});

const getId = async (url) => {
  // If mobile link, fetch the desktop link first.
  if (/https:\/\/vm/.test(url)) {
    const response = await fetch(url);
    const text = await response.text();
    const matches = text.match(/"canonical":\s*"([^"]+)"/);

    if (!matches[1]) {
      throw new Error('Failed to fetch tiktok video, URL is not available.');
    }

    url = matches[1].replace(/\\u([0-9A-Fa-f]{4})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16)));
  }

  if (url.includes('/t/')) {
    url = await new Promise((resolve) => {
      require('follow-redirects').https.get(url, (res) => resolve(res.responseUrl));
    });
  }
  const matching = url.includes('/video/');
  const matchingPhoto = url.includes('/photo/')
  let idVideo = url.substring(
    url.indexOf('/video/') + 7,
    url.indexOf('/video/') + 26
  );

  if (matchingPhoto)
    idVideo = url.substring(
      url.indexOf('/photo/') + 7,
      url.indexOf('/photo/') + 26
    );
  else if (!matching) {
    throw new Error('Invalid TikTok URL');
  }
  // TikTok ID is usually 19 characters long and sits after /video/
  return idVideo.length > 19 ? idVideo.substring(0, idVideo.indexOf('?')) : idVideo;
};

const getMeta = async (url, watermark) => {
  const id = await getId(url);
  const apiUrl = `https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/?aweme_id=${id}&iid=7318518857994389254&device_id=7318517321748022790&channel=googleplay&app_name=musical_ly&version_code=300904&device_platform=android&device_type=ASUS_Z01QD&version=9`;
  const request = await fetch(apiUrl, {
    method: 'OPTIONS',
    headers: new Headers(),
  });
  const body = await request.text();

  if (body.includes('ratelimit triggered')) {
    throw new Error('Rate limit triggered. Please try again later.');
  }

  let res;
  try {
    res = JSON.parse(body);
  } catch (err) {
    throw new Error('Failed to parse JSON response: ' + err);
  }

  if (!res || res.aweme_list[0].aweme_id?.toString() !== id?.toString()) {
    throw new Error('Video not found or deleted');
  }

  let urlMedia = '';
  let imageUrls = [];

  // Check if video is slideshow
  if (res.aweme_list[0].image_post_info) {
    // get all image urls
    res.aweme_list[0].image_post_info.images.forEach((element) => {
      // url_list[0] contains a webp
      // url_list[1] contains a jpeg
      imageUrls.push(element.display_image.url_list[1]);
    });
  } else if (res.aweme_list[0].video) {
    urlMedia = null;
    const video = res.aweme_list[0].video;

    if (watermark && video.download_addr && video.download_addr.url_list && video.download_addr.url_list.length > 0) {
      // Try to take the smallest video
      if (video.bit_rate) {
        urlMedia = video.bit_rate
          .reduce((lowest, item) => (lowest.bit_rate && item.bit_rate < lowest.bit_rate) ? item : lowest)
          .play_addr.url_list[0];
      }

      if (!urlMedia) {
        urlMedia = video.download_addr.url_list[0];
      }
    }

    if (urlMedia === null) {
      if (video.play_addr && video.play_addr.url_list && video.play_addr.url_list.length > 0) {
        urlMedia = video.play_addr.url_list[0];
      } else {
        throw new Error('Error: video download_addr or play_addr or their url_list is missing.');
      }
    }
  } else {
    throw new Error('Error: video or image_post_info is missing in the aweme object.');
  }

  return {
    url: urlMedia,
    images: imageUrls,
    id: id,
  };
};

async function retry(callback, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callback();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

