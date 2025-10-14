/**
 * Graph Type Definitions
 * Defines navigation flow between panels
 */

import type { Transition } from './manifest.types';
import type { Mutation, JsonLogic } from './panel.types';

/**
 * Navigation graph defining panel flow
 */
export interface Graph {
  /** Entry panel ID(s) */
  entry: string | string[];
  
  /** Array of edges connecting panels */
  edges: Edge[];
  
  /** Optional metadata for nodes (optional) */
  nodes?: Record<string, NodeMetadata>;
}

/**
 * Edge connecting two panels with optional conditions
 */
export interface Edge {
  /** Source panel ID */
  from: string;
  
  /** Target panel ID */
  to: string;
  
  /** Condition that must be true for this edge to be traversable (optional) */
  condition?: JsonLogic;
  
  /** Variable mutations to apply when traversing this edge (optional) */
  action?: Mutation[];
  
  /** Transition animation for this edge (optional) */
  transition?: Transition;
  
  /** Priority for edge selection (lower = higher priority) (optional) */
  priority?: number;
  
  /** Localized label for this edge (optional, for UI) */
  label?: Record<string, string>;
}

/**
 * Optional metadata for graph nodes
 */
export interface NodeMetadata {
  /** Node type (optional) */
  type?: 'panel' | 'fork' | 'join' | 'exit';
  
  /** Node label (optional) */
  label?: string;
  
  /** Position hint for visualization (optional) */
  position?: {
    x: number;
    y: number;
  };
}

/**
 * Navigation path through the graph
 */
export interface NavigationPath {
  /** Ordered array of panel IDs in this path */
  panels: string[];
  
  /** Conditions that led to this path */
  conditions?: Record<string, unknown>;
}

/**
 * Graph traversal options
 */
export interface TraversalOptions {
  /** Starting panel ID */
  startFrom: string;
  
  /** Variable context for condition evaluation */
  variables: Record<string, unknown>;
  
  /** Maximum depth to traverse (optional, default: 10) */
  maxDepth?: number;
  
  /** Whether to follow conditional edges (optional, default: true) */
  followConditional?: boolean;
}

/**
 * Graph traversal result
 */
export interface TraversalResult {
  /** Array of reachable panel IDs */
  reachable: string[];
  
  /** Array of possible paths */
  paths: NavigationPath[];
  
  /** Unreachable panels due to conditions */
  unreachable: string[];
}
