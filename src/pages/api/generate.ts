import type { NextApiRequest, NextApiResponse } from 'next';
import { YoutubeTranscript } from 'youtube-transcript';
// We're no longer downloading audio and using Whisper.  Instead, we fetch
// the transcript directly from YouTube using an unofficial API.  This
// approach avoids 410 errors from deprecated YouTube endpoints and the
// complexity of downloading and converting audio on serverless functions.
// See https://www.npmjs.com/package/youtube-transcript for details.

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
  try {
    // Currently we only support YouTube video URLs for which transcripts
    // are available.  The youtube-transcript package accepts either a
    // full URL or a video ID.  It returns an array of transcript
    // segments (objects with `text`, `start`, `duration` properties).
    // We join all text segments together with spaces to form the final
    // transcription.
    const transcriptSegments = await YoutubeTranscript.fetchTranscript(url);
    if (!transcriptSegments || transcriptSegments.length === 0) {
      return res.status(400).json({ error: 'No se encontró una transcripción para este video.' });
    }
    const transcriptionText = transcriptSegments.map((seg: any) => seg.text).join(' ');
    return res.status(200).json({ transcription: transcriptionText });
  } catch (error: any) {
    console.error('Error en /api/generate:', error);
    // Provide a user‑friendly error message if the fetch fails.
    return res.status(500).json({ error: error.message || 'Error al obtener la transcripción.' });
  }
}