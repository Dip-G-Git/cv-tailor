import type { CandidateProfile, TailoredCV } from "./schemas";

const OUTCOME_NUMBER = /\d+(\.\d+)?\s*(%|percent|x\b|hours?|hrs|days|weeks|minutes|ms\b|k\b|\$)|\$\s*\d/i;

/**
 * Returns rule violations as human-readable strings (empty = valid).
 * These are fed back to the model on retry.
 */
export function validateCv(
  cv: TailoredCV,
  profile: CandidateProfile,
  { checkRoleCount = true }: { checkRoleCount?: boolean } = {},
): string[] {
  const errors: string[] = [];

  if (checkRoleCount && cv.experience.length !== profile.experience.length) {
    errors.push(
      `The experience array must have exactly ${profile.experience.length} entries in the same order as candidate_profile.experience (got ${cv.experience.length}).`,
    );
  }

  const bullets = cv.experience.flatMap((e) => e.bullets);
  const quantified = bullets.filter((b) => b.isQuantified);
  // If the user specified quantification for any role, their per-role choices replace the default "exactly 2" rule.
  const perRoleQuant = profile.experience.some((e) => e.quantifiedCount !== undefined);
  if (!perRoleQuant) {
    if (quantified.length !== 2) {
      errors.push(`Exactly 2 bullets must have isQuantified = true (got ${quantified.length}).`);
    }
  }
  // Per-role requirements only make sense when CV roles line up with profile roles.
  if (checkRoleCount && cv.experience.length === profile.experience.length) {
    cv.experience.forEach((role, i) => {
      const src = profile.experience[i];
      const name = `${src.jobTitle || "role"} at ${src.company || "company"}`;
      if (src.bulletCount && role.bullets.length !== src.bulletCount) {
        errors.push(`${name} must have exactly ${src.bulletCount} bullets (got ${role.bullets.length}).`);
      }
      if (perRoleQuant) {
        const want = src.quantifiedCount ?? 0;
        const got = role.bullets.filter((b) => b.isQuantified).length;
        if (got !== want) {
          errors.push(`${name} must have exactly ${want} quantified bullet(s) (isQuantified = true), got ${got}.`);
        }
      }
    });
  }
  for (const b of quantified) {
    if (!b.metricMethod?.trim()) {
      errors.push(`Quantified bullet is missing metricMethod: "${b.text}"`);
    }
  }
  for (const b of bullets) {
    if (!b.isQuantified && OUTCOME_NUMBER.test(b.text)) {
      errors.push(
        `Only the 2 quantified bullets may contain metrics. Remove the numbers from: "${b.text}"`,
      );
    }
  }
  return errors;
}

/**
 * Overwrites facts the model must never change (employer names, titles, dates,
 * header, education, certifications) with the user's source data.
 */
export function enforceFidelity(cv: TailoredCV, profile: CandidateProfile): TailoredCV {
  return {
    ...cv,
    header: { ...profile.personal },
    headline: cv.headline?.trim() || profile.headlineTitle,
    experience:cv.experience.slice(0, profile.experience.length).map((e, i) => {
      const src = profile.experience[i];
      return {
        ...e,
        company: src.company,
        client: src.client || undefined,
        jobTitle: src.jobTitle,
        location: src.location || undefined,
        startDate: src.startDate,
        endDate: src.endDate,
      };
    }),
    education: profile.education,
    certifications: profile.certifications,
  };
}

/** The model may not mark bullets as user-confirmed; only the user can. */
export function protectConfirmations(next: TailoredCV, prev: TailoredCV | null): TailoredCV {
  const confirmed = new Set(
    (prev?.experience ?? [])
      .flatMap((e) => e.bullets)
      .filter((b) => b.source === "user_confirmed")
      .map((b) => b.text.trim()),
  );
  return {
    ...next,
    experience: next.experience.map((e) => ({
      ...e,
      bullets: e.bullets.map((b) =>
        b.source === "user_confirmed" && !confirmed.has(b.text.trim())
          ? { ...b, source: "ai_suggested" as const }
          : b,
      ),
    })),
  };
}

/**
 * The CV is the source of truth for facts the user changed after generation
 * (by hand or via chat): copy header, roles (including added/removed ones),
 * education, certifications and any new skills back into the profile, so later
 * AI calls and regenerates keep them.
 */
export function syncProfileFromCv(profile: CandidateProfile, cv: TailoredCV): CandidateProfile {
  const knownSkills = new Set(profile.skills.map((s) => s.name.trim().toLowerCase()));
  const newSkills = cv.skills
    .flatMap((s) => s.items)
    .filter((name) => {
      const key = name.trim().toLowerCase();
      if (!key || knownSkills.has(key)) return false;
      knownSkills.add(key);
      return true;
    })
    .map((name) => ({ name }));

  // Match CV roles to profile roles by identity, not position, so inserting or
  // removing a role doesn't hand one role's domain/notes to another.
  const used = new Set<number>();
  const sameLength = cv.experience.length === profile.experience.length;
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  const findSource = (e: TailoredCV["experience"][number], i: number) => {
    const tests: ((p: CandidateProfile["experience"][number], j: number) => boolean)[] = [
      (p) => norm(p.company) === norm(e.company) && norm(p.startDate) === norm(e.startDate),
      (p) => norm(p.jobTitle) === norm(e.jobTitle) && norm(p.startDate) === norm(e.startDate),
      (p) => norm(p.company) === norm(e.company) && norm(p.jobTitle) === norm(e.jobTitle),
      (_, j) => sameLength && j === i,
    ];
    for (const test of tests) {
      const j = profile.experience.findIndex((p, k) => !used.has(k) && test(p, k));
      if (j !== -1) {
        used.add(j);
        return profile.experience[j];
      }
    }
    return undefined;
  };

  return {
    ...profile,
    personal: { ...cv.header },
    skills: [...profile.skills, ...newSkills],
    experience: cv.experience.map((e, i) => {
      const src = findSource(e, i);
      return {
        domain: src?.domain ?? "",
        // A role added after generation has no original notes; its CV bullets are the best record.
        originalBullets: src?.originalBullets ?? e.bullets.map((b) => b.text),
        company: e.company,
        client: e.client ?? "",
        jobTitle: e.jobTitle,
        location: e.location ?? "",
        startDate: e.startDate,
        endDate: e.endDate,
        bulletCount: src?.bulletCount,
        quantifiedCount: src?.quantifiedCount,
        metricMethod: src?.metricMethod,
      };
    }),
    education: cv.education,
    certifications: cv.certifications,
  };
}

/**
 * The reverse of syncProfileFromCv: copies facts the user changed on the
 * profile page (header, education, certifications, role titles/dates) into an
 * already-generated CV. Role facts are only copied when the number of roles
 * still matches; adding/removing roles needs a regenerate.
 */
export function applyProfileFacts(cv: TailoredCV, profile: CandidateProfile): TailoredCV {
  const sameRoles = cv.experience.length === profile.experience.length;
  return {
    ...cv,
    header: { ...profile.personal },
    experience: sameRoles ? enforceFidelity(cv, profile).experience : cv.experience,
    education: profile.education,
    certifications: profile.certifications,
  };
}
