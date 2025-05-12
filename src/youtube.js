import ytdl from '@distube/ytdl-core';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

const MAX_TELEGRAM_VIDEO_SIZE = 52428800; // 50MB

export function validateYoutubeURL(url) {
  if (!url || !ytdl.validateURL(url)) {
    throw new Error('Please provide a valid YouTube URL.');
  }
}

export async function parseYoutubeUrl(url, audioOnly = false, desiredSizeMb = 20) {
  const videoInfo = await ytdl.getInfo(url);
  const formats = videoInfo.formats;
  let suitableVideoFormats = [];

  if (!audioOnly) {
    suitableVideoFormats = formats.filter(format =>
      format.contentLength
      && format.mimeType?.includes('video')
      && parseInt(format.contentLength, 10) < desiredSizeMb * 1024 * 1024
    );
  }

  const suitableAudioFormats = formats.filter(format =>
    format.contentLength
    && format.mimeType?.includes('audio')
  );

  if ((!audioOnly && suitableVideoFormats.length === 0) || suitableAudioFormats.length === 0) {
    throw new Error('No suitable format found.');
  }

  const tempFileName = `${videoInfo.videoDetails.videoId}_${Date.now()}`;
  let tempFileVideoPath = null;
  let tempFileFinalPath = null;
  const tempFileAudioPath = `./${tempFileName}.mp3`;

  if (!audioOnly) {
    tempFileVideoPath = `./${tempFileName}.mp4`;
    tempFileFinalPath = `./${tempFileName}_result.mp4`

    await downloadFile(url, suitableVideoFormats[0], tempFileVideoPath);
    await downloadFile(url, suitableAudioFormats[0], tempFileAudioPath);
  } else {
    tempFileFinalPath = `./${tempFileName}_result.mp3`
    await downloadFile(url, suitableAudioFormats[0], tempFileFinalPath);
  }

  if (tempFileVideoPath) {
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

    if (fs.statSync(tempFileFinalPath).size > MAX_TELEGRAM_VIDEO_SIZE) {
      throw new Error('The video is too large to send to Telegram. Try specifying a smaller size.');
    }
  }

  return {
    title: videoInfo.videoDetails.title,
    stream: fs.createReadStream(tempFileFinalPath),
    cleanup: () => {
      fs.unlinkSync(tempFileFinalPath);

      if (tempFileVideoPath) {
        fs.unlinkSync(tempFileVideoPath);
        fs.unlinkSync(tempFileAudioPath);
      }
    }
  }
}

async function downloadFile(url, format, tempFilePath) {
  await new Promise((resolve, reject) => {
    const stream = ytdl(url, { format: format });

    const writeStream = fs.createWriteStream(tempFilePath);
    stream.pipe(writeStream);
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}
