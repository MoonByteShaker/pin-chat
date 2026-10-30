import { usePaseo, useSettings, type PluginButtonContentProps, type PluginHostProps } from "@getpaseo/plugin/client";
import { Icon, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { pinChatSettings } from "../shared/pins";
import { findPin, pinId, togglePin, type PinTarget } from "./pin-actions";

/** Which chat's pins the popover acts on: the pill's own agent's. */
export type PinsPopoverTarget = { workspaceId: string; agentId: string };

/** The host pads the popover itself, so this is only the spacing between rows. */
const PADDING = 12;
/** Enough tail entries that the recent replies are normally inside one page. */
const TIMELINE_LIMIT = 30;
/** How many replies the list offers. Past this the user wants the panel. */
const REPLY_LIST_LIMIT = 10;
/** Per-reply preview cap, so ten rows stay scannable. */
const PREVIEW_HEIGHT = 72;

/**
 * The replies the popover can act on, newest first. Another plugin may own the
 * rendered row — Beautiful Chat claims every assistant message before this
 * plugin's transformer ever runs — so the list is read from the timeline API
 * instead of from what is on screen. That is the whole point of the pill.
 */
type RecentReplies =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "empty" }
  | { status: "ready"; targets: readonly PinTarget[] };

/**
 * The composer pill's popover: pins any of the chat's recent assistant replies
 * and leads to the pinned-messages panel.
 *
 * The per-reply button only exists while this plugin owns the assistant row.
 * Paseo runs the first timeline transformer that claims an item and the catalog
 * is sorted by plugin id, so Beautiful Chat (`beautiful-chat` < `pin-chat`)
 * wins whenever its Assistant markdown preference is on — this plugin's
 * transformer never runs. The pill therefore reads the replies from the
 * timeline API rather than from a rendered row, which is what keeps pinning
 * available no matter which plugin drew them.
 *
 * Built once per client entry, not per pill: the target arrives in the props.
 */
export function createPinsPopover(openPanel: (target: PinsPopoverTarget) => void) {
  return function PinsPopover(props: PluginButtonContentProps) {
    // The union also covers header buttons; a composer pill is always an agent's.
    if (props.context !== "agent") return null;
    return (
      <PinsPopoverBody
        theme={props.theme}
        compact={props.layout.compact}
        serverId={props.host.id}
        target={{ workspaceId: props.workspaceId, agentId: props.agentId }}
        close={props.close}
        openPanel={openPanel}
      />
    );
  };
}

function PinsPopoverBody({
  theme,
  compact,
  serverId,
  target,
  close,
  openPanel,
}: {
  theme: PluginHostProps["theme"];
  compact: boolean;
  serverId: string;
  target: PinsPopoverTarget;
  close: () => void;
  openPanel: (target: PinsPopoverTarget) => void;
}) {
  const { workspaceId, agentId } = target;
  const paseo = usePaseo();
  const settings = useSettings(pinChatSettings);
  const toast = useToast();
  const [replies, setReplies] = useState<RecentReplies>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setReplies({ status: "loading" });

    // An async function, not an async arrow: Hermes evaluates an async arrow in
    // an eval'd bundle to `undefined`.
    async function load(): Promise<void> {
      try {
        const page = await paseo.agents.ref(agentId).timeline.refetch({
          direction: "tail",
          limit: TIMELINE_LIMIT,
          projection: "projected",
        });
        if (!alive) return;
        if (page.error) {
          setReplies({ status: "error", error: page.error });
          return;
        }
        setReplies(readRecentReplies(page.entries, agentId, serverId));
      } catch (cause) {
        if (alive) setReplies({ status: "error", error: cause instanceof Error ? cause.message : String(cause) });
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [paseo, agentId, serverId, attempt]);

  const pinCount = settings.status === "ready" ? settings.values.pins.filter((pin) => pin.agentId === agentId).length : 0;

  const styles = useMemo(
    () => ({
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        marginBottom: PADDING,
      },
      title: { color: theme.colors.foreground, fontSize: 15 },
      open: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, marginLeft: "auto" as const },
      openLabel: { color: theme.colors.accent, fontSize: 13 },
      label: { color: theme.colors.foregroundMuted, fontSize: 12, marginBottom: 6 },
      list: { gap: 8 },
      row: {
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      rowHead: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        marginBottom: 6,
      },
      rowMeta: { color: theme.colors.foregroundMuted, fontSize: 11 },
      toggle: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
      toggleLabel: { fontSize: 12 },
      preview: { maxHeight: PREVIEW_HEIGHT, overflow: "hidden" as const },
      error: { color: theme.colors.statusDanger, fontSize: 12 },
      secondary: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: PADDING, marginLeft: "auto" as const },
    }),
    [theme],
  );

  const handleOpenPanel = useCallback(() => {
    openPanel({ workspaceId, agentId });
    close();
  }, [openPanel, close, workspaceId, agentId]);

  return (
    <View>
      <View style={styles.header}>
        {/* A compact layout presents this as a sheet the host already titles. */}
        {compact ? null : <Text style={styles.title}>Pinned messages</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open pinned messages"
          hitSlop={8}
          style={styles.open}
          onPress={handleOpenPanel}
        >
          <Text style={styles.openLabel}>Open</Text>
          <Icon name="Maximize2" size={13} color={theme.colors.accent} />
        </Pressable>
      </View>

      {replies.status === "loading" ? <Text style={styles.label}>Loading replies…</Text> : null}

      {replies.status === "error" ? (
        <View>
          <Text style={styles.error}>{replies.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading replies"
            hitSlop={8}
            onPress={() => setAttempt((value) => value + 1)}
          >
            <Text style={[styles.openLabel, { marginTop: 8 }]}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {replies.status === "empty" ? (
        <Text style={styles.label}>No assistant reply in this chat yet.</Text>
      ) : null}

      {replies.status === "ready" ? (
        <View>
          <Text style={styles.label}>Recent replies — newest first</Text>
          <View style={styles.list}>
            {replies.targets.map((candidate) => {
              const id = pinId(candidate);
              const pinned = findPin(settings, id) !== null;
              return (
                <View key={id} style={styles.row}>
                  <View style={styles.rowHead}>
                    <Text style={styles.rowMeta}>{formatReplyTime(candidate.timestamp)}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={pinned ? "Unpin this reply" : "Pin this reply"}
                      disabled={settings.saving}
                      onPress={() => void togglePin(settings, toast, candidate)}
                      style={styles.toggle}
                    >
                      <Icon
                        name={pinned ? "PinOff" : "Pin"}
                        size={14}
                        color={pinned ? theme.colors.accent : theme.colors.foregroundMuted}
                      />
                      <Text
                        style={[
                          styles.toggleLabel,
                          { color: pinned ? theme.colors.accent : theme.colors.foregroundMuted },
                        ]}
                      >
                        {pinned ? "Pinned" : "Pin"}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.preview}>
                    <Markdown>{candidate.text}</Markdown>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={styles.secondary}>
            {pinCount === 1 ? "1 pinned here" : `${pinCount} pinned here`}
          </Text>
        </View>
      ) : null}

      {settings.status === "error" ? <Text style={[styles.error, { marginTop: 8 }]}>{settings.error}</Text> : null}
      {settings.status === "invalid" ? (
        <Text style={[styles.error, { marginTop: 8 }]}>Pins cannot be read: {settings.error}</Text>
      ) : null}
      {settings.saveError ? <Text style={[styles.error, { marginTop: 8 }]}>{settings.saveError}</Text> : null}
    </View>
  );
}

/**
 * The reply's own timestamp: an assistant item carries none, so the timeline
 * entry's is the pin's. The row is read from the API, never from the rendered
 * timeline, which is why this works while another plugin draws the reply.
 */
function formatReplyTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The assistant turns in a timeline page, newest first. Capped at
 * REPLY_LIST_LIMIT: the popover is a shortcut, and the panel is where a long
 * history belongs.
 */
function readRecentReplies(
  entries: readonly { item: { type: string }; timestamp: string }[],
  agentId: string,
  serverId: string,
): RecentReplies {
  const targets: PinTarget[] = [];
  for (let index = entries.length - 1; index >= 0 && targets.length < REPLY_LIST_LIMIT; index -= 1) {
    const entry = entries[index];
    const item = entry.item as { type: string; text?: string; messageId?: string };
    if (item.type !== "assistant_message") continue;
    const text = typeof item.text === "string" ? item.text : "";
    if (!text.trim()) continue;
    targets.push({
      agentId,
      serverId,
      messageId: item.messageId ?? "",
      text,
      timestamp: entry.timestamp,
    });
  }
  if (targets.length === 0) return { status: "empty" };
  return { status: "ready", targets };
}
