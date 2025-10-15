/**
 * Plugin Host Service
 * Manages plugin lifecycle, communication, and sandboxing
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type {
  PluginManifest,
  PluginInstance,
  PluginState,
  PluginMessage,
  PluginConfig,
  PluginCapability,
  PluginError,
  PluginPermissionRequest,
  PluginPermissionResult,
  PluginAPICall,
  PluginAPIResponse,
} from '../types/plugin.types';

/**
 * Plugin Host Service
 * Central service for managing plugins
 */
@Injectable({
  providedIn: 'root',
})
export class PluginHostService {
  /**
   * Registered plugins
   */
  private plugins = new Map<string, PluginInstance>();

  /**
   * Plugin configurations
   */
  private config: PluginConfig = {
    enabled: true,
    maxPlugins: 10,
    loadTimeout: 10000,
    sandboxAttributes: [
      'allow-scripts',
      'allow-same-origin', // Required for postMessage
    ],
    autoGrantCapabilities: ['read-manifest', 'read-state'],
  };

  /**
   * Plugins observable
   */
  private plugins$ = new BehaviorSubject<Map<string, PluginInstance>>(
    new Map()
  );

  /**
   * Permission requests
   */
  private permissionRequests$ = new Subject<PluginPermissionRequest>();

  /**
   * Message handlers
   */
  private messageHandlers = new Map<string, (message: PluginMessage) => void>();

  /**
   * API method handlers
   */
  private apiHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  /**
   * Event subscriptions
   */
  private eventSubscriptions = new Map<string, Set<string>>(); // eventType -> pluginIds

  /**
   * Initialize service
   */
  constructor() {
    this.setupMessageListener();
    this.registerDefaultAPIHandlers();
  }

  /**
   * Configure plugin system
   */
  configure(config: Partial<PluginConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): PluginConfig {
    return { ...this.config };
  }

  /**
   * Load a plugin
   */
  async loadPlugin(manifest: PluginManifest): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Plugin system is disabled');
    }

    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already loaded`);
    }

    if (
      this.config.maxPlugins &&
      this.plugins.size >= this.config.maxPlugins
    ) {
      throw new Error('Maximum number of plugins reached');
    }

    // Validate manifest
    this.validateManifest(manifest);

    // Create plugin instance
    const instance: PluginInstance = {
      manifest,
      state: 'loading',
      iframe: null,
      grantedCapabilities: [],
      deniedCapabilities: [],
    };

    this.plugins.set(manifest.id, instance);
    this.emitPluginsUpdate();

    try {
      // Request required capabilities
      await this.requestCapabilities(
        manifest.id,
        manifest.capabilities,
        true
      );

      // Request optional capabilities
      if (manifest.optionalCapabilities) {
        await this.requestCapabilities(
          manifest.id,
          manifest.optionalCapabilities,
          false
        );
      }

      // Update state
      this.updatePluginState(manifest.id, 'loaded');
    } catch (error) {
      this.handlePluginError(manifest.id, error as Error);
      throw error;
    }
  }

  /**
   * Mount a plugin
   */
  async mountPlugin(
    pluginId: string,
    container: HTMLElement
  ): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (instance.state !== 'loaded') {
      throw new Error(`Plugin ${pluginId} is not in loaded state`);
    }

    this.updatePluginState(pluginId, 'mounting');

    try {
      // Create iframe sandbox
      const iframe = this.createPluginIframe(instance);
      container.appendChild(iframe);
      instance.iframe = iframe;

      // Wait for plugin to be ready
      await this.waitForPluginReady(pluginId);

      // Send mount message
      await this.sendPluginMessage(pluginId, {
        type: 'plugin:mount',
        pluginId,
        payload: {
          context: this.getPluginContext(instance),
        },
      });

      // Wait for mounted confirmation
      await this.waitForPluginMounted(pluginId);

      instance.mountedAt = new Date();
      this.updatePluginState(pluginId, 'mounted');
    } catch (error) {
      this.handlePluginError(pluginId, error as Error);
      throw error;
    }
  }

  /**
   * Update a plugin with new data
   */
  async updatePlugin(pluginId: string, data: unknown): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance || instance.state !== 'mounted') {
      return;
    }

    this.updatePluginState(pluginId, 'updating');

    try {
      await this.sendPluginMessage(pluginId, {
        type: 'plugin:update',
        pluginId,
        payload: data,
      });

      this.updatePluginState(pluginId, 'mounted');
    } catch (error) {
      this.handlePluginError(pluginId, error as Error);
    }
  }

  /**
   * Unmount a plugin
   */
  async unmountPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance || instance.state !== 'mounted') {
      return;
    }

    this.updatePluginState(pluginId, 'unmounting');

    try {
      // Send unmount message
      await this.sendPluginMessage(pluginId, {
        type: 'plugin:unmount',
        pluginId,
      });

      // Remove iframe
      if (instance.iframe) {
        instance.iframe.remove();
        instance.iframe = null;
      }

      // Clean up event subscriptions
      this.cleanupEventSubscriptions(pluginId);

      this.updatePluginState(pluginId, 'loaded');
    } catch (error) {
      this.handlePluginError(pluginId, error as Error);
    }
  }

  /**
   * Dispose a plugin completely
   */
  async disposePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      return;
    }

    // Unmount if mounted
    if (instance.state === 'mounted') {
      await this.unmountPlugin(pluginId);
    }

    // Send dispose message
    try {
      await this.sendPluginMessage(pluginId, {
        type: 'plugin:dispose',
        pluginId,
      });
    } catch {
      // Ignore errors during disposal
    }

    // Remove iframe
    if (instance.iframe) {
      instance.iframe.remove();
    }

    // Remove from registry
    this.plugins.delete(pluginId);
    this.emitPluginsUpdate();
  }

  /**
   * Get all plugins
   */
  getPlugins(): Map<string, PluginInstance> {
    return new Map(this.plugins);
  }

  /**
   * Get plugins observable
   */
  getPlugins$(): Observable<Map<string, PluginInstance>> {
    return this.plugins$.asObservable();
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get permission requests observable
   */
  getPermissionRequests$(): Observable<PluginPermissionRequest> {
    return this.permissionRequests$.asObservable();
  }

  /**
   * Grant permission
   */
  grantPermission(
    pluginId: string,
    capability: PluginCapability
  ): void {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      return;
    }

    if (!instance.grantedCapabilities.includes(capability)) {
      instance.grantedCapabilities.push(capability);
    }

    // Remove from denied if present
    const deniedIndex = instance.deniedCapabilities.indexOf(capability);
    if (deniedIndex > -1) {
      instance.deniedCapabilities.splice(deniedIndex, 1);
    }

    this.emitPluginsUpdate();
  }

  /**
   * Deny permission
   */
  denyPermission(
    pluginId: string,
    capability: PluginCapability
  ): void {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      return;
    }

    if (!instance.deniedCapabilities.includes(capability)) {
      instance.deniedCapabilities.push(capability);
    }

    // Remove from granted if present
    const grantedIndex = instance.grantedCapabilities.indexOf(capability);
    if (grantedIndex > -1) {
      instance.grantedCapabilities.splice(grantedIndex, 1);
    }

    this.emitPluginsUpdate();
  }

  /**
   * Register API handler
   */
  registerAPIHandler(
    method: string,
    handler: (...args: unknown[]) => Promise<unknown>
  ): void {
    this.apiHandlers.set(method, handler);
  }

  /**
   * Unregister API handler
   */
  unregisterAPIHandler(method: string): void {
    this.apiHandlers.delete(method);
  }

  /**
   * Emit event to plugins
   */
  emitEventToPlugins(eventType: string, data: unknown): void {
    const subscribedPlugins = this.eventSubscriptions.get(eventType);
    if (!subscribedPlugins) {
      return;
    }

    for (const pluginId of subscribedPlugins) {
      this.sendPluginMessage(pluginId, {
        type: 'event:emit',
        pluginId,
        payload: { eventType, data },
      }).catch((error) => {
        console.error(`Failed to emit event to plugin ${pluginId}:`, error);
      });
    }
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id || !manifest.name || !manifest.version || !manifest.url) {
      throw new Error('Invalid plugin manifest: missing required fields');
    }

    if (!Array.isArray(manifest.capabilities)) {
      throw new Error('Invalid plugin manifest: capabilities must be an array');
    }
  }

  /**
   * Request capabilities
   */
  private async requestCapabilities(
    pluginId: string,
    capabilities: PluginCapability[],
    required: boolean
  ): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      return;
    }

    for (const capability of capabilities) {
      // Check if auto-granted
      if (this.config.autoGrantCapabilities?.includes(capability)) {
        this.grantPermission(pluginId, capability);
        continue;
      }

      // Request permission from user
      const request: PluginPermissionRequest = {
        pluginId,
        pluginName: instance.manifest.name,
        capability,
      };

      this.permissionRequests$.next(request);

      // For now, auto-deny if not auto-granted
      // In production, wait for user response
      if (required) {
        throw new Error(`Required capability ${capability} not granted`);
      }
    }
  }

  /**
   * Create plugin iframe
   */
  private createPluginIframe(instance: PluginInstance): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.src = instance.manifest.url;
    iframe.sandbox.add(...(this.config.sandboxAttributes || []));
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.setAttribute('data-plugin-id', instance.manifest.id);
    return iframe;
  }

  /**
   * Get plugin context
   */
  private getPluginContext(instance: PluginInstance): unknown {
    return {
      manifest: instance.manifest,
      capabilities: instance.grantedCapabilities,
      playerVersion: '1.0.0', // TODO: Get from package.json
      sessionId: crypto.randomUUID(),
    };
  }

  /**
   * Setup message listener
   */
  private setupMessageListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event);
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    const message = event.data as PluginMessage;

    if (!message || !message.type || !message.pluginId) {
      return;
    }

    // Verify origin
    const instance = this.plugins.get(message.pluginId);
    if (!instance) {
      return;
    }

    // Handle message
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    }

    // Handle API calls
    if (message.type === 'api:call') {
      this.handleAPICall(message);
    }

    // Handle event subscriptions
    if (message.type === 'event:subscribe') {
      this.handleEventSubscribe(message);
    }

    if (message.type === 'event:unsubscribe') {
      this.handleEventUnsubscribe(message);
    }
  }

  /**
   * Handle API call
   */
  private async handleAPICall(message: PluginMessage): Promise<void> {
    const call = message.payload as PluginAPICall;
    const handler = this.apiHandlers.get(call.method);

    if (!handler) {
      this.sendPluginMessage(message.pluginId, {
        type: 'api:error',
        pluginId: message.pluginId,
        requestId: message.requestId,
        error: `Unknown API method: ${call.method}`,
      });
      return;
    }

    try {
      const result = await handler(...(call.params || []));
      this.sendPluginMessage(message.pluginId, {
        type: 'api:response',
        pluginId: message.pluginId,
        requestId: message.requestId,
        payload: { result },
      });
    } catch (error) {
      this.sendPluginMessage(message.pluginId, {
        type: 'api:error',
        pluginId: message.pluginId,
        requestId: message.requestId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle event subscribe
   */
  private handleEventSubscribe(message: PluginMessage): void {
    const { eventType } = message.payload as { eventType: string };
    
    if (!this.eventSubscriptions.has(eventType)) {
      this.eventSubscriptions.set(eventType, new Set());
    }
    
    this.eventSubscriptions.get(eventType)!.add(message.pluginId);
  }

  /**
   * Handle event unsubscribe
   */
  private handleEventUnsubscribe(message: PluginMessage): void {
    const { eventType } = message.payload as { eventType: string };
    
    const subscribers = this.eventSubscriptions.get(eventType);
    if (subscribers) {
      subscribers.delete(message.pluginId);
    }
  }

  /**
   * Clean up event subscriptions for plugin
   */
  private cleanupEventSubscriptions(pluginId: string): void {
    for (const [eventType, subscribers] of this.eventSubscriptions.entries()) {
      subscribers.delete(pluginId);
      if (subscribers.size === 0) {
        this.eventSubscriptions.delete(eventType);
      }
    }
  }

  /**
   * Send message to plugin
   */
  private async sendPluginMessage(
    pluginId: string,
    message: PluginMessage
  ): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance || !instance.iframe) {
      throw new Error(`Cannot send message to plugin ${pluginId}`);
    }

    instance.iframe.contentWindow?.postMessage(message, '*');
  }

  /**
   * Wait for plugin ready
   */
  private waitForPluginReady(pluginId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Plugin ${pluginId} did not become ready in time`));
      }, this.config.loadTimeout);

      const handler = (message: PluginMessage) => {
        if (message.pluginId === pluginId && message.type === 'plugin:ready') {
          clearTimeout(timeout);
          this.messageHandlers.delete('plugin:ready');
          resolve();
        }
      };

      this.messageHandlers.set('plugin:ready', handler);
    });
  }

  /**
   * Wait for plugin mounted
   */
  private waitForPluginMounted(pluginId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Plugin ${pluginId} did not mount in time`));
      }, this.config.loadTimeout);

      const handler = (message: PluginMessage) => {
        if (message.pluginId === pluginId && message.type === 'plugin:mounted') {
          clearTimeout(timeout);
          this.messageHandlers.delete('plugin:mounted');
          resolve();
        }
      };

      this.messageHandlers.set('plugin:mounted', handler);
    });
  }

  /**
   * Update plugin state
   */
  private updatePluginState(pluginId: string, state: PluginState): void {
    const instance = this.plugins.get(pluginId);
    if (instance) {
      instance.state = state;
      this.emitPluginsUpdate();
    }
  }

  /**
   * Handle plugin error
   */
  private handlePluginError(pluginId: string, error: Error): void {
    const instance = this.plugins.get(pluginId);
    if (instance) {
      instance.state = 'error';
      instance.error = error;
      this.emitPluginsUpdate();
    }
  }

  /**
   * Emit plugins update
   */
  private emitPluginsUpdate(): void {
    this.plugins$.next(new Map(this.plugins));
  }

  /**
   * Register default API handlers
   */
  private registerDefaultAPIHandlers(): void {
    // These will be implemented by the application
    // Just registering placeholders for now
    this.registerAPIHandler('getManifest', async () => ({}));
    this.registerAPIHandler('getPlayerState', async () => ({}));
    this.registerAPIHandler('getCurrentPanel', async () => ({ chapterId: '', panelId: '' }));
  }
}
