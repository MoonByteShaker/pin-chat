import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { createPinsPopover } from "./client/pin-popover";
import { replyRowId } from "./client/pin-actions";
import { AgentPinsPanel, WorkspacePinsPanel } from "./client/pins-panel";
import { PinnedReply, pinnedReplySchema } from "./client/pinned-reply";

export default function contribute(client: PluginClientContext) {
  const agents = new Map<string, string>();
  const pills = new Map<string, PluginButtonRegistration>();
  const lifetime = new AbortController();

  // One popover for every pill: the host hands each one its own agent in props.
  const PinsPopover = createPinsPopover(({ workspaceId, agentId }) => {
    client.openPanel("chat-pins", { workspaceId, agentId });
  });

  function syncPills(): void {
    for (const [agentId, workspaceId] of agents) {
      if (pills.has(agentId)) continue;
      pills.set(
        agentId,
        client.addComposerPill({
          id: "open-chat-pins",
          workspaceId,
          agentId,
          button: {
            title: "Pin a recent reply or open this chat's pins",
            label: "Pinned",
            icon: "Pin",
            // A popover, not an action: the per-reply button only exists while
            // this plugin wins the assistant row, and the catalog is sorted by
            // plugin id, so Beautiful Chat claims every assistant message
            // first. The pill carries the affordance that survives that.
            behavior: { kind: "popover", Content: PinsPopover },
          },
        }),
      );
    }

    for (const [agentId, registration] of pills) {
      if (agents.has(agentId)) continue;
      registration.remove();
      pills.delete(agentId);
    }
  }

  const subscriptionPromise = client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot({ entries }) {
          agents.clear();
          for (const { agent } of entries) {
            if (agent.workspaceId) agents.set(agent.id, agent.workspaceId);
          }
          syncPills();
        },
        update(message) {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") {
            if (update.agent.workspaceId) agents.set(update.agent.id, update.agent.workspaceId);
            else agents.delete(update.agent.id);
          } else {
            agents.delete(update.agentId);
          }
          syncPills();
        },
      });
      return subscription;
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.error("Could not register Pin Chat shortcuts", error);
      return null;
    });

  client.addCommandCenterItem({
    id: "open-pinned-messages",
    title: "Open pinned messages",
    icon: "Pin",
    context: "agent",
    keywords: ["pins", "saved messages", "chat"],
    onSelect({ openPanel }) {
      openPanel("chat-pins");
    },
  });

  client.addAgentPanel({
    id: "chat-pins",
    title: "Pinned messages",
    icon: "Pin",
    locations: ["workspace", "explorer"],
    Component: AgentPinsPanel,
  });

  // The panel-sidebar "New tab" catalog skips every panel whose context is not
  // "workspace", so the agent panel above alone never shows up there.
  client.addWorkspacePanel({
    id: "chat-pins-workspace",
    title: "Pinned messages",
    icon: "Pin",
    locations: ["workspace", "explorer"],
    Component: WorkspacePinsPanel,
  });

  client.addTimelineTransformer({
    id: "pin-assistant-replies",
    query: { itemType: "assistant_message" },
    transform({ item, phase }) {
      return {
        items: [
          {
            type: "plugin",
            kind: "pinned-assistant-reply",
            version: 1,
            // The host names the DOM row `${pluginId}/${id}` and carries the id
            // through as `data-history-row-id` / `data-message-id`. Naming it
            // ourselves is what makes a reply addressable from the panel: the
            // provider's messageId differs from the id the host gives the row,
            // and the source item id is not passed to a transformer.
            id: replyRowId(item.messageId ?? "", phase),
            data: {
              messageId: item.messageId ?? "",
              text: item.text,
              phase,
            },
          },
        ],
      };
    },
  });

  client.addTimelineRenderer({
    kind: "pinned-assistant-reply",
    version: 1,
    schema: pinnedReplySchema,
    Component: PinnedReply,
  });

  return async () => {
    lifetime.abort();
    for (const registration of pills.values()) registration.remove();
    pills.clear();
    const subscription = await subscriptionPromise;
    await subscription?.release();
  };
}
