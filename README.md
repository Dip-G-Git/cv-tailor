# CV Tailor

Generate a CV tailored to a job description from your existing CV (or manually entered details), refine it with AI chat, and export it as PDF/DOCX.

## Setup

```bash
npm install
cp .env.example .env.local   # then put your key in ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Get an API key at https://console.anthropic.com. Optional settings in `.env.local`:

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used for all AI calls. `claude-sonnet-5-5` is cheaper. |
| `RATE_LIMIT_PER_MINUTE` | `10` | Max API calls per IP per minute. |

## How it works

1. **Your profile**: upload a CV (PDF/DOCX/TXT, parsed by AI into editable fields) or fill in the form manually.
2. **Job description**: paste the text or fetch it from a URL. The AI extracts skills, responsibilities and ATS keywords.
3. **Tailored CV**: the AI writes the CV and the server enforces the rules:
   - company/client names, job titles, dates, education and certifications are always copied from your profile (`lib/rules.ts` → `enforceFidelity`)
   - exactly 2 bullets are quantified, each stating how the metric was measured (`validateCv`; one automatic retry if broken, otherwise shown as warnings)
   - content not backed by your CV is flagged **AI-suggested – verify** until you click to confirm it
4. **Refine**:
   - hover any CV section for **✎ Edit** (structured form) or **✨ AI suggest** (quick actions or your own instruction → preview → accept/reject). AI suggest covers the headline, summary, skills and each role. Education and certifications are edit-only because they're facts.
   - **chat with the AI** like ChatGPT/Claude: it remembers the conversation, answers questions ("what is missing for this JD?") without touching the CV, and makes any edit you ask for: wording, companies, titles, dates, new/removed roles, education, certifications, skills. Your instructions override the default CV rules. Each edit lists what changed and has a Revert button, and changes are saved to your profile.
   - **layout & formatting, like editing a Word file**, from the chat or the **Layout** panel: page limit ("keep it to 2 pages"), paper size (A4/Letter), font (Arial/Helvetica or Times New Roman), font size, line spacing, margins, header alignment, accent colour, section order, hiding and renaming sections, extra sections (Projects, Languages, Awards…), and **bold** text (`**like this**`)
   - **page limit is measured, not guessed**: the browser renders the real PDF and counts pages (shown next to the export buttons). If the CV is over the limit, the app first tightens margins, spacing and font size (never below 9.5pt), and only then asks the AI to cut content (at most 2 rounds). The result is a single chat entry you can revert.
   - click-to-edit any text, reorder/delete bullets, undo/redo (covers layout changes too)
   - manual edits to facts (name, contact, role titles/dates, education, certifications) are copied back to your profile so AI calls don't revert them
5. **Export**: PDF, DOCX, or copy as plain text.

**Applications overview:** each job application is a record (tailored CV + label + job URL). The **Overview** screen lists them. Edit the label and URL inline, upload a new CV for a record, open, or delete. Inside the editor, the **Working on** dropdown switches between records. Existing single-session data is migrated automatically.

Everything is stored in your browser's localStorage. Nothing is saved on the server. "Clear my data" wipes it.

## Project layout

```
app/api/parse-cv     upload → text (unpdf/mammoth) → CandidateProfile
app/api/parse-jd     text or URL (Readability, SSRF-guarded) → JDProfile
app/api/generate     profile + JD → TailoredCV (validated, fidelity enforced)
app/api/refine       CV + instruction → updated CV
app/api/suggest      CV + one section + instruction → suggestion for that section
lib/prompts/         all AI prompts. Edit these to tune output.
lib/layout.ts        layout defaults, section ordering, fit-to-page steps, **bold** parsing
lib/schemas.ts       zod schemas (also used as Claude structured-output formats)
lib/rules.ts         business-rule validation and enforcement
lib/export/          PDF (@react-pdf/renderer), DOCX (docx), plain text
components/          UI
```

## Deploy

Works on Vercel: `npx vercel`, then set `ANTHROPIC_API_KEY` in the project's environment variables. If the app is public, put authentication in front of it so others can't spend your API credit. The built-in rate limiter is in-memory (per instance).
