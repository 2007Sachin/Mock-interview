// pdf-parse's package entry runs debug code when it can't detect a parent
// module (an ESM quirk), so import the implementation file directly.
// @ts-expect-error - pdf-parse ships no types for this path
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = (await pdfParse(buffer)) as { text?: string };
  const text = (result.text ?? '').trim();
  if (!text) {
    throw new Error('Could not extract any text from the PDF.');
  }
  return text;
}
