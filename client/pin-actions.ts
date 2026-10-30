import type { SettingsState } from "@getpaseo/plugin/client";
import type { ToastApi } from "@getpaseo/plugin/client/ui";
import { pinChatSettings, type PinnedMessage } from "../shared/pins";

export type PinSettings = SettingsState<typeof pinChatSettings.schema>;

export interface PinTarget {
  agentId: string;
  /** Host id. The pins document is host-scoped, so it is part of the identity. */
  serverId: string;
  /** Provider message id when the provider reports one. */
  messageId: string;
  text: string;
  /** ISO string. */
  timestamp: string;
}

type PinIdentity = Pick<PinTarget, "agentId" | "serverId" | "messageId" | "timestamp">;

/**
 * Stable identity of one assistant reply. Every affordance — the per-reply
 * button and the composer pill's popover — derives its id here, so pinning from
 * one shows as pinned in the other.
 */
export function pinId(target: PinIdentity): string {
  return `${target.serverId}:${target.agentId}:${target.messageId || target.timestamp}`;
}

/**
 * The `id` a transformed reply carries, which the host turns into the row id
 * `${pluginId}/${id}` and exposes as `data-history-row-id` and
 * `data-message-id`. The pinned-messages panel scrolls to a reply by this
 * value, so it must be derivable from the pin alone and stable across
 * re-renders.
 *
 * Phase is part of it because a reply is transformed once while streaming and
 * again when complete; without it the two would collide on one row id.
 */
export function replyRowId(messageId: string, phase: "streaming" | "complete"): string {
  return `${messageId}|${phase}`;
}

export function findPin(settings: PinSettings, id: string): PinnedMessage | null {
  if (settings.status !== "ready") return null;
  return settings.values.pins.find((pin) => pin.id === id) ?? null;
}

/** Why a write cannot run right now, or null when it can. */
function blockedReason(settings: PinSettings): string | null {
  if (settings.status === "loading") return "Pinned messages are still loading. Try again in a moment.";
  if (settings.status !== "ready") return settings.error || "Pinned messages are not available.";
  if (settings.saving) return "A change is already being saved.";
  return null;
}

/** Pin one reply. Returns whether the document was written. */
export async function pinReply(settings: PinSettings, toast: ToastApi, target: PinTarget): Promise<boolean> {
  const blocked = blockedReason(settings);
  if (blocked !== null) {
    toast.error(blocked);
    return false;
  }
  if (settings.status !== "ready") return false;
  const id = pinId(target);
  if (settings.values.pins.some((pin) => pin.id === id)) return true;
  const saved = await settings.save(
    {
      pins: [
        ...settings.values.pins,
        {
          id,
          agentId: target.agentId,
          serverId: target.serverId,
          ...(target.messageId ? { messageId: target.messageId } : {}),
          text: target.text,
          timestamp: target.timestamp,
          pinnedAt: new Date().toISOString(),
        } satisfies PinnedMessage,
      ],
    },
    settings.revision,
  );
  if (saved) toast.show("Message pinned", { variant: "success" });
  else toast.error(settings.saveError ?? "Could not update pinned messages.");
  return saved;
}

/**
 * Drop one pin by id. Takes an id rather than a target so the pinned-messages
 * list can unpin without reconstructing the reply it came from.
 */
export async function unpinById(settings: PinSettings, toast: ToastApi, id: string): Promise<boolean> {
  const blocked = blockedReason(settings);
  if (blocked !== null) {
    toast.error(blocked);
    return false;
  }
  if (settings.status !== "ready") return false;
  if (!settings.values.pins.some((pin) => pin.id === id)) return true;
  const saved = await settings.save(
    { pins: settings.values.pins.filter((pin) => pin.id !== id) },
    settings.revision,
  );
  if (saved) toast.show("Message unpinned", { variant: "success" });
  else toast.error(settings.saveError ?? "Could not update pinned messages.");
  return saved;
}

/**
 * Flip one reply between pinned and unpinned. The only path the per-reply
 * affordances use; never throws.
 */
export async function togglePin(settings: PinSettings, toast: ToastApi, target: PinTarget): Promise<void> {
  const id = pinId(target);
  const pinned = findPin(settings, id) !== null;
  if (pinned) await unpinById(settings, toast, id);
  else await pinReply(settings, toast, target);
}
