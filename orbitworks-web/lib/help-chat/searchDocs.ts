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
const TOP_N = 3;

const STOPWORDS = new Set([
  "a", "an", "the", "how", "do", "i", "we", "you", "to", "for", "is", "are", "in", "on",
  "of", "and", "or", "my", "me", "can", "what", "where", "when", "why", "does", "did",
  "it", "this", "that", "with", "there", "someone", "some", "please", "help", "im", "i'm",
]);

let cachedDocs: HelpDoc[] | null = null;
let cachedIdf: Map<string, number> | null = null;

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

/**
 * Inverse-document-frequency weighting: a token that shows up in almost
 * every doc (e.g. "employee", present in 27/36 docs) is a weak signal and
 * should barely move the score. A token that shows up in only a handful of
 * docs (e.g. "supervisor", present in 11/36) is a strong signal and should
 * dominate. Without this, common nouns in a query drown out the one
 * specific/rare word that actually identifies the right doc.
 */
function buildIdf(docs: HelpDoc[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) {
    const tokensInDoc = new Set<string>([
      ...tokenize(doc.title),
      ...tokenize(doc.headings.join(" ")),
      ...tokenize(doc.body),
      ...doc.keywords.flatMap((k) => tokenize(k)),
    ]);
    for (const t of tokensInDoc) df.set(t, (df.get(t) || 0) + 1);
  }
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [t, count] of df) {
    // Smoothed idf, always positive; ~1x for a token in every doc, scales
    // up sharply for tokens that appear in only one or two docs.
    idf.set(t, Math.log((n + 1) / (count + 0.5)) + 1);
  }
  return idf;
}

// Default idf for a query token that never appears anywhere in the corpus
// (a genuine typo variant, a brand-new term, etc). Treated as maximally
// specific rather than penalized, since an unrecognized word is at least
// as informative as a rare one.
function getIdf(idf: Map<string, number>, token: string): number {
  return idf.get(token) ?? Math.log((idf.size + 1) / 0.5) + 1;
}

function getIdfCache(): Map<string, number> {
  if (!cachedIdf) cachedIdf = buildIdf(loadAllDocs());
  return cachedIdf;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function tokenizeQuery(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

// Classic edit distance. Only called on short-ish tokens (see tokensMatch),
// so the O(n*m) cost here is a non-issue in practice.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

// Typo budget scales with word length so short words (e.g. "in", "add")
// don't accidentally match unrelated short words.
function maxEditDistance(len: number): number {
  if (len >= 8) return 2;
  if (len >= 5) return 1;
  return 0;
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= MIN_PREFIX_LEN && b.startsWith(a)) return true;
  if (b.length >= MIN_PREFIX_LEN && a.startsWith(b)) return true;

  // Fuzzy fallback for typos (e.g. "superviros" -> "supervisor").
  const budget = Math.min(maxEditDistance(a.length), maxEditDistance(b.length) || maxEditDistance(a.length));
  const allowedDistance = Math.max(maxEditDistance(a.length), maxEditDistance(b.length));
  if (allowedDistance > 0 && Math.abs(a.length - b.length) <= allowedDistance) {
    if (levenshtein(a, b) <= allowedDistance) return true;
  }
  return false;
}

function anyMatch(queryToken: string, docTokens: string[]): boolean {
  return docTokens.some((dt) => tokensMatch(queryToken, dt));
}

function scoreFieldTokens(queryTokens: string[], fieldTokens: string[], weight: number, idf: Map<string, number>): number {
  let score = 0;
  for (const qt of queryTokens) {
    if (anyMatch(qt, fieldTokens)) score += weight * getIdf(idf, qt);
  }
  return score;
}

function bestKeywordPhraseScore(queryTokens: string[], keywords: string[], idf: Map<string, number>): number {
  let best = 0;
  for (const kw of keywords) {
    const kwTokens = tokenize(kw).filter((t) => !STOPWORDS.has(t));
    if (kwTokens.length === 0) continue;
    const matchedTokens = kwTokens.filter((kt) => anyMatch(kt, queryTokens));
    const fraction = matchedTokens.length / kwTokens.length;
    // A phrase that reduces to just one leftover generic word after stripping
    // stopwords is a weak, non-specific signal - scale credit by how many
    // meaningful words the keyword actually has, so specificity is rewarded.
    const specificity = Math.min(kwTokens.length, 3) / 3;
    // Weight by how rare the matched words are, so a keyword phrase that
    // only matched on a near-universal word (e.g. "employee") doesn't score
    // the same as one that matched on a distinctive word (e.g. "supervisor").
    const avgIdf = matchedTokens.length > 0
      ? matchedTokens.reduce((sum, t) => sum + getIdf(idf, t), 0) / matchedTokens.length
      : 1;
    const candidate = fraction * specificity * avgIdf;
    if (candidate > best) best = candidate;
  }
  return best * 8;
}

function scoreDoc(doc: HelpDoc, queryTokens: string[], idf: Map<string, number>): number {
  const titleTokens = tokenize(doc.title);
  const headingTokens = tokenize(doc.headings.join(" "));
  const bodyTokens = tokenize(doc.body);

  let score = 0;
  score += scoreFieldTokens(queryTokens, titleTokens, 4, idf);
  score += scoreFieldTokens(queryTokens, headingTokens, 2, idf);
  score += scoreFieldTokens(queryTokens, bodyTokens, 1, idf);
  score += bestKeywordPhraseScore(queryTokens, doc.keywords, idf);

  return score;
}

export function debugSearch(question: string, topN = 5): DocMatch[] {
  const docs = loadAllDocs();
  const idf = getIdfCache();
  const queryTokens = tokenizeQuery(question);
  const scored = docs.map((doc) => ({ doc, score: scoreDoc(doc, queryTokens, idf) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/**
 * Returns up to TOP_N candidate docs above MATCH_THRESHOLD, best first.
 * Previously this returned a single winner - which meant one bad ranking
 * decision (e.g. a generic-noun doc outscoring the actually-relevant one)
 * was fatal, since the AI never saw anything but the #1 pick. Now the AI
 * gets a short list and can pick/combine from it, or honestly say none
 * of them cover the question.
 */
export function searchDocs(question: string): DocMatch[] {
  const docs = loadAllDocs();
  const idf = getIdfCache();
  const queryTokens = tokenizeQuery(question);

  const scored = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, queryTokens, idf) }))
    .filter((m) => m.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, TOP_N);
}

export const GREETING_RESPONSE =
  "Hi! I'm here to help with questions about OrbitsWorks - clocking in and out, alerts, reports, and more. What can I help you with?";

const GREETING_PATTERN = /^(hi+|hello+|hey+|hiya|yo|sup|good\s?(morning|afternoon|evening)|hola+|buen[oa]s?\s?(dias|dia|tardes|noches)?)[\s!.,?]*$/i;

export function isGreeting(question: string): boolean {
  return GREETING_PATTERN.test(question.trim());
}