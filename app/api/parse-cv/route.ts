import { errorResponse } from "@/lib/apiError";
import { callStructured } from "@/lib/llm";
import { extractCvText, MAX_FILE_BYTES } from "@/lib/parsers/extractText";
import { PARSE_CV_SYSTEM } from "@/lib/prompts/parse";
import { rateLimit } from "@/lib/rateLimit";
import { CandidateProfileSchema } from "@/lib/schemas";

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
      return Response.json({ error: "File is larger than 5 MB." }, { status: 400 });
    }

    const text = (await extractCvText(file)).trim();
    if (text.length < 100) {
      return Response.json(
        { error: "Couldn't read text from this file (is it a scanned image?). Try the manual form." },
        { status: 400 },
      );
    }

    const profile = await callStructured({
      system: PARSE_CV_SYSTEM,
      user: `<cv_text>\n${text}\n</cv_text>`,
      schema: CandidateProfileSchema,
    });
    return Response.json({ profile });
  } catch (err) {
    return errorResponse(err);
  }
}
