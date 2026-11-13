import { z } from "zod";
import { errorResponse } from "@/lib/apiError";
import { callStructured } from "@/lib/llm";
import { buildSuggestUserMessage, SUGGEST_SECTION_SYSTEM } from "@/lib/prompts/suggestSection";
import { rateLimit } from "@/lib/rateLimit";
import { protectConfirmations, validateCv } from "@/lib/rules";
import {
  BulletsSuggestionSchema,
  CandidateProfileSchema,
  SectionTargetSchema,
  SkillsSuggestionSchema,
  type SectionSuggestion,
  TailoredCVSchema,
  TextOptionsSuggestionSchema,
} from "@/lib/schemas";

const BodySchema = z.object({
  cv: TailoredCVSchema,
  profile: CandidateProfileSchema,
  jdRaw: z.string().max(30_000),
  target: SectionTargetSchema,
  instruction: z.string().min(1).max(2_000),
});

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  try {
    const { cv, profile, jdRaw, target, instruction } = BodySchema.parse(await request.json());
    if (target.type === "experience" && !cv.experience[target.index]) {
      return Response.json({ error: "That experience entry doesn't exist." }, { status: 400 });
    }

    const user = buildSuggestUserMessage({
      target,
      cv,
      profileJson: JSON.stringify(profile, null, 2),
      jdRaw,
      instruction,
    });

    let suggestion: SectionSuggestion;
    switch (target.type) {
      case "headline":
      case "summary": {
        const out = await callStructured({ system: SUGGEST_SECTION_SYSTEM, user, schema: TextOptionsSuggestionSchema });
        suggestion = { type: target.type, options: out.options.filter((o) => o.trim()), notes: out.notes };
        break;
      }
      case "skills": {
        const out = await callStructured({ system: SUGGEST_SECTION_SYSTEM, user, schema: SkillsSuggestionSchema });
        suggestion = { type: "skills", skills: out.skills, notes: out.notes };
        break;
      }
      case "experience": {
        const withBullets = (bullets: z.infer<typeof BulletsSuggestionSchema>["bullets"]) =>
          protectConfirmations(
            {
              ...cv,
              experience: cv.experience.map((e, i) => (i === target.index ? { ...e, bullets } : e)),
            },
            cv,
          );

        // Follow the user's instruction as given; rule deviations are informational only.
        const out = await callStructured({ system: SUGGEST_SECTION_SYSTEM, user, schema: BulletsSuggestionSchema });
        const violations = validateCv(withBullets(out.bullets), profile, { checkRoleCount: false });
        suggestion = {
          type: "experience",
          index: target.index,
          bullets: withBullets(out.bullets).experience[target.index].bullets,
          notes: out.notes,
          warnings: violations,
        };
        break;
      }
    }

    return Response.json({ suggestion });
  } catch (err) {
    return errorResponse(err);
  }
}
