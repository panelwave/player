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
  PluginMessageType,
  PluginConfig,
  PluginCapability,
  PluginPermissionRequest,
  PluginAPICall,
} from '../types/plugin.types';

/** Origin used by browsers for opaque (e.g. sandboxed) documents. */
const OPAQUE_ORIGIN = 'null';

/** Messaging channel of a plugin iframe (internal). */
interface PluginChannel {
  /** Origin the plugin document runs in; OPAQUE_ORIGIN when opaque. */
  origin: string;
  /** Origins accepted on incoming messages from this plugin. */
  acceptedOrigins: Set<string>;
}

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
      // Lets a CROSS-origin plugin keep its real origin (storage, fetch with
      // credentials). It is stripped automatically for plugins served from the
      // host's own origin, where it would cancel the sandbox (see
      // createPluginIframe). postMessage works without it.
      'allow-same-origin',
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
   * Pending lifecycle waits (plugin:ready / plugin:mounted), keyed per plugin
   * AND message type so concurrent mounts never clobber each other.
   */
  private lifecycleWaiters = new Map<string, () => void>();

  /**
   * Channel info of each plugin whose iframe exists: the origin its document
   * runs in ('null' when opaque) and the set of origins accepted for incoming
   * messages.
   */
  private pluginChannels = new Map<string, PluginChannel>();

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

    const existing = manifest.id ? this.plugins.get(manifest.id) : undefined;
    if (existing) {
      if (existing.state !== 'error') {
        throw new Error(`Plugin ${manifest.id} is already loaded`);
      }
      // A previous load/mount failed: drop the stale record so it can be retried.
      this.removePluginRecord(manifest.id, existing);
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
      this.pluginChannels.delete(pluginId);

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

    // Remove iframe, subscriptions and the registry entry
    this.removePluginRecord(pluginId, instance);
  }

  /**
   * Remove a plugin's iframe, messaging channel, event subscriptions and
   * registry entry.
   */
  private removePluginRecord(pluginId: string, instance: PluginInstance): void {
    if (instance.iframe) {
      instance.iframe.remove();
      instance.iframe = null;
    }
    this.pluginChannels.delete(pluginId);
    this.cleanupEventSubscriptions(pluginId);
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
    const manifest = instance.manifest;
    const urlOrigin = this.resolveUrlOrigin(manifest.url);
    const hostOrigin = window.location.origin;

    let sandboxTokens = [...(this.config.sandboxAttributes || [])];
    // SECURITY: a plugin served from the host's own origin with both
    // `allow-scripts` and `allow-same-origin` could reach into the parent
    // document and simply remove its own sandbox. For such plugins we strip
    // `allow-same-origin` so they run in an opaque origin (they keep working,
    // postMessage does not need it). Cross-origin plugins keep the configured
    // tokens unchanged.
    if (urlOrigin === hostOrigin) {
      sandboxTokens = sandboxTokens.filter((token) => token !== 'allow-same-origin');
    }

    iframe.src = manifest.url;
    iframe.sandbox.add(...sandboxTokens);
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.setAttribute('data-plugin-id', manifest.id);

    // A sandboxed document without `allow-same-origin` has an opaque origin:
    // its messages carry event.origin === 'null' and it can only be addressed
    // with targetOrigin '*'. Its identity is then guaranteed by the
    // event.source check alone (see isTrustedPluginMessage).
    const sandboxed = iframe.hasAttribute('sandbox');
    const opaque = urlOrigin === OPAQUE_ORIGIN || (sandboxed && !iframe.sandbox.contains('allow-same-origin'));
    const origin = opaque ? OPAQUE_ORIGIN : urlOrigin;
    this.pluginChannels.set(manifest.id, {
      origin,
      acceptedOrigins: new Set([
        origin,
        ...(manifest.allowedOrigins || []),
        ...(this.config.allowedOrigins || []),
      ]),
    });

    return iframe;
  }

  /**
   * Origin a plugin URL's document runs in (before sandboxing).
   * about:/javascript: documents inherit the host origin; data: URLs and
   * unparseable URLs are opaque.
   */
  private resolveUrlOrigin(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url, document.baseURI);
    } catch {
      return OPAQUE_ORIGIN;
    }
    if (parsed.protocol === 'about:' || parsed.protocol === 'javascript:') {
      return window.location.origin;
    }
    return parsed.origin;
  }

  /**
   * Accept a message only if it comes from the claimed plugin's own iframe
   * window AND from an accepted origin of that plugin.
   */
  private isTrustedPluginMessage(
    event: MessageEvent,
    pluginId: string,
    instance: PluginInstance
  ): boolean {
    const contentWindow = instance.iframe?.contentWindow;
    if (!contentWindow || event.source !== contentWindow) {
      return false;
    }
    const channel = this.pluginChannels.get(pluginId);
    return !!channel && channel.acceptedOrigins.has(event.origin);
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

    const instance = this.plugins.get(message.pluginId);
    if (!instance) {
      return;
    }

    // Verify sender: must be this plugin's own iframe window and origin.
    // Without this any frame knowing a plugin id could spoof its messages.
    if (!this.isTrustedPluginMessage(event, message.pluginId, instance)) {
      return;
    }

    // Resolve a pending lifecycle wait of this plugin
    const waiter = this.lifecycleWaiters.get(this.waiterKey(message.pluginId, message.type));
    if (waiter) {
      waiter();
    }

    // Handle API calls (only from active plugins)
    if (message.type === 'api:call') {
      if (instance.state === 'mounted' || instance.state === 'updating') {
        void this.handleAPICall(message);
      }
    }

    // Handle event subscriptions (only while mounting or active)
    if (
      message.type === 'event:subscribe' &&
      (instance.state === 'mounting' || instance.state === 'mounted' || instance.state === 'updating')
    ) {
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
    const call = (message.payload || {}) as PluginAPICall;
    const handler = this.apiHandlers.get(call.method);

    let reply: PluginMessage;
    if (!handler) {
      reply = {
        type: 'api:error',
        pluginId: message.pluginId,
        requestId: message.requestId,
        error: `Unknown API method: ${call.method}`,
      };
    } else {
      try {
        const result = await handler(...(call.params || []));
        reply = {
          type: 'api:response',
          pluginId: message.pluginId,
          requestId: message.requestId,
          payload: { result },
        };
      } catch (error) {
        reply = {
          type: 'api:error',
          pluginId: message.pluginId,
          requestId: message.requestId,
          error: (error as Error).message,
        };
      }
    }

    try {
      await this.sendPluginMessage(message.pluginId, reply);
    } catch (error) {
      // The plugin may have been unmounted/disposed while the call ran.
      console.error(`Failed to answer API call of plugin ${message.pluginId}:`, error);
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

    // Target the plugin's own origin; only an opaque-origin (sandboxed)
    // document cannot be addressed by origin and needs '*' — the message still
    // only goes to that plugin's own window.
    const origin = this.pluginChannels.get(pluginId)?.origin ?? OPAQUE_ORIGIN;
    const targetOrigin = origin === OPAQUE_ORIGIN ? '*' : origin;
    instance.iframe.contentWindow?.postMessage(message, targetOrigin);
  }

  /**
   * Wait for plugin ready
   */
  private waitForPluginReady(pluginId: string): Promise<void> {
    return this.waitForLifecycleMessage(
      pluginId,
      'plugin:ready',
      `Plugin ${pluginId} did not become ready in time`
    );
  }

  /**
   * Wait for plugin mounted
   */
  private waitForPluginMounted(pluginId: string): Promise<void> {
    return this.waitForLifecycleMessage(
      pluginId,
      'plugin:mounted',
      `Plugin ${pluginId} did not mount in time`
    );
  }

  /**
   * Wait for a lifecycle message of ONE plugin. Waits are keyed per plugin and
   * type, and the entry is removed on success and on timeout.
   */
  private waitForLifecycleMessage(
    pluginId: string,
    type: PluginMessageType,
    timeoutMessage: string
  ): Promise<void> {
    const key = this.waiterKey(pluginId, type);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.lifecycleWaiters.get(key) === done) {
          this.lifecycleWaiters.delete(key);
        }
        reject(new Error(timeoutMessage));
      }, this.config.loadTimeout);

      const done = (): void => {
        clearTimeout(timeout);
        this.lifecycleWaiters.delete(key);
        resolve();
      };

      this.lifecycleWaiters.set(key, done);
    });
  }

  private waiterKey(pluginId: string, type: string): string {
    return `${pluginId}\u0000${type}`;
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
