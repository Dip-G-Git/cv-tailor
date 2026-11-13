import { z } from "zod";
import { errorResponse } from "@/lib/apiError";
import { callStructured } from "@/lib/llm";
import { buildGenerateUserMessage, GENERATE_CV_SYSTEM } from "@/lib/prompts/generateCv";
import { rateLimit } from "@/lib/rateLimit";
import { enforceFidelity, validateCv } from "@/lib/rules";
import { CandidateProfileSchema, GeneratedCVSchema, JDProfileSchema } from "@/lib/schemas";

const BodySchema = z.object({
  profile: CandidateProfileSchema,
  jd: JDProfileSchema,
  jdRaw: z.string().max(30_000),
});

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  try {
    const { profile, jd, jdRaw } = BodySchema.parse(await request.json());
    if (profile.experience.length === 0) {
      return Response.json({ error: "Add at least one work experience entry." }, { status: 400 });
    }

    const baseMessage = buildGenerateUserMessage(
      JSON.stringify(profile, null, 2),
      JSON.stringify(jd, null, 2),
      jdRaw,
    );

    let cv = await callStructured({
      system: GENERATE_CV_SYSTEM,
      user: baseMessage,
      schema: GeneratedCVSchema,
    });
    let violations = validateCv(cv, profile);

    // One retry with the rule violations spelled out.
    if (violations.length > 0) {
      cv = await callStructured({
        system: GENERATE_CV_SYSTEM,
        user: `${baseMessage}

<previous_attempt>
${JSON.stringify(cv)}
</previous_attempt>

Your previous attempt broke these rules. Fix them and return the full corrected CV:
${violations.map((v) => `- ${v}`).join("\n")}`,
        schema: GeneratedCVSchema,
      });
      violations = validateCv(cv, profile);
    }

    return Response.json({ cv: enforceFidelity(cv, profile), warnings: violations });
  } catch (err) {
    return errorResponse(err);
  }
}
