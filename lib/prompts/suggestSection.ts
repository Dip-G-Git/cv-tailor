import type { SectionTarget, TailoredCV } from "../schemas";
import { GENERATE_CV_SYSTEM } from "./generateCv";

export const SUGGEST_SECTION_SYSTEM = `You improve ONE section of an existing tailored CV at a time, following the user's instruction.

Rules:
- Only produce content for the requested section; the rest of the CV is context.
- The candidate is in full control: carry out their explicit instruction exactly, even if it adds content that isn't in their profile or breaks a default rule below (e.g. more quantified bullets). Do not refuse or lecture.
- When the instruction doesn't say otherwise, follow the original CV rules below as defaults.
- Bullets: content the candidate explicitly asked for → source = "rephrased"; content you invent on your own initiative that isn't backed by the profile → source = "ai_suggested".
- "notes" is one short sentence telling the user what you changed and why.

Original CV rules (defaults; the candidate's explicit instructions override them):
${GENERATE_CV_SYSTEM}`;

export function sectionTask(target: SectionTarget, cv: TailoredCV): string {
  switch (target.type) {
    case "headline":
      return `Section: HEADLINE (the small job title under the candidate's name).
Return 3 alternative headlines in "options", each max 8 words, matching the JD's role title (by default staying truthful to the candidate's experience; follow the candidate's instruction if it says otherwise).`;
    case "summary":
      return `Section: PROFESSIONAL SUMMARY.
Return 3 alternative summaries in "options", each 3-4 lines, following rule 6.`;
    case "skills":
      return `Section: SKILLS.
Return the complete improved skills list in "skills" (categories with items), following rule 7. By default include only skills present in the candidate profile, but add any skill the candidate asks for.`;
    case "experience": {
      const role = cv.experience[target.index];
      const quantifiedElsewhere = cv.experience
        .filter((_, i) => i !== target.index)
        .flatMap((e) => e.bullets)
        .filter((b) => b.isQuantified).length;
      const quantifiedHere = Math.max(0, 2 - quantifiedElsewhere);
      return `Section: WORK EXPERIENCE entry #${target.index + 1}: ${role.jobTitle} at ${role.company}${role.client ? ` (client: ${role.client})` : ""}, ${role.startDate} - ${role.endDate}.
Return the complete bullet list for this role only in "bullets".
The other roles already contain ${quantifiedElsewhere} quantified bullet(s), so by default this role should contain ${quantifiedHere} bullet(s) with isQuantified = true (unless the candidate asks for a different number) (each with metricMethod and the measurement method stated in the text). By default, other bullets contain no outcome numbers.
Keep bullets with source "user_confirmed" unless the instruction explicitly asks to change them.`;
    }
  }
}

export function buildSuggestUserMessage(opts: {
  target: SectionTarget;
  cv: TailoredCV;
  profileJson: string;
  jdRaw: string;
  instruction: string;
}) {
  return `<candidate_profile>
${opts.profileJson}
</candidate_profile>

<job_description>
${opts.jdRaw}
</job_description>

<current_cv>
${JSON.stringify(opts.cv, null, 2)}
</current_cv>

<task>
${sectionTask(opts.target, opts.cv)}
</task>

<user_instruction>
${opts.instruction}
</user_instruction>`;
}
