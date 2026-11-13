import { z } from "zod";
import { errorResponse } from "@/lib/apiError";
import { callStructured } from "@/lib/llm";
import { scrapeJobDescription } from "@/lib/parsers/scrapeJd";
import { PARSE_JD_SYSTEM } from "@/lib/prompts/parse";
import { rateLimit } from "@/lib/rateLimit";
import { JDProfileSchema } from "@/lib/schemas";

const BodySchema = z.object({
  text: z.string().max(30_000).optional(),
  url: z.url().optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  try {
    const body = BodySchema.parse(await request.json());
    let raw = body.text?.trim() ?? "";

    if (!raw && body.url) {
      try {
        raw = await scrapeJobDescription(body.url);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error.";
        return Response.json(
          { error: `Couldn't read the job page: ${reason} Please paste the JD text instead.` },
          { status: 422 },
        );
      }
    }
    if (raw.length < 50) {
      return Response.json({ error: "Please provide a job description." }, { status: 400 });
    }

    const jd = await callStructured({
      system: PARSE_JD_SYSTEM,
      user: `<job_description>\n${raw}\n</job_description>`,
      schema: JDProfileSchema,
    });
    return Response.json({ jd, raw });
  } catch (err) {
    return errorResponse(err);
  }
}
