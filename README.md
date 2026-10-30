<img src="https://raw.githubusercontent.com/MoonByteShaker/pin-chat/master/icon.png" alt="" width="64" height="64">

# Pin Chat

A plugin for Paseo 0.13.1 and later. Pin an assistant reply, then read it back — in the chat it came from, or across every chat on the host.

Paseo has no bookmark. A long agent conversation is a stream you scroll and lose, and the answer you needed an hour ago is somewhere above. Pin Chat adds the missing gesture: a **Pin** beside *Copy* under any reply, a list of what you kept, and a **Show** that takes you back to the original message.

## Pinning a reply

Under any completed reply, below the text, sits **Pin** next to *Copy* and the timestamp. Click it; the label turns to **Pinned**. Click again to let it go.

Each pin stores the reply's text, the chat it came from, and when it was said — not a link into a scroll position. That is why a pin survives a plugin reload, an app restart, and every other client on the same daemon: another window sees the same list.

## Reading them back

Three ways in, depending on how far you are from the chat:

**The composer pill.** The **Pinned** button in the composer bar, left of *Run*, opens a popover listing this chat's recent replies, newest first, each with its own Pin toggle. It reads them from the timeline rather than from what is on screen, so it works no matter which plugin drew the reply.

**The panel.** **Open** in that popover switches to **Pinned messages** for the current chat. Same view is reachable from the Command Center item **Open pinned messages**.

**The host-wide list.** The panel-sidebar *New tab* menu → *Pinned messages* shows every pin on this host, newest first, each card headed by the chat it came from. That is the one to open when you remember the answer but not the conversation.

In the panel, a card's heading collapses and expands its text, the pin icon on the right unpins it, and **Show** jumps to the reply.

## Show

**Show** on a card takes you to the reply in its chat, scrolls it into view and flashes it, so a pin found in the host-wide list lands on its original message.

This is harder than it should be, because Paseo gives a plugin no way to scroll a chat. The published API is the daemon — agents, workspaces, terminals — with no view state, and `navigation` can open a chat but not aim inside it. Pin Chat therefore names its own timeline rows and then works the DOM the host renders: it looks the row up by that name, and if the reply is too far back to be mounted, it walks the history back the same way Paseo's own Ctrl+F does, by pushing wheel input past the top of the chat container until the row appears. The walk is bounded, so a reply that genuinely is not in the chat ends in a message rather than a hang.

## Coexisting with Beautiful Chat

**Beautiful Chat with *Assistant markdown* on takes the Pin button away.** This is a Paseo limitation, not a choice.

Paseo runs timeline transformers in the order its daemon returns them, which is sorted by plugin id, and keeps only the first one that claims an assistant message. There is no priority field. `beautiful-chat` sorts before `pin-chat`, so while Beautiful Chat is rendering the replies, Pin Chat's transformer never runs and its footer never enters the timeline. Reordering the two is not something a plugin can ask for: a transformer may only emit `type: "plugin"` items, so the native row Paseo hangs its footer off cannot be produced, and a plugin's renderer is only ever resolved inside the plugin that claimed the item.

Two ways out:

- **Turn Beautiful Chat's *Assistant markdown* off.** That hands the reply prose to Paseo's renderer and Pin Chat draws the replies again; every other Beautiful Chat feature — tool callouts, reasoning, fonts, frosted glass, chat search — keeps working. This is the switch to flip if you want the in-row button.
- **Use the composer pill.** It lists the chat's recent replies from the timeline API and pins any of them, so pinning is never unavailable — only the in-row button is. Pinned replies still show **Pinned** on the row whenever Pin Chat does render it.

## Storage

Pins live in host-scoped Paseo settings, not in plugin files, so every client connected to the same daemon shares them and they survive plugin reloads and app restarts.

On disk: `~/.paseo/plugin-settings/pin-chat/pins.json`

## Install

```sh
paseo plugin install pin-chat
```

Or from this repository:

```sh
paseo plugin install https://github.com/MoonByteShaker/pin-chat
```

## Development

```sh
npm install
npm run typecheck
paseo plugin install /path/to/pin-chat
paseo plugin reload pin-chat
```

After a change, `paseo plugin reload pin-chat` recompiles the plugin and republishes its bundle; reload the Paseo window to pick up a new client bundle.

See [OVERVIEW.md](OVERVIEW.md) for the host behaviour each part depends on, with the version it was verified against.

## Limits

- **The per-reply Pin follows the rendering plugin.** See *Coexisting with Beautiful Chat* above.
- **The list is a panel, not a permanent area in the chat body.** Paseo has no API to dock a plugin surface inside a conversation, so the panel is opened from the pill's popover, the Command Center, the *New tab* menu, or the panel location.
- **Show needs Pin Chat to have rendered the reply.** When another plugin owns the rows they carry its names, so there is nothing of Pin Chat's on screen to scroll to. The jump reports that rather than failing silently.

## License

MIT