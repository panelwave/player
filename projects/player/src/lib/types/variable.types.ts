/**
 * Variable Type Definitions
 * Defines variable system for state management
 */

/**
 * Variables configuration
 */
export interface Variables {
  /** Array of variable definitions */
  definitions?: VariableDefinition[];
}

/**
 * Variable definition
 */
export interface VariableDefinition {
  /** Unique variable identifier (dot-notation allowed, e.g., "user.age") */
  id: string;
  
  /** Human-readable description (optional) */
  description?: string;
  
  /** Variable data type */
  type: VariableType;
  
  /** Allowed values for enum type (required if type is enum) */
  enum?: string[];
  
  /** Default value (optional) */
  default?: JsonValue;
  
  /** Variable scope */
  scope: VariableScope;
  
  /** Visibility (optional, default: "public") */
  visibility?: 'public' | 'private';
  
  /** Whether variable is read-only (optional, default: false) */
  readOnly?: boolean;
  
  /** Minimum value for number/integer types (optional) */
  min?: number;
  
  /** Maximum value for number/integer types (optional) */
  max?: number;
  
  /** Pattern for string validation (optional) */
  pattern?: string;
}

/**
 * Variable data type
 */
export type VariableType =
  | 'boolean'
  | 'number'
  | 'integer'
  | 'string'
  | 'enum'
  | 'date'
  | 'time'
  | 'datetime';

/**
 * Variable scope
 */
export type VariableScope =
  | 'global'      // Shared across entire work
  | 'chapter'     // Chapter-specific
  | 'page'        // Page-specific
  | 'session'     // Session-only (cleared on close)
  | 'persistent'; // Persisted across sessions

/**
 * JSON value type (any valid JSON value)
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Variable store (runtime storage)
 */
export interface VariableStore {
  /** Global scope variables */
  global: Record<string, unknown>;
  
  /** Chapter scope variables by chapter ID */
  chapter: Record<string, Record<string, unknown>>;
  
  /** Page scope variables by page ID */
  page: Record<string, Record<string, unknown>>;
  
  /** Session scope variables (volatile) */
  session: Record<string, unknown>;
  
  /** Persistent scope variables (saved to storage) */
  persistent: Record<string, unknown>;
}

/**
 * Variable mutation operation
 */
export interface VariableMutation {
  /** Operation type */
  op: MutationOperation;
  
  /** Variable identifier */
  var: string;
  
  /** Value for the operation (optional, depends on op) */
  value?: unknown;
  
  /** Amount for increment/decrement (optional, default: 1) */
  amount?: number;
}

/**
 * Mutation operation type
 */
export type MutationOperation =
  | 'set'        // Set to value
  | 'increment'  // Increase by amount
  | 'decrement'  // Decrease by amount
  | 'toggle'     // Toggle boolean
  | 'append'     // Append to array
  | 'remove'     // Remove from array
  | 'clear';     // Clear/reset to default

/**
 * Variable change event
 */
export interface VariableChangeEvent {
  /** Variable identifier */
  variableId: string;
  
  /** Scope where change occurred */
  scope: VariableScope;
  
  /** Previous value */
  oldValue: unknown;
  
  /** New value */
  newValue: unknown;
  
  /** Timestamp of change */
  timestamp: number;
}

/**
 * Variable validation result
 */
export interface VariableValidationResult {
  /** Whether the value is valid */
  valid: boolean;
  
  /** Error messages if invalid */
  errors?: string[];
}

/**
 * Variable context for JSON Logic evaluation
 */
export type VariableContext = Record<string, unknown>;

/**
 * Reserved variable namespaces
 */
export const RESERVED_NAMESPACES = {
  /** User-related variables (age, preferences, entitlements) */
  user: 'user',
  
  /** UI preferences */
  prefs: 'prefs',
  
  /** Device information */
  device: 'device',
  
  /** Entitlement and access control */
  entitlement: 'entitlement',
  
  /** Plugin-specific state */
  plugin: 'plugin',
  
  /** System variables */
  system: 'system',
} as const;

/**
 * Predefined user variables
 */
export interface UserVariables {
  /** User age (for age gating) */
  'user.age'?: number;
  
  /** User ID (hashed) */
  'user.id'?: string;
  
  /** User locale preference */
  'user.locale'?: string;
}

/**
 * Predefined preference variables
 */
export interface PreferenceVariables {
  /** Show speech bubbles */
  'prefs.speech'?: boolean;
  
  /** Enable audio */
  'prefs.audio'?: boolean;
  
  /** Enable SFX */
  'prefs.sfx'?: boolean;
  
  /** Enable autoplay */
  'prefs.autoplay'?: boolean;
  
  /** Seconds per panel in autoplay */
  'prefs.secondsPerPanel'?: number;
  
  /** Manga mode (right-to-left) */
  'prefs.mangaMode'?: boolean;
  
  /** Reduced motion preference */
  'prefs.reducedMotion'?: boolean;
  
  /** High contrast mode */
  'prefs.highContrast'?: boolean;
}

/**
 * Predefined device variables
 */
export interface DeviceVariables {
  /** Device type */
  'device.type'?: 'desktop' | 'mobile' | 'tablet' | 'tv';
  
  /** Screen width */
  'device.screenWidth'?: number;
  
  /** Screen height */
  'device.screenHeight'?: number;
  
  /** Pixel density */
  'device.pixelRatio'?: number;
  
  /** Touch support */
  'device.touchEnabled'?: boolean;
  
  /** Network type */
  'device.networkType'?: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi';
}

/**
 * Predefined entitlement variables
 */
export interface EntitlementVariables {
  /** Premium access */
  'entitlement.premium'?: boolean;
  
  /** Purchased content */
  'entitlement.purchased'?: string[];
  
  /** Available tokens */
  'entitlement.tokens'?: number;
}
