import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const pinnedMessageSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  serverId: z.string().min(1),
  /**
   * The reply's provider message id, kept so the panel can address its timeline
   * row. Optional: pins written before this existed have only the composite
   * `id`, and a reply the provider reported no message id for has none at all.
   */
  messageId: z.string().optional(),
  text: z.string().min(1),
  timestamp: z.string().min(1),
  pinnedAt: z.string().min(1),
});

export const pinChatSettings = defineSettings({
  id: "pins",
  scope: "host",
  version: 1,
  schema: z.object({ pins: z.array(pinnedMessageSchema).default([]) }),
});

export type PinnedMessage = z.output<typeof pinnedMessageSchema>;
