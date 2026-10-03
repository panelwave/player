import type { Chapter } from '../types';

/**
 * Which panels page view shows as placeholders because of the reader's
 * choices (or choices still ahead).
 *
 * A choice panel is a panel whose hotspots jump (goTo) to two or more
 * different panels. Its branches are the panels reachable through some of
 * its options but not through all of them — what is common to every option
 * (from where the branches rejoin) is not part of the choice.
 *
 * - `unchosen`: the reader picked an option; panels reachable only through
 *   the other options. Page view shows them as placeholders and skips pages
 *   made up of them only.
 * - `hidden`: `unchosen` plus the branches of choices not made yet (no
 *   spoilers: a branch appears once the reader picks it).
 *
 * Reachability follows graph edges, hotspot jumps and the player's implicit
 * chapter continuation (a panel without outgoing edges goes on with the next
 * chapter's entry); conditions are not evaluated — a branch is structure.
 */
export interface BranchVisibility {
  unchosen: Set<string>;
  hidden: Set<string>;
}

export interface BranchGraph {
  /** Panel → panels it can lead to. */
  next: Map<string, Set<string>>;
  /** Choice panel → its options' target panels. */
  choices: Map<string, string[]>;
  /** Where reading starts (the first chapter's entry). */
  entry?: string;
}

function entryOf(chapter: Chapter): string | undefined {
  const entry = chapter.graph?.entry;
  if (typeof entry === 'string') return entry;
  return entry?.[0] ?? Object.keys(chapter.panels ?? {})[0];
}

/** The work's panel graph for branch questions (build once per manifest). */
export function buildBranchGraph(chapters: readonly Chapter[]): BranchGraph {
  const next = new Map<string, Set<string>>();
  const choices = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    let set = next.get(from);
    if (!set) next.set(from, (set = new Set()));
    set.add(to);
  };

  chapters.forEach((chapter, index) => {
    const withEdges = new Set<string>();
    for (const edge of chapter.graph?.edges ?? []) {
      link(edge.from, edge.to);
      withEdges.add(edge.from);
    }
    const following = chapters[index + 1];
    const followingEntry = following ? entryOf(following) : undefined;
    for (const [panelId, panel] of Object.entries(chapter.panels ?? {})) {
      const targets = [...new Set((panel?.hotspots ?? [])
        .map((hotspot) => (hotspot?.action?.type === 'goTo' ? hotspot.action.to : undefined))
        .filter((to): to is string => !!to && to !== panelId))];
      targets.forEach((to) => link(panelId, to));
      if (targets.length >= 2) choices.set(panelId, targets);
      // Chapter end without an edge: the player continues with the next chapter.
      if (!withEdges.has(panelId) && targets.length === 0 && followingEntry) link(panelId, followingEntry);
    }
  });
  return { next, choices, entry: chapters[0] ? entryOf(chapters[0]) : undefined };
}

/** Panels reachable from `start` (itself included), optionally never passing `avoid`. */
function reachable(graph: BranchGraph, start: string, cache: Map<string, Set<string>>, avoid?: string): Set<string> {
  const key = avoid === undefined ? start : `${start}|${avoid}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const to of graph.next.get(id) ?? []) {
      if (to !== avoid && !seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  cache.set(key, seen);
  return seen;
}

/**
 * Placeholder sets for the reader's choices so far
 * (`made`: choice panel → the panel its chosen option jumped to).
 */
export function branchVisibility(graph: BranchGraph, made: ReadonlyMap<string, string>): BranchVisibility {
  const cache = new Map<string, Set<string>>();
  const unchosen = new Set<string>();
  const hidden = new Set<string>();

  // 1. Choices made: what only the other options lead to is off the path.
  for (const [choicePanel, targets] of graph.choices) {
    const chosen = made.get(choicePanel);
    const chosenIndex = chosen ? targets.indexOf(chosen) : -1;
    if (chosenIndex < 0) continue;
    const kept = reachable(graph, targets[chosenIndex], cache);
    targets.forEach((target, i) => {
      if (i === chosenIndex) return;
      for (const id of reachable(graph, target, cache)) {
        if (!kept.has(id) && id !== choicePanel) unchosen.add(id);
      }
    });
  }
  unchosen.forEach((id) => hidden.add(id));

  // 2. Choices still open (and not themselves off the path): their branches
  //    stay hidden until the reader picks one — only what can't be reached
  //    without passing the choice (a variant of the same decision, shown
  //    instead of it, may lead to the same panels).
  for (const [choicePanel, targets] of graph.choices) {
    if (made.has(choicePanel) && targets.includes(made.get(choicePanel)!)) continue;
    if (unchosen.has(choicePanel)) continue;
    const around = graph.entry && graph.entry !== choicePanel
      ? reachable(graph, graph.entry, cache, choicePanel)
      : new Set<string>();
    const reach = targets.map((target) => reachable(graph, target, cache));
    for (const set of reach) {
      for (const id of set) {
        if (id !== choicePanel && !around.has(id) && !reach.every((other) => other.has(id))) hidden.add(id);
      }
    }
  }
  return { unchosen, hidden };
}
