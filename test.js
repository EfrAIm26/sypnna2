const ytdl = require('ytdl-core');
const fs = require('fs');
const url = process.argv[2];
(async () => {
  const audioChunks = [];
  const readable = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
  for await (const chunk of readable) {
    audioChunks.push(chunk);
  }
  fs.writeFileSync('downloaded.mp3', Buffer.concat(audioChunks));
  console.log('downloaded');
})();
