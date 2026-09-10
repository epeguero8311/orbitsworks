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

function buildSystemPrompt(doc: HelpDoc): string {
  return [
    "You are the OrbitsWorks in-app help assistant.",
    "Answer ONLY using the documentation snippet below. Do not use outside knowledge about OrbitsWorks or any other product.",
    "If the question cannot be answered from this snippet, say you don't have information on that and suggest contacting support. Do not guess.",
    "Keep answers short and direct, 2-4 sentences unless steps are needed.",
    "Never mention Firestore, database fields, internal collection names, or implementation details.",
    "Do not use asterisks or bold text, the chat window renders plain text only.",
    "When your answer has more than one step or item, put each one on its own line starting with a dash and a space. Leave a blank line between a short intro sentence and the list. Keep each bullet short.",
    "IMPORTANT: Detect the language of the user's question yourself and respond entirely in that same language, regardless of what language this instruction or the documentation below is written in. If they ask in Spanish, your whole reply must be in Spanish. If they ask in English, reply in English. Never mix languages and never mention that you are translating.",
    "",
    "--- DOC: " + doc.title + " ---",
    doc.body,
    "--- END DOC ---",
  ].join("\n");
}

export async function askAI(question: string, doc: HelpDoc, history: HelpChatMessage[]): Promise<string> {
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    { role: "user", content: question },
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(doc),
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "Sorry, I could not generate a response.";
}