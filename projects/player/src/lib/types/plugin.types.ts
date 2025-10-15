/**
 * Plugin System Type Definitions
 * Defines interfaces for the PanelWave plugin architecture
 */

/**
 * Plugin metadata
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  icon?: string;
  homepage?: string;
  
  /**
   * Required capabilities
   */
  capabilities: PluginCapability[];
  
  /**
   * Optional capabilities (user can deny)
   */
  optionalCapabilities?: PluginCapability[];
  
  /**
   * Plugin entry point URL
   */
  url: string;
  
  /**
   * Allowed origins for postMessage
   */
  allowedOrigins?: string[];
}

/**
 * Plugin capabilities
 */
export type PluginCapability =
  | 'read-manifest'      // Read comic manifest
  | 'read-state'         // Read player state
  | 'write-state'        // Modify player state
  | 'read-variables'     // Read variable store
  | 'write-variables'    // Modify variables
  | 'navigation'         // Control navigation
  | 'ui-overlay'         // Render UI overlays
  | 'ui-toolbar'         // Add toolbar buttons
  | 'tracking'           // Access tracking data
  | 'storage'            // Access localStorage
  | 'network'            // Make network requests
  | 'clipboard';         // Access clipboard

/**
 * Plugin lifecycle state
 */
export type PluginState =
  | 'loading'     // Loading plugin
  | 'loaded'      // Plugin loaded, not mounted
  | 'mounting'    // Mounting plugin
  | 'mounted'     // Plugin active
  | 'updating'    // Receiving update
  | 'unmounting'  // Unmounting plugin
  | 'error'       // Error state
  | 'disposed';   // Disposed and cleaned up

/**
 * Plugin context provided to plugins
 */
export interface PluginContext {
  manifest: PluginManifest;
  capabilities: PluginCapability[];
  playerVersion: string;
  workId?: string;
  sessionId: string;
}

/**
 * Plugin instance
 */
export interface PluginInstance {
  manifest: PluginManifest;
  state: PluginState;
  iframe: HTMLIFrameElement | null;
  grantedCapabilities: PluginCapability[];
  deniedCapabilities: PluginCapability[];
  error?: Error;
  mountedAt?: Date;
}

/**
 * Plugin message types
 */
export type PluginMessageType =
  // Lifecycle
  | 'plugin:init'
  | 'plugin:ready'
  | 'plugin:mount'
  | 'plugin:mounted'
  | 'plugin:update'
  | 'plugin:unmount'
  | 'plugin:dispose'
  | 'plugin:error'
  
  // Capability requests
  | 'request:capability'
  | 'grant:capability'
  | 'deny:capability'
  
  // API calls
  | 'api:call'
  | 'api:response'
  | 'api:error'
  
  // Events
  | 'event:subscribe'
  | 'event:unsubscribe'
  | 'event:emit';

/**
 * Plugin message
 */
export interface PluginMessage {
  type: PluginMessageType;
  pluginId: string;
  requestId?: string;
  payload?: unknown;
  error?: string;
}

/**
 * Plugin API call
 */
export interface PluginAPICall {
  method: string;
  params?: unknown[];
}

/**
 * Plugin API response
 */
export interface PluginAPIResponse {
  requestId: string;
  result?: unknown;
  error?: string;
}

/**
 * Plugin event subscription
 */
export interface PluginEventSubscription {
  eventType: string;
  callback: (data: unknown) => void;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  /**
   * Enable plugin system
   */
  enabled?: boolean;
  
  /**
   * Allowed plugin origins
   */
  allowedOrigins?: string[];
  
  /**
   * Maximum number of plugins
   */
  maxPlugins?: number;
  
  /**
   * Plugin load timeout (ms)
   */
  loadTimeout?: number;
  
  /**
   * Sandbox attributes
   */
  sandboxAttributes?: string[];
  
  /**
   * Auto-grant capabilities
   */
  autoGrantCapabilities?: PluginCapability[];
}

/**
 * Plugin error
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public pluginId: string,
    public code?: string
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

/**
 * Plugin permission request
 */
export interface PluginPermissionRequest {
  pluginId: string;
  pluginName: string;
  capability: PluginCapability;
  reason?: string;
}

/**
 * Plugin permission result
 */
export interface PluginPermissionResult {
  capability: PluginCapability;
  granted: boolean;
  remember?: boolean;
}

/**
 * Plugin API interface
 * Methods available to plugins
 */
export interface PluginAPI {
  // Manifest access
  getManifest(): Promise<unknown>;
  
  // State access
  getPlayerState(): Promise<unknown>;
  setPlayerState(state: Partial<unknown>): Promise<void>;
  
  // Variable access
  getVariable(key: string): Promise<unknown>;
  setVariable(key: string, value: unknown): Promise<void>;
  
  // Navigation
  navigateToPanel(chapterId: string, panelId: string): Promise<void>;
  getCurrentPanel(): Promise<{ chapterId: string; panelId: string }>;
  
  // UI
  showNotification(message: string, type?: 'info' | 'success' | 'warning' | 'error'): Promise<void>;
  addToolbarButton(config: ToolbarButtonConfig): Promise<string>;
  removeToolbarButton(id: string): Promise<void>;
  
  // Events
  on(eventType: string, callback: (data: unknown) => void): Promise<void>;
  off(eventType: string): Promise<void>;
  emit(eventType: string, data: unknown): Promise<void>;
  
  // Storage
  getStorage(key: string): Promise<unknown>;
  setStorage(key: string, value: unknown): Promise<void>;
  removeStorage(key: string): Promise<void>;
}

/**
 * Toolbar button configuration
 */
export interface ToolbarButtonConfig {
  id?: string;
  icon: string;
  label: string;
  tooltip?: string;
  position?: 'left' | 'right';
  onClick?: () => void;
}
