import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * API route to transcribe media using AssemblyAI.
 *
 * This implementation downloads the provided media URL to a temporary file,
 * uploads it to AssemblyAI using their upload endpoint, initiates a
 * transcription request and polls until the job is either completed or
 * errors out. Once finished the temporary file is deleted.  A 60‑second
 * timeout is used to avoid long‑running serverless functions.
 */
type Data = { transcription: string } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Falta la URL del recurso' });
  }
  // Ensure the AssemblyAI API key is available
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clave de API no configurada' });
  }
  const tmpFile = path.join(os.tmpdir(), `${Date.now()}`);
  try {
    // Download the media file to a temporary location.  We stream the
    // response body directly into a writable file.  If the download
    // fails or the HTTP status is not OK, an error will be thrown.
    const fetchResp = await fetch(url);
    if (!fetchResp.ok || !fetchResp.body) {
      throw new Error('No se pudo descargar el archivo multimedia');
    }
    // Convert the Web ReadableStream returned by fetch() into a Node.js
    // Readable stream.  Node 18+ exposes Readable.fromWeb which accepts
    // a Web stream and returns a Node stream.  Without this conversion
    // .pipe() would be undefined on the Web stream.
    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(fetchResp.body as any);
    await new Promise<void>((resolve, reject) => {
      const dest = fs.createWriteStream(tmpFile);
      nodeStream.pipe(dest);
      nodeStream.on('error', reject);
      dest.on('finish', () => resolve());
    });

    // Upload the downloaded file to AssemblyAI
    const uploadResp = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        authorization: apiKey,
      },
      body: fs.createReadStream(tmpFile) as any,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      throw new Error(`Error al subir a AssemblyAI: ${errText}`);
    }
    const { upload_url } = (await uploadResp.json()) as { upload_url: string };

    // Create a transcription job
    const createResp = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ audio_url: upload_url }),
    });
    if (!createResp.ok) {
      const err = await createResp.text();
      throw new Error(`Error al iniciar transcripción: ${err}`);
    }
    const { id } = (await createResp.json()) as { id: string };

    // Poll for completion every 5 seconds, up to 60 seconds
    const start = Date.now();
    let transcript;
    while (Date.now() - start < 60000) {
      const statusResp = await fetch(
        `https://api.assemblyai.com/v2/transcript/${id}`,
        {
          headers: { authorization: apiKey },
        }
      );
      if (!statusResp.ok) {
        const err = await statusResp.text();
        throw new Error(`Error al consultar transcripción: ${err}`);
      }
      const data = (await statusResp.json()) as any;
      if (data.status === 'completed') {
        transcript = data.text;
        break;
      }
      if (data.status === 'error') {
        throw new Error(data.error || 'Transcripción fallida');
      }
      // wait 5 seconds before the next poll
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!transcript) {
      throw new Error(
        'La transcripción está tardando demasiado tiempo. Inténtalo de nuevo más tarde.'
      );
    }
    return res.status(200).json({ transcription: transcript });
  } catch (err: any) {
    console.error('Error en /api/generate:', err);
    return res
      .status(500)
      .json({ error: err.message || 'Ocurrió un error inesperado' });
  } finally {
    // Always remove temporary file
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch {}
  }
}