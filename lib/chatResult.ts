import "server-only";
import { sanitizeLayout } from "./layout";
import { protectConfirmations, validateCv } from "./rules";
import type { CandidateProfile, ChatDocument, TailoredCV } from "./schemas";
import type { z } from "zod";
import type { RefineOutputSchema } from "./schemas";

export type ChatResult = {
  reply: string;
  changed: boolean;
  changes: string[];
  documents: ChatDocument[];
  newJobDescription?: string;
  cv?: TailoredCV;
  warnings: string[];
};

/**
 * Post-processes a chat/refine answer. The user is in full control in chat:
 * no fact enforcement and no retries; rule deviations are informational only.
 */
export function finalizeChatResult(
  result: z.infer<typeof RefineOutputSchema>,
  cv: TailoredCV,
  profile: CandidateProfile,
): ChatResult {
  const documents = (result.documents ?? []).filter((d) => d.content.trim());
  const newJobDescription = result.newJobDescription?.trim() || undefined;
  if (!result.changed || !result.cv) {
    return { reply: result.reply, changed: false, changes: [], documents, newJobDescription, warnings: [] };
  }
  const updated = protectConfirmations(
    {
      ...result.cv,
      headline: result.cv.headline?.trim() || cv.headline,
      // If the model leaves these out, keep what the CV already had.
      customSections: result.cv.customSections ?? cv.customSections,
      layout: sanitizeLayout(result.cv.layout ?? cv.layout),
    },
    cv,
  );
  return {
    reply: result.reply,
    changed: true,
    changes: result.changes,
    documents,
    newJobDescription,
    cv: updated,
    warnings: validateCv(result.cv, profile, { checkRoleCount: false }),
  };
}
