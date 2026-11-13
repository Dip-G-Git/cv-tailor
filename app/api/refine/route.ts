import { z } from "zod";
import { errorResponse } from "@/lib/apiError";
import { finalizeChatResult } from "@/lib/chatResult";
import { callStructured } from "@/lib/llm";
import { buildRefineUserMessage, REFINE_CV_SYSTEM } from "@/lib/prompts/refineCv";
import { rateLimit } from "@/lib/rateLimit";
import { CandidateProfileSchema, RefineOutputSchema, TailoredCVSchema } from "@/lib/schemas";

const MAX_HISTORY_TURNS = 12;

const BodySchema = z.object({
  cv: TailoredCVSchema,
  profile: CandidateProfileSchema,
  jdRaw: z.string().max(30_000),
  instruction: z.string().min(1).max(2_000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
    .default([]),
  /** Page count of the current CV as rendered to PDF in the browser. */
  pageCount: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  try {
    const { cv, profile, jdRaw, instruction, history, pageCount } = BodySchema.parse(await request.json());
    const baseMessage = buildRefineUserMessage(
      JSON.stringify(cv, null, 2),
      JSON.stringify(profile, null, 2),
      jdRaw,
      history.slice(-MAX_HISTORY_TURNS).map((t) => ({ ...t, text: t.text.slice(0, 2_000) })),
      instruction,
      pageCount,
    );

    const result = await callStructured({
      system: REFINE_CV_SYSTEM,
      user: baseMessage,
      schema: RefineOutputSchema,
    });

    return Response.json(finalizeChatResult(result, cv, profile));
  } catch (err) {
    return errorResponse(err);
  }
}
