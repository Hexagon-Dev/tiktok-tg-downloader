import ytdl from '@distube/ytdl-core';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import axios from "axios";

export function validateYoutubeURL(url) {
  if (!url || !ytdl.validateURL(url)) {
    throw new Error('Please provide a valid YouTube URL.');
  }
}

export async function parseYoutubeUrl(url, audioOnly = false, desiredSizeMb = 10) {
  if (desiredSizeMb > 50) {
    throw new Error('Max file size for telegram is 50MB, please use lower size.')
  }

  let videoInfo;

  try {
    const { data } = await axios.post('https://downr.org/.netlify/functions/download', { url });
    videoInfo = data;
  } catch (e) {
    throw e.response.data;
  }

  if (videoInfo.error) {
    throw new Error('Failed to fetch YouTube video.');
  }

  const formats = videoInfo.medias;

  const videoFormats = formats.filter(format => format.type === 'video' && format.ext === 'mp4');
  const audioFormats = formats.filter(format => format.type === 'audio' && format.ext === 'm4a');

  let selectedVideo = videoFormats
    .filter(format => (format.bitrate * videoInfo.duration) / 8 / 1024 / 1024 < desiredSizeMb)
    .sort((a, b) => b.bitrate - a.bitrate)[0];

  if (!selectedVideo) {
    selectedVideo = videoFormats.sort((a, b) => a.bitrate - b.bitrate)[0];
  }

  if (!selectedVideo) {
    throw new Error('No suitable video format found.');
  }

  const selectedAudio = audioFormats.sort((a, b) => b.bitrate - a.bitrate)[0];

  if (!selectedAudio) {
    throw new Error('No suitable audio format found.');
  }

  const tempFileName = `${videoInfo.title}_${Date.now()}`;
  const tempFileVideoPath = `./temp/${tempFileName}.mp4`;
  const tempFileAudioPath = `./temp/${tempFileName}.m4a`;
  const tempFileFinalPath = `./temp/${tempFileName}_result.mp4`;

  await Promise.all([
    downloadFile(selectedVideo.url, tempFileVideoPath),
    downloadFile(selectedAudio.url, tempFileAudioPath),
  ]);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(tempFileVideoPath)
      .input(tempFileAudioPath)
      .output(tempFileFinalPath)
      .outputOptions('-c copy')
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  return {
    title: videoInfo.title,
    stream: fs.createReadStream(tempFileFinalPath),
    cleanup: () => {
      fs.unlinkSync(tempFileFinalPath);
      fs.unlinkSync(tempFileVideoPath);
      fs.unlinkSync(tempFileAudioPath);
    }
  };
}

async function downloadFile(url, tempFilePath) {
  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(tempFilePath);

    axios({
      method: 'get',
      url,
      responseType: 'stream',
    })
      .then(response => {
        response.data.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      })
      .catch(reject);
  });
}
