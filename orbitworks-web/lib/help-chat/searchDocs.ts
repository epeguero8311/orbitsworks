import fs from "fs";
import path from "path";
import matter from "gray-matter";

export interface HelpDoc {
  slug: string;
  category: string;
  title: string;
  keywords: string[];
  body: string;
  headings: string[];
}

const DOCS_ROOT = path.join(process.cwd(), "help-docs");

let cachedDocs: HelpDoc[] | null = null;

export function loadAllDocs(): HelpDoc[] {
  if (cachedDocs) return cachedDocs;

  const docs: HelpDoc[] = [];
  const categories = fs.readdirSync(DOCS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const categoryDir of categories) {
    const categoryPath = path.join(DOCS_ROOT, categoryDir.name);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      const raw = fs.readFileSync(path.join(categoryPath, file), "utf8");
      const { data, content } = matter(raw);
      const headings = (content.match(/^##\s+(.+)$/gm) || []).map((h) => h.replace(/^##\s+/, ""));

      docs.push({
        slug: `${categoryDir.name}/${file.replace(/\.md$/, "")}`,
        category: categoryDir.name,
        title: data.title || file,
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        body: content,
        headings,
      });
    }
  }

  cachedDocs = docs;
  return docs;
}

export const GREETING_RESPONSE =
  "Hi! I'm here to help with questions about OrbitsWorks - clocking in and out, alerts, reports, and more. What can I help you with?";

const GREETING_PATTERN = /^(hi+|hello+|hey+|hiya|yo|sup|good\s?(morning|afternoon|evening)|hola+|buen[oa]s?\s?(dias|dia|tardes|noches)?)[\s!.,?]*$/i;

export function isGreeting(question: string): boolean {
  return GREETING_PATTERN.test(question.trim());
}
