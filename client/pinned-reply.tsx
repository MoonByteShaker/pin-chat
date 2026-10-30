import { useSettings, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, Icon, Markdown, StreamedText, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { pinChatSettings } from "../shared/pins";
import { findPin, pinId, togglePin } from "./pin-actions";

export const pinnedReplySchema = z.object({
  text: z.string(),
  messageId: z.string(),
  phase: z.enum(["streaming", "complete"]),
});

type PinnedReplyData = z.output<typeof pinnedReplySchema>;

export function PinnedReply({ agentId, item, theme, host, layout, timestamp }: PluginTimelineItemProps<PinnedReplyData>) {
  const settings = useSettings(pinChatSettings);
  const toast = useToast();
  const messageTimestamp = timestamp.toISOString();
  const target = {
    agentId,
    serverId: host.id,
    messageId: item.data.messageId,
    text: item.data.text,
    timestamp: messageTimestamp,
  };
  const pinned = findPin(settings, pinId(target)) !== null;
  const styles = useMemo(
    () => ({
      actions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        marginTop: 8,
      },
      action: { color: theme.colors.foregroundMuted, fontSize: 12 },
      pinAction: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        paddingHorizontal: 4,
        paddingVertical: 3,
      },
      pinLabel: { color: pinned ? theme.colors.accent : theme.colors.foregroundMuted, fontSize: 12 },
      error: { color: theme.colors.statusDanger, fontSize: 12 },
    }),
    [theme, pinned],
  );

  async function copyReply() {
    try {
      await copyText(item.data.text);
      toast.show("Reply copied", { variant: "success" });
    } catch {
      toast.error("Could not copy the reply.");
    }
  }

  return (
    <View>
      {item.data.phase === "streaming" ? (
        <StreamedText text={item.data.text} phase={item.data.phase} />
      ) : (
        <Markdown>{item.data.text}</Markdown>
      )}
      {item.data.phase === "complete" ? (
        <View style={styles.actions}>
          {/* `layout` is the renderer's own responsive hint; compact hosts get no extra chrome. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy assistant reply"
            onPress={() => void copyReply()}
          >
            <Text style={styles.action}>Copy</Text>
          </Pressable>
          <Text style={styles.action}>
            {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={pinned ? "Unpin assistant reply" : "Pin assistant reply"}
            disabled={settings.saving}
            onPress={() => void togglePin(settings, toast, target)}
            style={styles.pinAction}
          >
            <Icon
              name={pinned ? "PinOff" : "Pin"}
              size={14}
              color={pinned ? theme.colors.accent : theme.colors.foregroundMuted}
            />
            <Text style={styles.pinLabel}>{pinned ? "Pinned" : "Pin"}</Text>
          </Pressable>
          {settings.status === "error" ? (
            <Text style={styles.error} numberOfLines={layout.compact ? 2 : undefined}>
              {settings.error}
            </Text>
          ) : null}
          {settings.status === "invalid" ? (
            <Text style={styles.error} numberOfLines={layout.compact ? 2 : undefined}>
              Pins cannot be read: {settings.error}
            </Text>
          ) : null}
          {settings.saveError ? (
            <Text style={styles.error} numberOfLines={layout.compact ? 2 : undefined}>
              {settings.saveError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
