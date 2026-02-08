import ytdl from '@distube/ytdl-core';
import axios from "axios";

export function validateYoutubeURL(url) {
  if (!url || !ytdl.validateURL(url)) {
    throw new Error('Please provide a valid YouTube URL.');
  }
}

async function getVideoInfo(url) {
  let videoInfo;

  try {
    const { data } = await axios.post('https://api.quickdownl.com/youtube-downloads/info', {url});

    videoInfo = data;
  } catch (e) {
    throw e.response.data ?? 'Failed to fetch YouTube video.';
  }

  if (videoInfo.error) {
    throw new Error('Failed to fetch YouTube video.');
  }

  const formats = videoInfo.video;
  let quality = '360';
  let video = '';

  if (formats.find(f => f.quality === '360')) {
    video = formats.find(f => f.quality === '360');
  } else if (formats.find(f => f.quality === '480')) {
    video = formats.find(f => f.quality === '480');
    quality = '480';
  } else if (formats.find(f => f.quality === '720')) {
    video = formats.find(f => f.quality === '720');
    quality = '720';
  }

  return { title: videoInfo.meta.title, resourceId: videoInfo.meta.resourceId, url: video.url, quality };
}

async function requestProcessing(url, resourceId, quality) {
  let response;

  try {
    const { data } = await axios.get(`https://api.quickdownl.com${url}`);

    response = data;
  } catch (e) {
    throw e.response.data ?? 'Failed to process YouTube video.';
  }

  return { taskId: response.taskId, retryDelayMs: response.retryDelayMs };
}

export async function parseYoutubeUrl(url, audioOnly = false) {
  const { title, resourceId, url: videoUrl, quality } = await getVideoInfo(url);

  const { taskId } = await requestProcessing(videoUrl, resourceId, quality);

  const retryDelayMs = 3000;

  await new Promise(resolve => setTimeout(resolve, retryDelayMs));

  let downloadUrl;

  while (!downloadUrl) {
    try {
      const { data } = await axios.get(`https://api.quickdownl.com/youtube-downloads/status/${taskId}`, { params: { resourceId, service: 'master', type: 'video', quality } });

      if (data.error) {
        throw new Error('Failed to process YouTube video.');
      }

      downloadUrl = data.downloadUrl;
    } catch (e) {
      if (e.response?.data?.error === 'Processing') {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      } else {
        throw e.response?.data ?? 'Failed to process YouTube video.';
      }
    }
  }

  return { title, downloadUrl };
}
