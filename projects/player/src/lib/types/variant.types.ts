/**
 * Variant System Type Definitions
 * Defines interfaces for dynamic content variants based on conditions
 */

import type { Layer } from './index';

/**
 * Variant condition types
 */
export type VariantConditionType =
  | 'age'           // Age-based (18+, etc.)
  | 'choice'        // Based on previous choices
  | 'variable'      // Variable value comparison
  | 'random'        // Random selection
  | 'time'          // Time-based (day/night, season)
  | 'playthrough'   // First vs repeat playthrough
  | 'achievement'   // Achievement unlocked
  | 'always';       // Always apply (default)

/**
 * Variant condition
 */
export interface VariantCondition {
  type: VariantConditionType;
  
  // Age condition
  minAge?: number;
  maxAge?: number;
  
  // Choice condition
  requiredChoices?: string[];  // Choice IDs that must be made
  excludedChoices?: string[];  // Choices that exclude this variant
  
  // Variable condition
  variableKey?: string;
  variableValue?: unknown;
  variableOperator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  
  // Random condition
  probability?: number;  // 0-1, probability of selection
  
  // Time condition
  timeRange?: {
    start: string;  // HH:MM format
    end: string;
  };
  dateRange?: {
    start: string;  // ISO date
    end: string;
  };
  
  // Playthrough condition
  playthroughMin?: number;
  playthroughMax?: number;
  
  // Achievement condition
  requiredAchievements?: string[];
  
  // Logical operators
  and?: VariantCondition[];
  or?: VariantCondition[];
  not?: VariantCondition;
}

/**
 * Panel variant
 */
export interface PanelVariant {
  id: string;
  name: string;
  condition: VariantCondition;
  priority: number;  // Higher priority wins if multiple match
  
  // Override specific panel properties
  layers?: Layer[];
  duration?: number;
  transition?: string;
  audio?: string[];
  
  // Or reference another panel entirely
  panelRef?: string;
}

/**
 * Layer variant
 */
export interface LayerVariant {
  id: string;
  name: string;
  condition: VariantCondition;
  priority: number;
  
  // Override layer properties
  layerOverrides: Partial<Layer>;
  
  // Or replace entire layer
  layerReplacement?: Layer;
}

/**
 * Variant group
 */
export interface VariantGroup {
  id: string;
  name: string;
  description?: string;
  
  // Selection mode
  mode: 'first-match' | 'highest-priority' | 'random-match';
  
  // Variants in this group
  variants: (PanelVariant | LayerVariant)[];
  
  // Default variant if no conditions match
  defaultVariant?: string;
}

/**
 * Variant context for evaluation
 */
export interface VariantContext {
  // User information
  userAge?: number;
  
  // Choices made
  choiceHistory: string[];
  
  // Variables
  variables: Record<string, unknown>;
  
  // Playt hrough count
  playthroughCount: number;
  
  // Achievements
  achievements: string[];
  
  // Current time
  currentTime?: Date;
  
  // Random seed for deterministic random
  randomSeed?: number;
}

/**
 * Variant evaluation result
 */
export interface VariantEvaluationResult {
  matched: boolean;
  variantId?: string;
  priority: number;
  reason?: string;
}

/**
 * Variant selection result
 */
export interface VariantSelectionResult {
  selectedVariant?: PanelVariant | LayerVariant;
  matchedVariants: VariantEvaluationResult[];
  appliedOverrides: unknown;
}

/**
 * Variant override application
 */
export interface VariantOverride {
  targetType: 'panel' | 'layer';
  targetId: string;
  variantId: string;
  overrides: unknown;
  appliedAt: Date;
}

/**
 * Variant configuration
 */
export interface VariantConfig {
  enabled: boolean;
  allowManualOverride: boolean;
  debugMode: boolean;
  logSelections: boolean;
}

/**
 * Variant history entry
 */
export interface VariantHistoryEntry {
  timestamp: Date;
  panelId: string;
  variantId: string;
  condition: VariantCondition;
  context: VariantContext;
}
