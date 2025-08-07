import type { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ytdlp from 'yt-dlp-exec';
import OpenAI from 'openai';

// Initialise the OpenAI client against the OpenRouter proxy. We keep the
// correct baseURL including the `/api/v1` prefix as per the OpenRouter docs.
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// Note: We intentionally omit OpenAI/OpenRouter client usage here.  If you
// decide to switch back to Whisper audio transcription, restore the
// OpenAI client initialization and audio download code.

type Data = { transcription: string } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  const { url } = req.body as { url?: string };
  if (!url) {
    return res.status(400).json({ error: 'Falta la URL del video' });
  }
  // Create a temporary file path for the downloaded audio.  We'll remove
  // the file in a finally block after transcription.
  const tmpFile = path.join(os.tmpdir(), `${Date.now()}.mp3`);
  try {
    // Use yt-dlp-exec to download and extract audio from the provided URL.
    // The options mirror the Python yt-dlp CLI: extract audio, convert to mp3,
    // use the highest quality available and avoid downloading entire playlists.
    await ytdlp(url, {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0,
      output: tmpFile,
      noCheckCertificate: true,
      noWarnings: true,
      preferFreeFormats: true,
      playlistItems: 'no-playlist',
    });

    // Read the audio file and send it to Whisper for transcription.  When
    // using OpenRouter as a proxy, specify the plain model name `whisper-1`.
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: createReadStream(tmpFile),
    });
    return res.status(200).json({ transcription: transcription.text });
  } catch (error: any) {
    console.error('Error en /api/generate:', error);
    return res.status(500).json({ error: error.message || 'Error indefinido' });
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}