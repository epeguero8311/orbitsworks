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

export interface DocMatch {
  doc: HelpDoc;
  score: number;
}

const DOCS_ROOT = path.join(process.cwd(), "help-docs");
const MATCH_THRESHOLD = 2;
const MIN_PREFIX_LEN = 3;

const STOPWORDS = new Set([
  "a", "an", "the", "how", "do", "i", "we", "you", "to", "for", "is", "are", "in", "on",
  "of", "and", "or", "my", "me", "can", "what", "where", "when", "why", "does", "did",
  "it", "this", "that", "with", "there", "someone", "some", "please", "help", "im", "i'm",
]);

let cachedDocs: HelpDoc[] | null = null;

function loadAllDocs(): HelpDoc[] {
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

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function tokenizeQuery(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= MIN_PREFIX_LEN && b.startsWith(a)) return true;
  if (b.length >= MIN_PREFIX_LEN && a.startsWith(b)) return true;
  return false;
}

function anyMatch(queryToken: string, docTokens: string[]): boolean {
  return docTokens.some((dt) => tokensMatch(queryToken, dt));
}

function scoreFieldTokens(queryTokens: string[], fieldTokens: string[], weight: number): number {
  let score = 0;
  for (const qt of queryTokens) {
    if (anyMatch(qt, fieldTokens)) score += weight;
  }
  return score;
}

function bestKeywordPhraseScore(queryTokens: string[], keywords: string[]): number {
  let best = 0;
  for (const kw of keywords) {
    const kwTokens = tokenize(kw).filter((t) => !STOPWORDS.has(t));
    if (kwTokens.length === 0) continue;
    const matchedCount = kwTokens.filter((kt) => anyMatch(kt, queryTokens)).length;
    const fraction = matchedCount / kwTokens.length;
    // A phrase that reduces to just one leftover generic word after stripping
    // stopwords is a weak, non-specific signal - scale credit by how many
    // meaningful words the keyword actually has, so specificity is rewarded.
    const specificity = Math.min(kwTokens.length, 3) / 3;
    const candidate = fraction * specificity;
    if (candidate > best) best = candidate;
  }
  return best * 8;
}

function scoreDoc(doc: HelpDoc, queryTokens: string[]): number {
  const titleTokens = tokenize(doc.title);
  const headingTokens = tokenize(doc.headings.join(" "));
  const bodyTokens = tokenize(doc.body);

  let score = 0;
  score += scoreFieldTokens(queryTokens, titleTokens, 4);
  score += scoreFieldTokens(queryTokens, headingTokens, 2);
  score += scoreFieldTokens(queryTokens, bodyTokens, 1);
  score += bestKeywordPhraseScore(queryTokens, doc.keywords);

  return score;
}

export function debugSearch(question: string, topN = 5): DocMatch[] {
  const docs = loadAllDocs();
  const queryTokens = tokenizeQuery(question);
  const scored = docs.map((doc) => ({ doc, score: scoreDoc(doc, queryTokens) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

export function searchDocs(question: string): DocMatch | null {
  const docs = loadAllDocs();
  const queryTokens = tokenizeQuery(question);

  let best: DocMatch | null = null;
  for (const doc of docs) {
    const score = scoreDoc(doc, queryTokens);
    if (!best || score > best.score) {
      best = { doc, score };
    }
  }

  if (!best || best.score < MATCH_THRESHOLD) return null;
  return best;
}

export const GREETING_RESPONSE =
  "Hi! I'm here to help with questions about OrbitsWorks - clocking in and out, alerts, reports, and more. What can I help you with?";

const GREETING_PATTERN = /^(hi+|hello+|hey+|hiya|yo|sup|good\s?(morning|afternoon|evening)|hola+|buen[oa]s?\s?(dias|dia|tardes|noches)?)[\s!.,?]*$/i;

export function isGreeting(question: string): boolean {
  return GREETING_PATTERN.test(question.trim());
}