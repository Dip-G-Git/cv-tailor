export const PARSE_CV_SYSTEM = `You extract structured data from a candidate's CV text.

Rules:
- Copy facts exactly as written: names, company names, client names, job titles, dates, degrees, certifications. Do not invent anything.
- If a role lists both an employer and a client (e.g., "Infosys - Client: Allianz"), put the employer in "company" and the client in "client".
- "domain" is the industry of the role (e.g., Banking, Insurance, Healthcare, Retail). Infer it from the client/company or project description; use "" if unclear.
- "originalBullets" are the candidate's own experience bullet points/sentences for that role, copied verbatim.
- Dates as written (e.g., "Jan 2020", "2019"); use "Present" for current roles.
- "totalExperienceYears": use the number stated in the CV, otherwise estimate from the dates.
- "headlineTitle": the candidate's current/primary title.
- skills: every technology/tool mentioned; "years" only if the CV states it.
- Missing contact fields: use "".
- Keep experience in the order it appears in the CV (usually most recent first).`;

export const PARSE_JD_SYSTEM = `You extract a structured profile from a job description.

Rules:
- mustHaveSkills: skills/technologies explicitly required.
- niceToHaveSkills: skills described as preferred, a plus, or good to have.
- responsibilities: the main duties, one short phrase each.
- keywords: the ATS keywords a recruiter would search for (technologies, methodologies, certifications, domain terms), deduplicated.
- domain: the industry; seniority: e.g. Junior, Mid, Senior, Lead.
- Use "" for anything not stated.`;
