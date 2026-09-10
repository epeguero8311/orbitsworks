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

const LANGUAGE_INSTRUCTION =
  "IMPORTANT: Detect the language of the user's question yourself and respond entirely in that same language, regardless of what language this instruction or the documentation below is written in. If they ask in Spanish, your whole reply must be in Spanish. If they ask in English, reply in English. Never mix languages and never mention that you are translating.";

const SHARED_STYLE_RULES = [
  "Keep answers short and direct, 2-4 sentences unless steps are needed.",
  "Never mention Firestore, database fields, internal collection names, or implementation details.",
  "Do not use asterisks or bold text, the chat window renders plain text only.",
  "When your answer has more than one step or item, put each one on its own line starting with a dash and a space. Leave a blank line between a short intro sentence and the list. Keep each bullet short.",
];

function buildSystemPrompt(doc: HelpDoc): string {
  return [
    "You are the OrbitsWorks in-app help assistant.",
    "Below is a documentation snippet a routing step judged as the best match for this question.",
    "Answer using information found in this snippet. Do not use outside knowledge about OrbitsWorks or any other product.",
    "The user's wording will often differ from the doc's wording (e.g. they say 'convert', 'promote', 'turn into', or 'upgrade' where the doc describes 'invite'). If the snippet describes a process that actually achieves what they're asking for, treat that as answering the question and explain it using that process - do not withhold the answer just because the exact verb differs.",
    "If the snippet doesn't actually cover what they're asking, say you don't have information on that and suggest contacting support@orbitsworks.com. Do not invent steps that aren't in the doc.",
    ...SHARED_STYLE_RULES,
    LANGUAGE_INSTRUCTION,
    "",
    `--- DOC: ${doc.title} ---\n${doc.body}\n--- END DOC ---`,
  ].join("\n");
}

function buildNoMatchSystemPrompt(): string {
  return [
    "You are the OrbitsWorks in-app help assistant.",
    "No documentation was found that answers this question.",
    "Apologize briefly, say you don't have information on that yet, and suggest contacting support@orbitsworks.com.",
    "Do not guess an answer or invent steps.",
    ...SHARED_STYLE_RULES,
    LANGUAGE_INSTRUCTION,
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

export async function askAINoMatch(question: string, history: HelpChatMessage[]): Promise<string> {
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    { role: "user", content: question },
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: MAX_TOKENS,
    system: buildNoMatchSystemPrompt(),
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock
    ? textBlock.text
    : "Sorry, I'm having trouble right now. Please contact support@orbitsworks.com.";
}
