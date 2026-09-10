import Anthropic from "@anthropic-ai/sdk";
import type { HelpDoc } from "@/lib/help-chat/searchDocs";
import type { HelpChatMessage } from "@/lib/validators/helpChat";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MAX_TOKENS = 400;

function buildSystemPrompt(docs: HelpDoc[]): string {
  const docBlocks = docs
    .map((doc) => `--- DOC: ${doc.title} ---\n${doc.body}\n--- END DOC ---`)
    .join("\n\n");

  return [
    "You are the OrbitsWorks in-app help assistant.",
    "Below are several documentation snippets that a search step judged as possibly relevant. Not all of them necessarily apply.",
    "Answer ONLY using information found in these snippets. Do not use outside knowledge about OrbitsWorks or any other product.",
    "The user's wording will often differ from the docs' wording (e.g. they say 'convert', 'promote', 'turn into', or 'upgrade' where a doc describes 'invite'). If a snippet describes a process that actually achieves what they're asking for, treat that as answering the question and explain it using that process - do not withhold the answer just because the exact verb differs.",
    "If the answer requires combining steps from more than one snippet, do that naturally in one coherent answer.",
    "Only say you don't have information on something if none of the snippets describe a process that achieves it. Do not invent steps that aren't in the docs, and do not stretch a snippet to answer a genuinely different question.",
    "Keep answers short and direct, 2-4 sentences unless steps are needed.",
    "Never mention Firestore, database fields, internal collection names, or implementation details.",
    "Do not use asterisks or bold text, the chat window renders plain text only.",
    "When your answer has more than one step or item, put each one on its own line starting with a dash and a space. Leave a blank line between a short intro sentence and the list. Keep each bullet short.",
    "IMPORTANT: Detect the language of the user's question yourself and respond entirely in that same language, regardless of what language this instruction or the documentation below is written in. If they ask in Spanish, your whole reply must be in Spanish. If they ask in English, reply in English. Never mix languages and never mention that you are translating.",
    "",
    docBlocks,
  ].join("\n");
}

export async function askAI(question: string, docs: HelpDoc[], history: HelpChatMessage[]): Promise<string> {
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    { role: "user", content: question },
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(docs),
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "Sorry, I could not generate a response.";
}