import * as snapsave from './snapsave.cjs';
import fs from 'fs';
import * as https from 'node:https';
import { randomString } from './utils.js';

export function validateInstagramURL(url) {
  if (!url || !/instagram\.com/.test(url)) {
    throw new Error('Please provide a valid Instagram URL.');
  }

  return url;
}

async function downloadFile(url, filename) {
  const file = fs.createWriteStream(filename);

  await new Promise((resolve, reject) => {
    https.get(url, (response) => {
      response.pipe(file);

      file.on('finish', () => file.close(resolve));
      file.on('error', (err) => fs.unlink(filename, () => reject(err)));
    }).on('error', (err) => fs.unlink(filename, () => reject(err)));
  });
}

export async function parseInstagramUrl(url) {
  const response = await snapsave.default(url);

  if (!response.data[0].url) {
    throw new Error('Failed to fetch Instagram URL - not available.');
  }

  const filename = randomString() + '.mp4';

  await downloadFile(response.data[0].url, filename);

  return {
    stream: fs.createReadStream(filename),
    cleanup: () => fs.unlinkSync(filename),
  };
}