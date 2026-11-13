import { z } from "zod";

// Note: structured outputs don't support min/max constraints, so schemas used
// as LLM output formats stay constraint-free. Business rules live in lib/rules.ts.

export const PersonalSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  linkedin: z.string(),
  /** Optional GitHub profile URL. */
  github: z.string().optional(),
  location: z.string(),
});

export const ExperienceInputSchema = z.object({
  company: z.string(),
  client: z.string().optional(),
  jobTitle: z.string(),
  domain: z.string(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  originalBullets: z.array(z.string()),
  /** How many bullets the user wants for this role (unset = default 5-6 recent / 3-4 older). */
  bulletCount: z.number().optional(),
  /** How many of this role's bullets should carry a metric (0 = none). Unset on every role = default of 2 across the CV. */
  quantifiedCount: z.number().optional(),
  /** How the user measured the achievement(s) in this role, used as the metric's measurement method. */
  metricMethod: z.string().optional(),
});

export const EducationSchema = z.object({
  degree: z.string(),
  institution: z.string(),
  year: z.string(),
});

export const CertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  year: z.string().optional(),
});

export const CandidateProfileSchema = z.object({
  personal: PersonalSchema,
  totalExperienceYears: z.number(),
  headlineTitle: z.string(),
  /** Years of experience in the core skill/technology of the job title (e.g. 5 years of Mendix). */
  relevantExperienceYears: z.number().optional(),
  skills: z.array(z.object({ name: z.string(), years: z.number().optional() })),
  /** Other skills that are not core technologies (soft skills, methodologies, tools). */
  otherSkills: z.array(z.string()).optional(),
  experience: z.array(ExperienceInputSchema),
  education: z.array(EducationSchema),
  certifications: z.array(CertificationSchema),
});

export const JDProfileSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  mustHaveSkills: z.array(z.string()),
  niceToHaveSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  domain: z.string(),
  seniority: z.string(),
  keywords: z.array(z.string()),
});

export const BulletSourceSchema = z.enum([
  "original",
  "rephrased",
  "ai_suggested",
  "user_confirmed",
]);

export const BulletSchema = z.object({
  text: z.string(),
  isQuantified: z.boolean(),
  metricMethod: z.string().optional(),
  source: BulletSourceSchema,
});

// --- Layout / formatting (Word-style controls) ---
// Every field is optional: the AI may return a partial layout, and CVs saved
// before layout existed still validate. Defaults live in lib/layout.ts.

export const BUILTIN_SECTIONS = ["summary", "skills", "experience", "education", "certifications"] as const;
export type BuiltinSection = (typeof BUILTIN_SECTIONS)[number];

export const LayoutSchema = z.object({
  pageSize: z.enum(["A4", "Letter"]).optional(),
  /** sans = Arial/Helvetica, serif = Times New Roman. */
  fontFamily: z.enum(["sans", "serif"]).optional(),
  /** Body text size in points. */
  fontSize: z.number().optional(),
  /** Line spacing multiplier, e.g. 1.15. */
  lineHeight: z.number().optional(),
  margins: z.enum(["narrow", "normal", "wide"]).optional(),
  headerAlign: z.enum(["center", "left"]).optional(),
  /** Hex colour for the name and section headings, e.g. "#1f3a8a". */
  accentColor: z.string().optional(),
  /** Hard page limit; 0 or absent = no limit. */
  maxPages: z.number().optional(),
  /** Section keys (built-in) or custom section titles, top to bottom. Missing sections keep their default place after the listed ones. */
  sectionOrder: z.array(z.string()).optional(),
  /** Section keys or custom section titles to leave out of the CV. */
  hiddenSections: z.array(z.string()).optional(),
  /** Custom headings for built-in sections. */
  sectionTitles: z
    .object({
      summary: z.string().optional(),
      skills: z.string().optional(),
      experience: z.string().optional(),
      education: z.string().optional(),
      certifications: z.string().optional(),
    })
    .optional(),
});

export const CustomSectionSchema = z.object({
  title: z.string(),
  items: z.array(z.string()),
  /** bullets = "• item" lines, lines = plain lines, inline = one comma-separated paragraph. */
  style: z.enum(["bullets", "lines", "inline"]).optional(),
});

const CvContentSchema = z.object({
  header: PersonalSchema,
  // Optional so CVs saved before this field existed still validate.
  headline: z.string().optional(),
  summary: z.string(),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  experience: z.array(
    z.object({
      company: z.string(),
      client: z.string().optional(),
      jobTitle: z.string(),
      location: z.string().optional(),
      startDate: z.string(),
      endDate: z.string(),
      bullets: z.array(BulletSchema),
    }),
  ),
  education: z.array(EducationSchema),
  certifications: z.array(CertificationSchema),
  atsKeywordCoverage: z.object({
    matched: z.array(z.string()),
    missing: z.array(z.string()),
  }),
});

/** What /api/generate asks the model for: content only, layout is kept from the current CV. */
export const GeneratedCVSchema = CvContentSchema;

export const TailoredCVSchema = CvContentSchema.extend({
  /** Extra sections such as Projects, Languages, Awards, Publications. */
  customSections: z.array(CustomSectionSchema).optional(),
  layout: LayoutSchema.optional(),
});

export const ChatDocumentSchema = z.object({
  title: z.string(),
  /** Markdown. */
  content: z.string(),
});

// "reply" must stay the first property: the chat streams it to the user while the rest is generated.
export const RefineOutputSchema = z.object({
  reply: z.string(),
  changed: z.boolean(),
  changes: z.array(z.string()),
  /** Cover letters, emails, LinkedIn text, interview prep… */
  documents: z.array(ChatDocumentSchema),
  /** Set when the user switched to a different job description in chat. */
  newJobDescription: z.string().optional(),
  cv: TailoredCVSchema.optional(),
});

export type ChatDocument = z.infer<typeof ChatDocumentSchema>;

// --- Per-section AI suggestions ---

export const SectionTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("headline") }),
  z.object({ type: z.literal("summary") }),
  z.object({ type: z.literal("skills") }),
  z.object({ type: z.literal("experience"), index: z.number().int().nonnegative() }),
]);

export const TextOptionsSuggestionSchema = z.object({
  options: z.array(z.string()),
  notes: z.string(),
});

export const SkillsSuggestionSchema = z.object({
  skills: TailoredCVSchema.shape.skills,
  notes: z.string(),
});

export const BulletsSuggestionSchema = z.object({
  bullets: z.array(BulletSchema),
  notes: z.string(),
});

export type SectionTarget = z.infer<typeof SectionTargetSchema>;
export type SectionSuggestion =
  | { type: "headline" | "summary"; options: string[]; notes: string }
  | { type: "skills"; skills: TailoredCV["skills"]; notes: string }
  | { type: "experience"; index: number; bullets: Bullet[]; notes: string; warnings: string[] };

export type CandidateProfile =z.infer<typeof CandidateProfileSchema>;
export type ExperienceInput = z.infer<typeof ExperienceInputSchema>;
export type JDProfile = z.infer<typeof JDProfileSchema>;
export type Bullet = z.infer<typeof BulletSchema>;
export type TailoredCV = z.infer<typeof TailoredCVSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type CustomSection = z.infer<typeof CustomSectionSchema>;

export function emptyProfile(): CandidateProfile {
  return {
    personal: { name: "", email: "", phone: "", linkedin: "", location: "" },
    totalExperienceYears: 0,
    headlineTitle: "",
    skills: [],
    experience: [],
    education: [],
    certifications: [],
  };
}
