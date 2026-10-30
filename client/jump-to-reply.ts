import { replyRowId } from "./pin-actions";

/**
 * Scroll a pinned reply into view and flash it, from the pinned-messages panel.
 *
 * There is no supported way to do this. `PaseoApi` exposes the daemon —
 * agents, workspaces, terminals — and no view state; the chat's own
 * `scrollToMessage` lives on a viewport ref inside the stream layout and is
 * never handed to a plugin. The plugin's `navigation.openAgent` opens a chat
 * but cannot aim at a row.
 *
 * Two facts about the host's DOM carry the feature:
 *
 * - Every stream row carries `data-history-row-id` of the shape
 *   `${pluginId}/${itemId}/${index}`, and `itemId` is the `id` this plugin puts
 *   on its transformed item. Naming that id is what makes a reply addressable
 *   from outside the renderer.
 * - The chat keeps only a window of rows mounted, and the host grows that
 *   window from its own scroll handling: repeated wheel input pushing past the
 *   top of the container walks backwards through the conversation, one step at
 *   a time. That is the same path the host's Ctrl+F uses to reach an old match.
 *
 * So a miss is not a dead end. This module scrolls the container to the top and
 * dispatches wheel input until the row appears or two consecutive pushes stop
 * making progress, which is how the end of the history is detected without
 * knowing the row count.
 *
 * One limit is inherent and is reported rather than hidden: another plugin that
 * claimed the replies (Beautiful Chat with *Assistant markdown* on) owns their
 * rows and gives them its own ids, so nothing of ours is on screen to scroll
 * to.
 */

/** Upper bound on the walk. A long conversation needs many steps, but not endless ones. */
const WALK_BUDGET_MS = 6000;
/** How long a single step may take before the walk gives up on the host. */
const STEP_SETTLE_MS = 80;
/** How far past the top one wheel gesture pushes. */
const WHEEL_DELTA_Y = -1400;
/**
 * Consecutive steps without the row count moving that mean the history is
 * exhausted. More than one, because a step can land mid-render.
 */
const STALLED_STEPS = 3;
/** How often to look for the chat's container while it opens. */
const ATTACH_INTERVAL_MS = 100;
/** How long to keep looking for the container before reporting it absent. */
const ATTACH_DEADLINE_MS = 3000;
/** The row the host builds for one of this plugin's items. */
const ROW_SELECTOR_PREFIX = "pin-chat/";
/** How far below the top edge a jumped-to reply lands. */
const TOP_INSET_PX = 12;
/** How long the reply stays highlighted after the jump. */
const FLASH_MS = 1600;
/** The animation a serialized markdown field needs to accept. */
const FLASH_TRANSITION = "background-color 400ms ease-out";

export type JumpResult =
  | { status: "jumped" }
  /** No chat on screen to walk — the jump needs one opened first. */
  | { status: "unavailable" }
  /** The chat is there and its history was walked to the end, but no such row. */
  | { status: "exhausted" };

/**
 * The scroll container the chat rows live in. The host marks it with a test id
 * stable across the two rendering strategies it picks between.
 */
const CHAT_SCROLLER_SELECTOR = '[data-testid="agent-chat-scroll"]';

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  window.setTimeout(resolve, ms);
  return promise;
}

/** How many rows the chat currently has mounted. Doubles as the walk's progress signal. */
function mountedRowCount(): number {
  return document.querySelectorAll("[data-history-row-id]").length;
}

/**
 * The row for one of this plugin's items, matched on the id we assigned it.
 *
 * Matched by prefix: the host appends the row's index, so the value is
 * `${pluginId}/${itemId}/${index}` and the index is not ours to predict.
 */
function findRow(messageId: string, phase: "streaming" | "complete"): HTMLElement | null {
  if (!messageId) return null;
  const rowId = `${ROW_SELECTOR_PREFIX}${replyRowId(messageId, phase)}`;
  const rows = document.querySelectorAll<HTMLElement>("[data-history-row-id]");
  for (const row of rows) {
    if (row.getAttribute("data-history-row-id")?.startsWith(rowId)) return row;
  }
  return null;
}

/** Center-ish placement that leaves the reply's first line just below the top edge. */
function scrollIntoView(scroller: HTMLElement, row: HTMLElement): void {
  const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop += offset - TOP_INSET_PX;
}

/**
 * Ask for one more step of older history.
 *
 * The container is pinned to the top and given a wheel event, which is the
 * input its own handler reacts to — writing `scrollTop` alone changes nothing.
 * Returns whether that step actually mounted more rows.
 */
async function stepBackThroughHistory(scroller: HTMLElement): Promise<boolean> {
  const before = mountedRowCount();
  scroller.scrollTop = 0;
  scroller.dispatchEvent(
    new WheelEvent("wheel", { deltaY: WHEEL_DELTA_Y, bubbles: true, cancelable: true }),
  );
  await delay(STEP_SETTLE_MS);
  return mountedRowCount() > before;
}

/** A departure that touches only the inline style, and clears itself. */
function flash(row: HTMLElement, accent: string | undefined): void {
  if (!accent) return;
  const previous = row.style.transition;
  const previousColor = row.style.backgroundColor;
  row.style.transition = FLASH_TRANSITION;
  row.style.backgroundColor = accent;
  window.setTimeout(() => {
    row.style.backgroundColor = previousColor;
    // Restore after the fade, so removing the transition does not snap the color.
    window.setTimeout(() => {
      row.style.transition = previous;
    }, 450);
  }, FLASH_MS);
}

/** The chat's container once the chat has opened, or null if none appeared. */
async function awaitChatScroller(signal: AbortSignal): Promise<HTMLElement | null> {
  const deadline = Date.now() + ATTACH_DEADLINE_MS;
  while (!signal.aborted && Date.now() < deadline) {
    const scroller = document.querySelector<HTMLElement>(CHAT_SCROLLER_SELECTOR);
    if (scroller) return scroller;
    await delay(ATTACH_INTERVAL_MS);
  }
  return null;
}

/**
 * Reveal a reply in the chat it belongs to.
 *
 * The row is looked for first, since the common case is a recent reply that is
 * already mounted; only a miss starts walking the history back.
 */
export async function jumpToReply(
  messageId: string,
  phase: "streaming" | "complete",
  accent: string | undefined,
  signal: AbortSignal,
): Promise<JumpResult> {
  const scroller = await awaitChatScroller(signal);
  if (!scroller) return { status: "unavailable" };
  if (signal.aborted) return { status: "exhausted" };

  const walkDeadline = Date.now() + WALK_BUDGET_MS;
  let stalled = 0;

  while (!signal.aborted && Date.now() < walkDeadline) {
    const row = findRow(messageId, phase);
    if (row) {
      scrollIntoView(scroller, row);
      flash(row, accent);
      return { status: "jumped" };
    }

    if (!(await stepBackThroughHistory(scroller))) {
      stalled += 1;
      // The walk is done when several steps in a row mount nothing new.
      if (stalled >= STALLED_STEPS) break;
    } else {
      stalled = 0;
    }
  }

  if (signal.aborted) return { status: "exhausted" };

  // One last look: the row can mount on the step that also exhausted the walk.
  const row = findRow(messageId, phase);
  if (row) {
    scrollIntoView(scroller, row);
    flash(row, accent);
    return { status: "jumped" };
  }
  return { status: "exhausted" };
}