import followRedirects from 'follow-redirects';
import { retry } from './utils.js';

export function validateTikTokURL(url) {
  if (!url || !/https:\/\/(vm|vt|www)\.tiktok\.com/.test(url)) {
    throw new Error('Please provide a valid TikTok URL.');
  }

  // Replace vt with vm, vt videos are for Asia region and can not be downloaded.
  if (/https:\/\/vt|\.tiktok\.com/.test(url)) {
    url = url.replace('vt.', 'vm.');
  }

  return url;
}

export async function parseTikTokUrl(url) {
  let meta;

  try {
    meta = await retry(() => getMeta(url, true));
  } catch (error) {
    throw new Error(`Failed to fetch tiktok url, error: ${error.message}`);
  }

  if (meta.images.length) {
    return meta.images;
  } else if (meta.url) {
    return meta.url;
  } else {
    throw new Error('Failed to fetch tiktok url, URL is not available.');
  }
}

const getId = async (url) => {
  // If mobile link, fetch the desktop link first.
  if (/https:\/\/vm/.test(url)) {
    const response = await fetch(url);
    const text = await response.text();
    const matches = text.match(/"canonical":\s*"([^"]+)"/);

    if (!matches?.at(1)) {
      throw new Error('Failed to fetch tiktok video, URL is not available.');
    }

    url = matches[1].replace(/\\u([0-9A-Fa-f]{4})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16)));
  }

  if (url.includes('/t/')) {
    url = await new Promise((resolve) => {
      followRedirects.https.get(url, (res) => resolve(res.responseUrl));
    });
  }

  const matching = url.includes('/video/');
  const matchingPhoto = url.includes('/photo/')
  let videoId = url.substring(url.indexOf('/video/') + 7, url.indexOf('/video/') + 26);

  if (matchingPhoto)
    videoId = url.substring(
      url.indexOf('/photo/') + 7,
      url.indexOf('/photo/') + 26
    );
  else if (!matching) {
    throw new Error('Invalid TikTok URL');
  }

  // TikTok ID is usually 19 characters long and sits after /video/.
  return videoId.length > 19 ? videoId.substring(0, videoId.indexOf('?')) : videoId;
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
    throw new Error(`Failed to parse JSON response: ${err.message}`);
  }

  if (!res || res.aweme_list[0].aweme_id?.toString() !== id?.toString()) {
    throw new Error('Video not found or deleted.');
  }

  let urlMedia = null;
  let imageUrls = [];

  // Check if video is a slideshow.
  if (res.aweme_list[0].image_post_info) {
    // Get all image urls.
    res.aweme_list[0].image_post_info.images.forEach((element) => {
      // url_list[0] contains a webp.
      // url_list[1] contains a jpeg.
      imageUrls.push(element.display_image.url_list[1]);
    });
  } else if (res.aweme_list[0].video) {
    const video = res.aweme_list[0].video;

    if (watermark && video.download_addr && video.download_addr.url_list && video.download_addr.url_list.length > 0) {
      // Try to take the smallest video.
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
