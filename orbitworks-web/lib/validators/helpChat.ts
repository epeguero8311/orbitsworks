import { z } from "zod";

export const helpChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

export const helpChatRequestSchema = z.object({
  question: z.string().min(1).max(1000),
  conversationHistory: z.array(helpChatMessageSchema).max(4).default([]),
});

export type HelpChatMessage = z.infer<typeof helpChatMessageSchema>;
export type HelpChatRequest = z.infer<typeof helpChatRequestSchema>;