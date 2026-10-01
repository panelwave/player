import type { Chapter } from '../types';

/** True when the chapter's graph declares no edges at all. */
export function isEdgelessChapter(chapter: Chapter): boolean {
  return !chapter.graph?.edges?.length;
}

/**
 * Deterministic reading order for a chapter: breadth-first over the graph
 * from the entry panel(s), then any unreachable panels in declaration order.
 * Branching narratives have no single true order — BFS approximates
 * "distance from start". A chapter without edges reads entry first, then
 * the remaining panels in `chapter.panels` key order.
 */
export function chapterReadingOrder(chapter: Chapter): string[] {
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const graph = chapter.graph;

  const entry = graph?.entry;
  const queue: string[] = entry === undefined ? [] : typeof entry === 'string' ? [entry] : [...entry];

  while (queue.length > 0) {
    const panelId = queue.shift()!;
    if (seen.has(panelId)) {
      continue;
    }
    seen.add(panelId);
    orderedIds.push(panelId);
    for (const edge of graph?.edges ?? []) {
      if (edge.from === panelId && !seen.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  for (const panelId of Object.keys(chapter.panels ?? {})) {
    if (!seen.has(panelId)) {
      orderedIds.push(panelId);
    }
  }
  return orderedIds;
}

/**
 * Is this the chapter's last panel? With edges: a panel without outgoing
 * edges. Without edges: the last panel of the reading order.
 */
export function isChapterEndPanel(chapter: Chapter, panelId: string): boolean {
  if (isEdgelessChapter(chapter)) {
    const order = chapterReadingOrder(chapter);
    return order[order.length - 1] === panelId;
  }
  return !chapter.graph.edges.some((edge) => edge.from === panelId);
}
