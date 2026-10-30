import {
  useAgent,
  useSettings,
  type PluginPanelProps,
  type PluginHostProps,
  type PluginAgentPanelProps,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { Icon, Markdown, ScrollView, useToast } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { pinChatSettings, type PinnedMessage } from "../shared/pins";
import { jumpToReply } from "./jump-to-reply";
import { unpinById } from "./pin-actions";

/**
 * Both registrations share one component; the agent panel only adds
 * `params.agentId`. `navigation` is what makes the jump possible — the host
 * omits it on older clients, and the affordance is hidden rather than dead.
 */
type PinsPanelProps = PluginPanelProps<Readonly<{ agentId?: string }>>;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function PinCard({
  pin,
  showAgent,
  theme,
  layout,
  host,
  navigation,
}: PluginHostProps & {
  pin: PinnedMessage;
  showAgent: boolean;
  navigation: PinsPanelProps["navigation"];
}) {
  const settings = useSettings(pinChatSettings);
  const toast = useToast();
  const agentTitle = useAgent(pin.agentId, (agent) => agent.title);
  const [collapsed, setCollapsed] = useState(false);
  const lifetime = useRef<AbortController | null>(null);

  // The panel outlives a jump, so an in-flight one is cancelled on the way out.
  useEffect(() => () => lifetime.current?.abort(), []);

  const heading = (showAgent ? agentTitle || pin.agentId : "") || formatDate(pin.timestamp);

  async function reveal() {
    const messageId = pin.messageId;
    if (!messageId) {
      toast.error("This pin has no reply to jump to.");
      return;
    }

    lifetime.current?.abort();
    const controller = new AbortController();
    lifetime.current = controller;

    // The chat has to be on screen before its rows exist. Opening it is the
    // host's call; the retry inside `jumpToReply` covers the paint after.
    navigation?.openAgent({ agentId: pin.agentId, serverId: pin.serverId });

    // A pin is always taken from a finished reply, which is the phase the host
    // renders as the settled row.
    const result = await jumpToReply(messageId, "complete", theme.colors.accent, controller.signal);
    if (controller.signal.aborted) return;

    if (result.status === "unavailable") {
      toast.error("Open the chat, then jump again.");
      return;
    }
    if (result.status === "exhausted") {
      toast.error("That reply is not in this chat's history.");
    }
  }

  const styles = useMemo(
    () => ({
      card: {
        gap: 8,
        padding: layout.compact ? 10 : 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      // The heading is the collapse control: it is the row a reader aims at when
      // they want a long pinned message out of the way. The label beside it is
      // the jump, so the two never fight over the same tap.
      toggle: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      toggleText: { flex: 1 },
      agent: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" as const },
      meta: { color: theme.colors.foregroundMuted, fontSize: 12 },
      reveal: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
      revealLabel: { color: theme.colors.accent, fontSize: 12 },
      unpin: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
      unpinLabel: { color: theme.colors.foregroundMuted, fontSize: 12 },
    }),
    [theme, layout.compact],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={collapsed ? `Expand pinned message from ${heading}` : `Collapse pinned message from ${heading}`}
          onPress={() => setCollapsed((value) => !value)}
          style={styles.toggle}
        >
          <Icon
            name={collapsed ? "ChevronRight" : "ChevronDown"}
            size={14}
            color={theme.colors.foregroundMuted}
          />
          <View style={styles.toggleText}>
            {showAgent ? <Text style={styles.agent}>{agentTitle || pin.agentId}</Text> : null}
            <Text style={styles.meta}>{formatDate(pin.timestamp)}</Text>
          </View>
        </Pressable>
        {/* Only offered when the host can actually switch chats. */}
        {navigation ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show this reply in the chat"
            hitSlop={8}
            onPress={() => void reveal()}
            style={styles.reveal}
          >
            <Icon name="Locate" size={13} color={theme.colors.accent} />
            <Text style={styles.revealLabel}>Show</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Unpin this message"
          disabled={settings.saving}
          hitSlop={8}
          onPress={() => void unpinById(settings, toast, pin.id)}
          style={styles.unpin}
        >
          <Icon name="PinOff" size={14} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      {collapsed ? null : <Markdown>{pin.text}</Markdown>}
    </View>
  );
}

function PinsPanel({ theme, layout, params, host, navigation }: PinsPanelProps) {
  const settings = useSettings(pinChatSettings);
  const agentId = params.agentId;
  const styles = useMemo(
    () => ({
      root: {
        flex: 1,
        padding: layout.compact ? 12 : 16,
        gap: 12,
        backgroundColor: theme.colors.surface0,
      },
      title: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted },
      error: { color: theme.colors.statusDanger },
    }),
    [theme, layout.compact],
  );

  if (settings.status === "loading") {
    return <Text style={styles.muted}>Loading pins…</Text>;
  }
  if (settings.status === "error") {
    return <Text style={styles.error}>{settings.error}</Text>;
  }
  if (settings.status === "invalid") {
    return <Text style={styles.error}>Saved pins are invalid: {settings.error}</Text>;
  }

  const pins = settings.values.pins.filter(
    (pin) => pin.serverId === host.id && (agentId === undefined || pin.agentId === agentId),
  );

  const empty = agentId === undefined
    ? "No messages pinned on this host yet."
    : "No messages pinned in this chat yet.";

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Pinned messages</Text>
      {pins.length === 0 ? (
        <Text style={styles.muted}>{empty}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          {[...pins].reverse().map((pin) => (
            <PinCard
              key={pin.id}
              pin={pin}
              showAgent={agentId === undefined}
              theme={theme}
              layout={layout}
              host={host}
              navigation={navigation}
            />
          ))}
        </ScrollView>
      )}
      {settings.saveError ? <Text style={styles.error}>{settings.saveError}</Text> : null}
    </View>
  );
}

/** Per-chat list; reached from the composer pill and the Command Center. */
export function AgentPinsPanel(props: PluginAgentPanelProps) {
  return <PinsPanel {...props} />;
}

/** Host-wide list; the entry the panel-sidebar "New tab" catalog can show. */
export function WorkspacePinsPanel(props: PluginWorkspacePanelProps) {
  return <PinsPanel {...props} />;
}
