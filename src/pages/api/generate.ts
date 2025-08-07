import type { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
// Use the @distube patched version of ytdl-core.  The standard ytdl-core
// library relies on deprecated YouTube endpoints (get_video_info) which
// now return 410 Gone.  The @distube/ytdl-core package tracks upstream
// updates and avoids those obsolete endpoints.  If you see a 410 error
// coming from miniget when downloading a video, it is almost always due
// to an outdated version of ytdl-core.
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import OpenAI from 'openai';

// Initialise the OpenAI client against the OpenRouter proxy.
//
// OpenRouter exposes an OpenAI‑compatible API but does not use the
// `/api/v1` prefix. The older code pointed at `https://openrouter.ai/api/v1`,
// which results in a HTTP 410 from the upstream since that path is not
// supported. See https://openrouter.ai/docs#quickstart for the correct
// base URL. Additionally, the model identifier should be the plain
// `whisper-1` model name instead of the namespaced `openai/whisper-1`.
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  // Point to OpenRouter's OpenAI‑compatible endpoint.  According to the
  // official docs, the base URL should include the `/api/v1` prefix,
  // e.g. https://openrouter.ai/api/v1.  Removing the `/api` segment
  // results in a `410 Gone` response, so be sure to include it.
  baseURL: 'https://openrouter.ai/api/v1',
});

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
  const tmpFile = path.join(os.tmpdir(), `${Date.now()}.mp3`);
  try {
    // Download the audio from the provided URL using ytdl-core
    const audioChunks: Buffer[] = [];
    const readable = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
    for await (const chunk of readable) {
      audioChunks.push(chunk as Buffer);
    }
    const audioBuffer = Buffer.concat(audioChunks);
    fs.writeFileSync(tmpFile, audioBuffer);

    // Request a transcription using the Whisper model. When using
    // OpenRouter, the plain `whisper-1` model name must be specified
    // rather than the namespaced `openai/whisper-1`. See
    // https://openrouter.ai/docs#whisper for details.
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: createReadStream(tmpFile),
    });
    return res.status(200).json({ transcription: transcription.text });
  } catch (error: any) {
    console.error('Error en /api/generate:', error);
    return res
      .status(500)
      .json({ error: error.message || 'Error indefinido' });
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}