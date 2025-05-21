# tiktok-tg-downloader

## Description

Bot that allows to download TikTok videos or photos.
Also can download video or audio from YouTube and video from Twitter.
Runs on Node.js.

## Commands

`/tt <tiktok_url>` - Download TikTok video.  
`/yt <youtube_url> <size_mb>` - Download YouTube video.  
`/ym <youtube_url>` - Download YouTube audio.  
`/t <twitter_url>` - Download Twitter video.

## Setup

1. Clone repository.
2. Obtain a bot token from [@BotFather](https://t.me/BotFather).
3. Create a `.env` file in the root directory and add the token to it as in the example.
4. Run `npm install` to install dependencies.
5. Run `npm start` to start the bot.

Bot uses polling to get updates, you can change it to webhooks if you want.  
To deploy - create `tiktog-tg-downloader.service`, deploy automatically restarts it.