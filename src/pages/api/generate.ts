import type { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import ytdl from 'ytdl-core';
import fs from 'fs';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
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

    const transcription = await openai.audio.transcriptions.create({
      model: 'openai/whisper-1',
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