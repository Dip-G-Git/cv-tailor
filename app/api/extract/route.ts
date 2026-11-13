import { errorResponse } from "@/lib/apiError";
import { extractCvText, MAX_FILE_BYTES } from "@/lib/parsers/extractText";
import { rateLimit } from "@/lib/rateLimit";

const MAX_CHARS = 40_000;

/** Extracts text from a chat attachment (PDF, DOCX, TXT/MD). */
export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: `${file.name} is larger than 5 MB.` }, { status: 400 });
    }
    const text = (await extractCvText(file)).trim();
    if (!text) {
      return Response.json({ error: `Couldn't read any text from ${file.name}.` }, { status: 400 });
    }
    return Response.json({ text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS });
  } catch (err) {
    return errorResponse(err);
  }
}
