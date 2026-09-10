import Anthropic from "@anthropic-ai/sdk";
import type { HelpDoc } from "@/lib/help-chat/searchDocs";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MAX_TOKENS = 20;

function buildSystemPrompt(docs: HelpDoc[]): string {
  const docList = docs
    .map((doc) => {
      const firstHeading = doc.headings[0] || "";
      const keywordList = doc.keywords.join(", ");
      return `slug: ${doc.slug}\ntitle: ${doc.title}\nfirst heading: ${firstHeading}\nkeywords: ${keywordList}`;
    })
    .join("\n\n");

  return [
    "You are a document router for the OrbitsWorks in-app help assistant.",
    "Below is a list of available help documents, each with a slug, title, first heading, and keywords.",
    "The user's question may be in any language. Match it to the ONE document whose content would actually answer it, based on meaning, not literal word overlap.",
    "The user's wording will often differ from a doc's wording (e.g. they say 'convert', 'promote', 'turn into', or 'upgrade' where a doc describes 'invite'). Match on what they're trying to do, not exact phrasing.",
    "Respond with ONLY the slug of the single best-matching document, exactly as written below, and nothing else - no punctuation, no explanation.",
    "If no document would actually answer the question, respond with exactly: none",
    "",
    docList,
  ].join("\n");
}

export async function selectDoc(question: string, docs: HelpDoc[]): Promise<HelpDoc | null> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(docs),
    messages: [{ role: "user", content: question }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : "none";

  if (raw === "none") return null;

  const match = docs.find((d) => d.slug === raw);
  return match ?? null;
}
