/**
 * Flow Engine Service
 * Handles graph navigation, condition evaluation, and action application
 */

import { inject, Injectable } from '@angular/core';
import type { CameraMove, Chapter, Edge, Graph, Mutation, Settings, Transition } from '../types';
import { evaluateJsonLogic } from '../utils';
import { chapterReadingOrder, isEdgelessChapter } from '../utils/reading-order';
import { EntitlementService } from './entitlement.service';

/**
 * Navigation result
 */
export interface NavigationResult {
  nextPanelId: string | null;
  transition?: Transition;
  /** Camera travel for canvas view (edge cameraMove or the format default). */
  cameraMove?: CameraMove;
  /** Variable mutations the traversed edge carries (schema `Edge.action`). */
  action?: Mutation[];
}

/**
 * Flow Engine Service
 * Manages panel navigation through graph traversal
 */
@Injectable({
  providedIn: 'root',
})
export class FlowEngineService {
  private readonly entitlementService = inject(EntitlementService);

  /**
   * Get next panel based on graph edges and conditions
   * @param graph - Navigation graph
   * @param currentPanelId - Current panel ID
   * @param context - Variable context for condition evaluation
   * @returns Navigation result with next panel and transition
   */
  getNextPanel(
    graph: Graph,
    currentPanelId: string,
    context: Record<string, unknown>,
    defaultTransition?: Transition,
    defaultCameraMove?: CameraMove
  ): NavigationResult {
    // Get edges from current panel
    const edges = this.getEdgesFromPanel(graph, currentPanelId);

    if (edges.length === 0) {
      return { nextPanelId: null };
    }

    // Filter edges by condition
    const validEdges = edges.filter((edge) => this.evaluateCondition(edge, context));

    if (validEdges.length === 0) {
      return { nextPanelId: null };
    }

    // Sort by priority (highest first)
    const sortedEdges = this.sortEdgesByPriority(validEdges);

    // Take first (highest priority) edge
    const selectedEdge = sortedEdges[0];

    return {
      nextPanelId: selectedEdge.to,
      // Edges without a transition inherit the output format's default
      // (settings.outputPresets[format].defaultTransition, schema 1.2).
      transition: selectedEdge.transition ?? defaultTransition,
      // Same inheritance for canvas-view camera moves (schema 1.4).
      cameraMove: selectedEdge.cameraMove ?? defaultCameraMove,
      action: selectedEdge.action,
    };
  }

  /**
   * Next panel within a chapter. A chapter WITH edges uses the graph
   * ({@link getNextPanel}, conditions and priorities included). A chapter
   * without any edges follows its reading order (entry, then
   * `chapter.panels` key order) with the format defaults; null after the
   * last panel.
   */
  getNextInChapter(
    chapter: Chapter,
    currentPanelId: string,
    context: Record<string, unknown>,
    defaultTransition?: Transition,
    defaultCameraMove?: CameraMove
  ): NavigationResult {
    if (!isEdgelessChapter(chapter)) {
      return this.getNextPanel(chapter.graph, currentPanelId, context, defaultTransition, defaultCameraMove);
    }
    const order = chapterReadingOrder(chapter);
    const index = order.indexOf(currentPanelId);
    const next = index < 0 ? undefined : order[index + 1];
    return next
      ? { nextPanelId: next, transition: defaultTransition, cameraMove: defaultCameraMove }
      : { nextPanelId: null };
  }

  /**
   * Previous panel(s) within a chapter: the sources of edges into the panel,
   * or — in a chapter without edges — the panel before it in reading order.
   */
  getPreviousInChapter(chapter: Chapter, currentPanelId: string): string[] {
    if (!isEdgelessChapter(chapter)) {
      return this.getPreviousPanels(chapter.graph, currentPanelId);
    }
    const order = chapterReadingOrder(chapter);
    const index = order.indexOf(currentPanelId);
    return index > 0 ? [order[index - 1]] : [];
  }

  /**
   * Camera move to play when navigating BACK from `currentPanelId` to
   * `previousPanelId`: the move of the edge originally traversed
   * (previous -> current, falling back to the format default) with its
   * waypoints reversed — the camera retraces the authored path.
   */
  getReturnCameraMove(
    graph: Graph,
    previousPanelId: string,
    currentPanelId: string,
    defaultCameraMove?: CameraMove
  ): CameraMove | undefined {
    const edge = graph.edges.find(
      (candidate) => candidate.from === previousPanelId && candidate.to === currentPanelId
    );
    const move = edge?.cameraMove ?? defaultCameraMove;
    if (!move) {
      return undefined;
    }
    if (!move.waypoints || move.waypoints.length === 0) {
      return { ...move };
    }
    return { ...move, waypoints: [...move.waypoints].reverse() };
  }

  /**
   * Resolve the default camera move from settings.outputPresets — the
   * canvas-view counterpart of {@link getDefaultTransition}, with the same
   * no-format rule: without an active format, the default is only used when
   * every defined preset agrees on it.
   */
  getDefaultCameraMove(settings?: Settings, format?: string): CameraMove | undefined {
    const presets = settings?.outputPresets;
    if (!presets) {
      return undefined;
    }

    if (format) {
      return presets[format]?.defaultCameraMove;
    }

    const defaults = Object.values(presets)
      .map((preset) => preset?.defaultCameraMove)
      .filter((move): move is CameraMove => !!move);
    if (defaults.length === 0) {
      return undefined;
    }
    const first = JSON.stringify(defaults[0]);
    return defaults.every((move) => JSON.stringify(move) === first)
      ? defaults[0]
      : undefined;
  }

  /**
   * Transition to play when navigating BACK from `currentPanelId` to
   * `previousPanelId`: the transition of the edge originally traversed
   * (previous -> current, falling back to the format default), reversed.
   *
   * @param graph - Navigation graph
   * @param previousPanelId - Panel being returned to
   * @param currentPanelId - Panel being left
   * @param defaultTransition - Resolved outputPresets default, if any
   * @returns The reversed transition, or undefined
   */
  getReturnTransition(
    graph: Graph,
    previousPanelId: string,
    currentPanelId: string,
    defaultTransition?: Transition
  ): Transition | undefined {
    const edge = graph.edges.find(
      (candidate) => candidate.from === previousPanelId && candidate.to === currentPanelId
    );
    return this.reverseTransition(edge?.transition ?? defaultTransition);
  }

  /**
   * Reverse a transition's direction of motion (slide left <-> right,
   * up <-> down). Direction-less transitions (fade, zoom, cut) are
   * returned unchanged.
   */
  reverseTransition(transition?: Transition): Transition | undefined {
    if (!transition) {
      return undefined;
    }
    if (!transition.dir) {
      return { ...transition };
    }
    const opposite: Record<string, Transition['dir']> = {
      left: 'right',
      right: 'left',
      up: 'down',
      down: 'up',
    };
    return { ...transition, dir: opposite[transition.dir] ?? transition.dir };
  }

  /**
   * Resolve the default edge transition from settings.outputPresets.
   *
   * Per the manifest spec, an edge without a `transition` inherits the active
   * output format's `defaultTransition`. When no format is given (the player
   * does not track an active format yet), the default is only used if every
   * defined preset agrees on it; otherwise undefined (renderer falls back to
   * a plain cut).
   *
   * @param settings - Manifest settings
   * @param format - Active output format key, if known
   * @returns The default transition, or undefined
   */
  getDefaultTransition(settings?: Settings, format?: string): Transition | undefined {
    const presets = settings?.outputPresets;
    if (!presets) {
      return undefined;
    }

    if (format) {
      return presets[format]?.defaultTransition;
    }

    const defaults = Object.values(presets)
      .map((preset) => preset?.defaultTransition)
      .filter((transition): transition is Transition => !!transition);
    if (defaults.length === 0) {
      return undefined;
    }
    const first = JSON.stringify(defaults[0]);
    return defaults.every((transition) => JSON.stringify(transition) === first)
      ? defaults[0]
      : undefined;
  }

  /**
   * Get all edges originating from a panel
   * @param graph - Navigation graph
   * @param panelId - Panel ID
   * @returns Array of edges
   */
  private getEdgesFromPanel(graph: Graph, panelId: string): Edge[] {
    return graph.edges.filter((edge) => edge.from === panelId);
  }

  /**
   * Evaluate edge condition
   * @param edge - Edge to evaluate
   * @param context - Variable context
   * @returns True if condition passes
   */
  private evaluateCondition(edge: Edge, context: Record<string, unknown>): boolean {
    // No condition means always true
    if (!edge.condition) {
      return true;
    }

    return evaluateJsonLogic(edge.condition, context);
  }

  /**
   * Sort edges by priority (highest first)
   * @param edges - Edges to sort
   * @returns Sorted edges
   */
  private sortEdgesByPriority(edges: Edge[]): Edge[] {
    return [...edges].sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA; // Descending order
    });
  }

  /**
   * Get all possible next panels (ignoring conditions)
   * @param graph - Navigation graph
   * @param currentPanelId - Current panel ID
   * @returns Array of possible next panel IDs
   */
  getPossibleNextPanels(graph: Graph, currentPanelId: string): string[] {
    const edges = this.getEdgesFromPanel(graph, currentPanelId);
    return edges.map((edge) => edge.to);
  }

  /**
   * Get all edges pointing to a panel
   * @param graph - Navigation graph
   * @param panelId - Panel ID
   * @returns Array of edges
   */
  getEdgesToPanel(graph: Graph, panelId: string): Edge[] {
    return graph.edges.filter((edge) => edge.to === panelId);
  }

  /**
   * Get previous panels (panels with edges pointing to current)
   * @param graph - Navigation graph
   * @param currentPanelId - Current panel ID
   * @returns Array of previous panel IDs
   */
  getPreviousPanels(graph: Graph, currentPanelId: string): string[] {
    const edges = this.getEdgesToPanel(graph, currentPanelId);
    return edges.map((edge) => edge.from);
  }

  /**
   * Check if a panel has outgoing edges
   * @param graph - Navigation graph
   * @param panelId - Panel ID
   * @returns True if panel has outgoing edges
   */
  hasOutgoingEdges(graph: Graph, panelId: string): boolean {
    return this.getEdgesFromPanel(graph, panelId).length > 0;
  }

  /**
   * Check if a panel is an endpoint (no outgoing edges)
   * @param graph - Navigation graph
   * @param panelId - Panel ID
   * @returns True if panel is an endpoint
   */
  isEndpoint(graph: Graph, panelId: string): boolean {
    return !this.hasOutgoingEdges(graph, panelId);
  }

  /**
   * Check if a panel is the entry point
   * @param graph - Navigation graph
   * @param panelId - Panel ID
   * @returns True if panel is the entry
   */
  isEntry(graph: Graph, panelId: string): boolean {
    const entry = graph.entry;
    
    if (typeof entry === 'string') {
      return entry === panelId;
    }
    
    if (Array.isArray(entry)) {
      return entry.includes(panelId);
    }
    
    return false;
  }

  /**
   * Get entry panel(s) from graph
   * @param graph - Navigation graph
   * @returns Entry panel ID or array of IDs
   */
  getEntry(graph: Graph): string | string[] {
    return graph.entry;
  }

  /**
   * Find all endpoints in the graph
   * @param graph - Navigation graph
   * @returns Array of endpoint panel IDs
   */
  findEndpoints(graph: Graph): string[] {
    const allPanelIds = new Set<string>();
    
    // Collect all panel IDs from edges
    graph.edges.forEach((edge) => {
      allPanelIds.add(edge.from);
      allPanelIds.add(edge.to);
    });
    
    // Add entry panels
    if (typeof graph.entry === 'string') {
      allPanelIds.add(graph.entry);
    } else if (Array.isArray(graph.entry)) {
      graph.entry.forEach((id) => allPanelIds.add(id));
    }
    
    // Filter panels with no outgoing edges
    return Array.from(allPanelIds).filter((panelId) => this.isEndpoint(graph, panelId));
  }

  /**
   * Check if navigation path exists between two panels
   * @param graph - Navigation graph
   * @param fromPanelId - Start panel ID
   * @param toPanelId - Target panel ID
   * @param maxDepth - Maximum search depth (default: 100)
   * @returns True if path exists
   */
  hasPath(
    graph: Graph,
    fromPanelId: string,
    toPanelId: string,
    maxDepth = 100
  ): boolean {
    if (fromPanelId === toPanelId) {
      return true;
    }

    const visited = new Set<string>();
    const queue: { panelId: string; depth: number }[] = [
      { panelId: fromPanelId, depth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) {
        continue;
      }

      if (visited.has(current.panelId)) {
        continue;
      }

      visited.add(current.panelId);

      const nextPanels = this.getPossibleNextPanels(graph, current.panelId);

      for (const nextPanel of nextPanels) {
        if (nextPanel === toPanelId) {
          return true;
        }

        queue.push({ panelId: nextPanel, depth: current.depth + 1 });
      }
    }

    return false;
  }

  /**
   * Find shortest path between two panels (ignoring conditions)
   * @param graph - Navigation graph
   * @param fromPanelId - Start panel ID
   * @param toPanelId - Target panel ID
   * @returns Array of panel IDs in path, or null if no path exists
   */
  findPath(graph: Graph, fromPanelId: string, toPanelId: string): string[] | null {
    if (fromPanelId === toPanelId) {
      return [fromPanelId];
    }

    const visited = new Set<string>();
    const queue: { panelId: string; path: string[] }[] = [
      { panelId: fromPanelId, path: [fromPanelId] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.panelId)) {
        continue;
      }

      visited.add(current.panelId);

      const nextPanels = this.getPossibleNextPanels(graph, current.panelId);

      for (const nextPanel of nextPanels) {
        if (nextPanel === toPanelId) {
          return [...current.path, nextPanel];
        }

        queue.push({
          panelId: nextPanel,
          path: [...current.path, nextPanel],
        });
      }
    }

    return null;
  }

  /**
   * Detect cycles in the graph
   * @param graph - Navigation graph
   * @returns True if graph contains cycles
   */
  hasCycles(graph: Graph): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (panelId: string): boolean => {
      visited.add(panelId);
      recursionStack.add(panelId);

      const nextPanels = this.getPossibleNextPanels(graph, panelId);

      for (const nextPanel of nextPanels) {
        if (!visited.has(nextPanel)) {
          if (dfs(nextPanel)) {
            return true;
          }
        } else if (recursionStack.has(nextPanel)) {
          // Found a cycle
          return true;
        }
      }

      recursionStack.delete(panelId);
      return false;
    };

    // Check from entry points
    const entries = Array.isArray(graph.entry) ? graph.entry : [graph.entry];

    for (const entry of entries) {
      if (!visited.has(entry)) {
        if (dfs(entry)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get all reachable panels from entry
   * @param graph - Navigation graph
   * @returns Array of reachable panel IDs
   */
  getReachablePanels(graph: Graph): string[] {
    const reachable = new Set<string>();
    const entries = Array.isArray(graph.entry) ? graph.entry : [graph.entry];

    const dfs = (panelId: string): void => {
      if (reachable.has(panelId)) {
        return;
      }

      reachable.add(panelId);

      const nextPanels = this.getPossibleNextPanels(graph, panelId);
      nextPanels.forEach((next) => dfs(next));
    };

    entries.forEach((entry) => dfs(entry));

    return Array.from(reachable);
  }

  /**
   * Check if user has entitlement to access a panel
   * @param workId - Work ID
   * @param chapterId - Chapter ID
   * @param panelId - Panel ID
   * @returns Promise resolving to true if user has access
   */
  async checkPanelEntitlement(
    workId: string,
    chapterId: string,
    panelId: string
  ): Promise<boolean> {
    return await this.entitlementService.hasAccessToPanel(workId, chapterId, panelId);
  }

  /**
   * Check if user has entitlement to access a chapter
   * @param workId - Work ID
   * @param chapterId - Chapter ID
   * @returns Promise resolving to true if user has access
   */
  async checkChapterEntitlement(workId: string, chapterId: string): Promise<boolean> {
    return await this.entitlementService.hasAccessToChapter(workId, chapterId);
  }

  /**
   * Check if user has entitlement to access a work
   * @param workId - Work ID
   * @returns Promise resolving to true if user has access
   */
  async checkWorkEntitlement(workId: string): Promise<boolean> {
    return await this.entitlementService.hasAccessToWork(workId);
  }

  /**
   * Get entitlement service instance
   * @returns EntitlementService
   */
  getEntitlementService(): EntitlementService {
    return this.entitlementService;
  }
}
