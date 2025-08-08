import type { NextApiRequest, NextApiResponse } from 'next';
/**
 * API route to obtain a transcript for a video URL using the SupaData
 * YouTube/TikTok/Instagram transcript API.  This implementation forwards
 * the URL to SupaData with the appropriate query parameters and returns
 * the plain‑text transcription.
 *
 * SupaData supports a variety of hosts (YouTube, TikTok, Instagram, X and
 * more) and will return an existing transcript or generate one on the fly.
 * The `text=true` flag instructs the API to return a plain text transcript
 * rather than timestamped segments, while `mode=auto` allows the service
 * to decide whether to use a native transcript or generate one.
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

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clave de API no configurada' });
  }

  try {
    // Construct the request URL.  We URL‑encode the video URL to ensure
    // correct transmission through query parameters.
    const query = new URLSearchParams({
      url: url,
      text: 'true',
      mode: 'auto',
    }).toString();
    const apiUrl = `https://api.supadata.ai/v1/transcript?${query}`;
    const response = await fetch(apiUrl, {
      headers: {
        'x-api-key': apiKey,
      },
    });
    if (!response.ok) {
      // Attempt to parse error message from JSON if available
      let errMsg = `Error en solicitud: HTTP ${response.status}`;
      try {
        const errData = await response.json();
        errMsg = errData?.error || errMsg;
      } catch {
        const text = await response.text();
        errMsg = text || errMsg;
      }
      throw new Error(errMsg);
    }
    const data = (await response.json()) as any;
    const transcription: string | undefined = data?.content || data?.text;
    if (!transcription) {
      throw new Error('Respuesta inesperada del servidor');
    }
    return res.status(200).json({ transcription });
  } catch (err: any) {
    console.error('Error en /api/generate:', err);
    return res.status(500).json({ error: err.message || 'Ocurrió un error inesperado' });
  }
}