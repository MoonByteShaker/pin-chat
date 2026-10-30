# Pin Chat

Pin assistant replies per chat, then read them back either per chat or across the host.

## Use it

1. Open a chat.
2. Below any completed assistant reply, click **Pin** (next to *Copy* and the timestamp).
   The label switches to **Pinned**; click again to unpin.
3. Click **Pinned** in the composer bar (left of *Run*) to open a popover listing the
   chat's recent assistant replies, newest first, each with its own **Pin** toggle. It is
   the fallback while another plugin renders the replies (see *Coexisting with other reply
   renderers*). **Open** switches to the **Pinned messages** panel for the current chat: it
   shows only replies pinned in this chat, newest first.
4. In the panel, each card is compact by default: it shows the source chat and timestamp, **Show**
   jumps to the reply in its chat, and the pin icon on the right unpins it. Click the card heading
   to expand the full pinned reply text; click it again to collapse it.

Other entry points:

- the Command Center item **Open pinned messages** — same per-chat view as the panel;
- the panel-sidebar **New tab** menu → *Pinned messages* — the **host-wide** view: every
  pin on this host, newest first, each card prefixed with the chat title it came from;
- the panel locations of that workspace panel, which show the same host-wide view.

## Jumping to a pinned reply

**Show** on a card switches to the chat the reply came from, scrolls it into view and
flashes it, so a pin found in the host-wide list lands on its original message.

Paseo offers a plugin no way to do this. The published API is the daemon — agents,
workspaces, terminals — and carries no view state; the chat's own `scrollToMessage` lives
on a viewport ref inside the stream layout and is never handed out, and `navigation` can
open a chat but not aim at a row within it.

What the host does expose is the shape of the DOM it renders. Every stream row carries
`data-history-row-id` of the form `${pluginId}/${itemId}/${index}`, and `itemId` is the
`id` Pin Chat puts on its own transformed item. Naming that id is therefore what makes a
reply addressable: the panel looks the row up by it, scrolls the chat's container
(`[data-testid="agent-chat-scroll"]`) and tints the row briefly. Each pin stores its
reply's `messageId` for exactly this purpose.

The chat mounts only a window of rows, so an older reply is often absent altogether.
The host grows that window from its own scroll handling, and repeated wheel input pushing
past the top of the container walks backwards through the conversation a page at a time —
the same path the host's Ctrl+F uses to reach an old match. Pin Chat therefore keeps
stepping back until the row appears or the row count stops moving, which is how the end
of the history is detected without knowing how long the chat is. The walk is bounded by
a wall-clock budget and a stall count, so a pin that is not in the chat ends in a message
rather than a hang.

One limit is inherent and is reported rather than hidden: **another plugin's rows are not
addressable.** When Beautiful Chat owns the replies their rows carry *its* ids, so there
is nothing of ours on screen to scroll to.

## Coexisting with other reply renderers

The per-reply **Pin** only appears while Pin Chat is the plugin that renders the reply.
Paseo runs the first timeline transformer that claims an `assistant_message` and returns
something, there is no priority field on a transformer, and the plugin catalog is sorted
by plugin id on the daemon:

```js
[...this.plugins.values()]
  .map(({ id, clientBundle, requirements }) => ({ id, clientBundle, requirements }))
  .sort((left, right) => left.id.localeCompare(right.id));
```

`beautiful-chat` sorts before `pin-chat`, so while **Beautiful Chat** has *Assistant
markdown* on it claims every assistant message first and Pin Chat's transformer never
runs. Pin Chat's footer then never enters the timeline, and reordering the two is not
something a plugin can ask for — a transformer cannot emit the native item Paseo hangs
its footer off, and a plugin's renderer is only ever resolved inside the plugin that
claimed the item.

**Turn Beautiful Chat's *Assistant markdown* off** to get the per-reply **Pin** back. The
switch only hands the reply prose to Paseo's renderer; Beautiful Chat keeps every other
enhancement — tool callouts, reasoning, fonts, frosted glass, chat search. Pin Chat then
renders the replies and draws **Pin** beside *Copy* and the timestamp.

The composer pill is the fallback while another plugin owns the reply: its popover lists
the chat's recent assistant replies from the timeline API instead of reading a rendered
row, so every reply stays pinnable either way. Both paths write through the same code and
derive the same pin id, so a reply pinned from the pill shows as **Pinned** on the row
whenever Pin Chat renders it — and either way it appears in the list.

## Storage

Pins live in host-scoped Paseo settings (`pin-chat` → `pins`), not in plugin files.
They are shared by every client connected to the same daemon and survive plugin
reloads and app restarts. Each entry records the reply text, the agent id, the
server id, the reply timestamp and — for **Show** — the reply's message id.

On disk: `~/.paseo/plugin-settings/pin-chat/pins.json`.

## Limitations

- **The list is a panel, not a permanent area in the chat body.** Paseo has no API to
  dock a plugin surface permanently inside a conversation, so the panel must be opened
  from the composer pill's popover, the Command Center, the panel-sidebar *New tab* menu,
  or the panel location. The pill and the Command Center item open the per-chat view;
  *New tab* and the panel locations open the host-wide view. The *New tab* catalog only
  lists panels registered with `addWorkspacePanel` — an `addAgentPanel` registration
  never appears there.

- **The per-reply Pin needs Pin Chat to render the reply.** See
  *Coexisting with other reply renderers* above. With another plugin owning assistant
  messages, use the composer pill instead: its popover lists the chat's recent replies
  and pins any of them, so pinning is never unavailable — only the in-row button is.

- **Only replies pinned from Pin Chat's own rows carry a message id.** A pin taken from
  the composer pill records the provider's message id where the provider reports one, so
  **Show** works for it too; a pin whose reply carried no id shows the jump as
  unavailable rather than guessing at a row.

Requires Paseo 0.13.1 or later.
