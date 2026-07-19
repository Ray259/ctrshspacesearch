/** Prompt construction for turning a natural-language query into an AiSearchPlan. */
export function buildPlanPrompt(query: string, homeDir: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the query planner for a desktop file-search application.
Convert the user's natural-language description of a file they are looking for
into a JSON search plan executed against a local index of file names, paths,
sizes and modification dates (plus a plain-text content scan).

Current date: ${today}
User home directory: ${homeDir}

User query: "${query.replace(/"/g, "'")}"

Respond with ONLY a JSON object — no markdown fences, no commentary — matching:
{
  "summary": string,          // one short sentence restating what is being searched for
  "insight": string,          // 1-2 sentences shown above the result list: how the search was performed and one tip to refine or narrow it
  "keywords": string[],       // short fragments likely to appear in the FILE NAME (may be empty)
  "extensions": string[],     // file extensions including the dot, e.g. [".pdf", ".docx"]; empty if any type
  "contentTerms": string[],   // phrases to look for INSIDE text files; only if the user describes file contents
  "pathHints": string[],      // folder-name fragments, e.g. ["Documents"], ["Downloads"]; empty if unknown
  "modifiedAfter": string | null,   // ISO date "YYYY-MM-DD"; resolve relative dates ("last week") using the current date
  "modifiedBefore": string | null
}

Rules:
- Keep keywords lowercase and short (single words or short fragments).
- Map file-type words to extensions: document -> .doc/.docx/.pdf/.txt/.md, spreadsheet -> .xls/.xlsx/.csv,
  presentation -> .ppt/.pptx, image/photo -> .jpg/.jpeg/.png/.gif/.heic, video -> .mp4/.mov/.mkv, etc.
- Use contentTerms sparingly; only when the query clearly refers to what the file CONTAINS.
- The content scan reads PLAIN-TEXT files only (txt, md, code, csv, json, ...). Binary formats
  (.pdf, .docx, images, ...) can NOT be content-scanned: for those, also put the topic words into
  "keywords" (topics often appear in file names) and mention the limitation in "insight".
- Never invent dates the user did not imply.`;
}

/** Extracts the first JSON object from a model response that may include fences or prose. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model response.');
  return JSON.parse(text.slice(start, end + 1));
}
