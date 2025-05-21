import { parse } from 'node-html-parser';

export function validateTwitterURL(url) {
  if (!url || !/https:\/\/(x|twitter)\.com/.test(url)) {
    throw new Error('Please provide a valid Twitter URL.');
  }

  return url;
}

export async function parseTwitterUrl(url) {
  const response = await fetch(`https://twitsave.com/info?url=${url}`);

  const text = await response.text();
  const root = parse(text);

  if (root.rawText.includes('Sorry, we could not find any video on this tweet')) {
    throw new Error('Vide not found. Possibly account is private.');
  }

  const videoTag = root.querySelector('video');
  const videoUrl = videoTag?.getAttribute('src');
  
  if (!videoUrl) {
    throw new Error('Failed to fetch Twitter URL, URL is not available.');
  }

  return videoUrl;
}