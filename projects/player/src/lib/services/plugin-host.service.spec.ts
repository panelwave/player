/**
 * Unit tests for PluginHostService
 *
 * No remote URLs are ever loaded: plugin iframes are mounted into detached
 * containers (a detached iframe never navigates) and their contentWindow is
 * replaced with a fake whose postMessage is a spy. Incoming plugin messages
 * are simulated by invoking the service's window "message" listener with an
 * event-like object carrying `data`, `source` and `origin` (a real
 * MessageEvent cannot carry a fake window as its source).
 */

import { PluginHostService } from './plugin-host.service';
import type {
  PluginCapability,
  PluginInstance,
  PluginManifest,
  PluginMessage,
  PluginPermissionRequest,
  PluginState,
} from '../types/plugin.types';

describe('PluginHostService', () => {
  let service: PluginHostService;
  let messageListeners: EventListenerOrEventListenerObject[];

  const HOST_ORIGIN = window.location.origin;
  const CROSS_ORIGIN = 'https://plugins.example.com';
  const CROSS_URL = `${CROSS_ORIGIN}/widget/index.html`;

  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  /** Deliver a raw message event to the service's listener(s). */
  const sendRaw = (data: unknown, source: unknown = null, origin = HOST_ORIGIN): void => {
    const event = { data, source, origin } as unknown as MessageEvent;
    for (const listener of messageListeners) {
      (listener as EventListener)(event);
    }
  };

  /** A sourceless message (e.g. from the host page itself). */
  const send = (data: unknown): void => sendRaw(data);

  /**
   * Message sent by the plugin's own iframe window. Sandboxed plugins
   * (the default for about:blank / same-origin URLs) have the opaque origin "null".
   */
  const fromPlugin = (data: PluginMessage | Record<string, unknown>, origin = 'null', id?: string): void => {
    const pluginId = id ?? (data as { pluginId: string }).pluginId;
    const source = service.getPlugin(pluginId)?.iframe?.contentWindow ?? null;
    sendRaw(data, source, origin);
  };

  const manifest = (overrides: Partial<PluginManifest> = {}): PluginManifest => ({
    id: 'p1',
    name: 'Plugin One',
    version: '1.0.0',
    url: 'about:blank',
    capabilities: ['read-manifest'],
    ...overrides,
  });

  interface Mounted {
    container: HTMLElement;
    iframe: HTMLIFrameElement;
    post: jasmine.Spy;
  }

  /** Put a fake window behind an iframe so postMessage can be observed. */
  const fakeContentWindow = (iframe: HTMLIFrameElement): jasmine.Spy => {
    const post = jasmine.createSpy('postMessage');
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: post },
      configurable: true,
    });
    return post;
  };

  /** Drive the full mount handshake: ready -> mount message -> mounted. */
  const mount = async (id = 'p1', origin = 'null'): Promise<Mounted> => {
    const container = document.createElement('div');
    const done = service.mountPlugin(id, container);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const post = fakeContentWindow(iframe);
    fromPlugin({ type: 'plugin:ready', pluginId: id }, origin);
    await flush();
    fromPlugin({ type: 'plugin:mounted', pluginId: id }, origin);
    await done;
    return { container, iframe, post };
  };

  const sentMessages = (post: jasmine.Spy): PluginMessage[] =>
    post.calls.allArgs().map((args) => args[0] as PluginMessage);

  const stateOf = (id: string): PluginState | undefined => service.getPlugin(id)?.state;

  const pendingWaits = (): number =>
    (service as unknown as { lifecycleWaiters: Map<string, unknown> }).lifecycleWaiters.size;

  beforeEach(() => {
    messageListeners = [];
    const original = window.addEventListener.bind(window);
    spyOn(window, 'addEventListener').and.callFake(
      (type: string, listener: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
        if (type === 'message') {
          messageListeners.push(listener);
        }
        original(type, listener, opts);
      }
    );
    service = new PluginHostService();
  });

  afterEach(() => {
    for (const listener of messageListeners) {
      window.removeEventListener('message', listener);
    }
  });

  describe('construction & configuration', () => {
    it('registers exactly one window message listener', () => {
      expect(messageListeners.length).toBe(1);
    });

    it('exposes a sane default configuration', () => {
      const config = service.getConfig();
      expect(config.enabled).toBeTrue();
      expect(config.maxPlugins).toBe(10);
      expect(config.loadTimeout).toBe(10000);
      expect(config.sandboxAttributes).toEqual(['allow-scripts', 'allow-same-origin']);
      expect(config.autoGrantCapabilities).toEqual(['read-manifest', 'read-state']);
    });

    it('configure merges partial config and getConfig returns a copy', () => {
      service.configure({ maxPlugins: 2, loadTimeout: 50 });
      const config = service.getConfig();
      expect(config.maxPlugins).toBe(2);
      expect(config.loadTimeout).toBe(50);
      expect(config.enabled).toBeTrue();

      config.maxPlugins = 99;
      expect(service.getConfig().maxPlugins).toBe(2);
    });

    it('ignores real window messages that have no plugin source', async () => {
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      service.configure({ loadTimeout: 30 });
      const done = service.mountPlugin('p1', container);
      fakeContentWindow(container.querySelector('iframe')!);
      window.postMessage({ type: 'plugin:ready', pluginId: 'p1' }, '*');
      await expectAsync(done).toBeRejectedWithError('Plugin p1 did not become ready in time');
    });
  });

  describe('loadPlugin', () => {
    it('loads a plugin, auto-grants capabilities and moves to "loaded"', async () => {
      const emitted: Map<string, PluginInstance>[] = [];
      service.getPlugins$().subscribe((m) => emitted.push(m));

      await service.loadPlugin(manifest({ capabilities: ['read-manifest', 'read-state'] }));

      const instance = service.getPlugin('p1')!;
      expect(instance.state).toBe('loaded');
      expect(instance.iframe).toBeNull();
      expect(instance.grantedCapabilities).toEqual(['read-manifest', 'read-state']);
      expect(instance.deniedCapabilities).toEqual([]);
      // initial empty map + registered + one per grant + loaded
      expect(emitted[0].size).toBe(0);
      expect(emitted[emitted.length - 1].get('p1')?.state).toBe('loaded');
    });

    it('getPlugins returns a defensive copy of the registry', async () => {
      await service.loadPlugin(manifest());
      const copy = service.getPlugins();
      copy.delete('p1');
      expect(service.getPlugins().has('p1')).toBeTrue();
    });

    it('rejects when the plugin system is disabled', async () => {
      service.configure({ enabled: false });
      await expectAsync(service.loadPlugin(manifest())).toBeRejectedWithError('Plugin system is disabled');
      expect(service.getPlugin('p1')).toBeUndefined();
    });

    it('rejects loading the same plugin id twice', async () => {
      await service.loadPlugin(manifest());
      await expectAsync(service.loadPlugin(manifest())).toBeRejectedWithError('Plugin p1 is already loaded');
    });

    it('enforces maxPlugins', async () => {
      service.configure({ maxPlugins: 1 });
      await service.loadPlugin(manifest());
      await expectAsync(service.loadPlugin(manifest({ id: 'p2' }))).toBeRejectedWithError(
        'Maximum number of plugins reached'
      );
    });

    it('does not limit the number of plugins when maxPlugins is 0', async () => {
      service.configure({ maxPlugins: 0 });
      await service.loadPlugin(manifest({ id: 'a' }));
      await service.loadPlugin(manifest({ id: 'b' }));
      expect(service.getPlugins().size).toBe(2);
    });

    for (const field of ['id', 'name', 'version', 'url'] as const) {
      it(`rejects a manifest without "${field}"`, async () => {
        await expectAsync(service.loadPlugin(manifest({ [field]: '' }))).toBeRejectedWithError(
          'Invalid plugin manifest: missing required fields'
        );
        expect(service.getPlugins().size).toBe(0);
      });
    }

    it('rejects a manifest whose capabilities is not an array', async () => {
      const bad = manifest({ capabilities: 'read-state' as unknown as PluginCapability[] });
      await expectAsync(service.loadPlugin(bad)).toBeRejectedWithError(
        'Invalid plugin manifest: capabilities must be an array'
      );
    });

    it('requests permission for a non-auto-granted required capability and fails the load', async () => {
      const requests: PluginPermissionRequest[] = [];
      service.getPermissionRequests$().subscribe((r) => requests.push(r));

      await expectAsync(
        service.loadPlugin(manifest({ capabilities: ['read-state', 'network'] }))
      ).toBeRejectedWithError('Required capability network not granted');

      expect(requests).toEqual([{ pluginId: 'p1', pluginName: 'Plugin One', capability: 'network' }]);
      const instance = service.getPlugin('p1')!;
      expect(instance.state).toBe('error');
      expect(instance.error?.message).toBe('Required capability network not granted');
      expect(instance.grantedCapabilities).toEqual(['read-state']);
    });

    it('requests optional capabilities without failing and auto-grants optional auto capabilities', async () => {
      const requests: PluginPermissionRequest[] = [];
      service.getPermissionRequests$().subscribe((r) => requests.push(r));

      await service.loadPlugin(
        manifest({ capabilities: [], optionalCapabilities: ['clipboard', 'read-state', 'storage'] })
      );

      expect(stateOf('p1')).toBe('loaded');
      expect(requests.map((r) => r.capability)).toEqual(['clipboard', 'storage']);
      expect(service.getPlugin('p1')!.grantedCapabilities).toEqual(['read-state']);
    });

    it('treats every capability as needing a prompt when autoGrantCapabilities is unset', async () => {
      service.configure({ autoGrantCapabilities: undefined });
      await expectAsync(service.loadPlugin(manifest())).toBeRejectedWithError(
        'Required capability read-manifest not granted'
      );
    });

    describe('retry after failure (bug: failed load blocked retries)', () => {
      it('allows re-loading a plugin whose load failed', async () => {
        await expectAsync(service.loadPlugin(manifest({ capabilities: ['network'] }))).toBeRejected();
        expect(stateOf('p1')).toBe('error');

        await service.loadPlugin(manifest());

        const instance = service.getPlugin('p1')!;
        expect(instance.state).toBe('loaded');
        expect(instance.error).toBeUndefined();
        expect(instance.grantedCapabilities).toEqual(['read-manifest']);
      });

      it('re-loading a plugin whose mount failed removes the stale iframe and allows a fresh mount', async () => {
        service.configure({ loadTimeout: 20 });
        await service.loadPlugin(manifest());
        const oldContainer = document.createElement('div');
        await expectAsync(service.mountPlugin('p1', oldContainer)).toBeRejected();
        expect(oldContainer.querySelector('iframe')).not.toBeNull();

        await service.loadPlugin(manifest());
        expect(oldContainer.children.length).toBe(0);
        expect(stateOf('p1')).toBe('loaded');

        service.configure({ loadTimeout: 1000 });
        await mount();
        expect(stateOf('p1')).toBe('mounted');
      });

      it('a failed record does not count against maxPlugins on retry', async () => {
        service.configure({ maxPlugins: 1 });
        await expectAsync(service.loadPlugin(manifest({ capabilities: ['network'] }))).toBeRejected();
        await service.loadPlugin(manifest());
        expect(stateOf('p1')).toBe('loaded');
      });
    });
  });

  describe('grantPermission / denyPermission', () => {
    beforeEach(async () => {
      await service.loadPlugin(manifest({ capabilities: [] }));
    });

    it('grant adds once and removes from denied', () => {
      service.denyPermission('p1', 'network');
      expect(service.getPlugin('p1')!.deniedCapabilities).toEqual(['network']);

      service.grantPermission('p1', 'network');
      service.grantPermission('p1', 'network');
      const instance = service.getPlugin('p1')!;
      expect(instance.grantedCapabilities).toEqual(['network']);
      expect(instance.deniedCapabilities).toEqual([]);
    });

    it('deny adds once and removes from granted', () => {
      service.grantPermission('p1', 'storage');
      service.denyPermission('p1', 'storage');
      service.denyPermission('p1', 'storage');
      const instance = service.getPlugin('p1')!;
      expect(instance.deniedCapabilities).toEqual(['storage']);
      expect(instance.grantedCapabilities).toEqual([]);
    });

    it('emits a registry update on each change', () => {
      const spy = jasmine.createSpy('plugins$');
      service.getPlugins$().subscribe(spy);
      spy.calls.reset();
      service.grantPermission('p1', 'network');
      service.denyPermission('p1', 'network');
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('ignores unknown plugins', () => {
      const spy = jasmine.createSpy('plugins$');
      service.getPlugins$().subscribe(spy);
      spy.calls.reset();
      service.grantPermission('nope', 'network');
      service.denyPermission('nope', 'network');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('mountPlugin', () => {
    it('rejects for an unknown plugin', async () => {
      await expectAsync(service.mountPlugin('ghost', document.createElement('div'))).toBeRejectedWithError(
        'Plugin ghost not found'
      );
    });

    it('rejects when the plugin is not in the loaded state', async () => {
      await expectAsync(service.loadPlugin(manifest({ capabilities: ['network'] }))).toBeRejected();
      await expectAsync(service.mountPlugin('p1', document.createElement('div'))).toBeRejectedWithError(
        'Plugin p1 is not in loaded state'
      );
    });

    it('creates a sandboxed iframe, performs the ready/mount handshake and ends "mounted"', async () => {
      await service.loadPlugin(manifest({ capabilities: ['read-manifest'] }));
      const { container, iframe, post } = await mount();

      expect(container.children.length).toBe(1);
      expect(iframe.getAttribute('src')).toBe('about:blank');
      expect(iframe.getAttribute('data-plugin-id')).toBe('p1');
      expect(iframe.sandbox.contains('allow-scripts')).toBeTrue();
      // about:blank inherits the host origin -> allow-same-origin is stripped
      expect(iframe.sandbox.contains('allow-same-origin')).toBeFalse();
      expect(iframe.style.width).toBe('100%');
      expect(iframe.style.height).toBe('100%');
      expect(iframe.style.borderStyle).toBe('none');

      const instance = service.getPlugin('p1')!;
      expect(instance.state).toBe('mounted');
      expect(instance.iframe).toBe(iframe);
      expect(instance.mountedAt).toEqual(jasmine.any(Date));

      const messages = sentMessages(post);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('plugin:mount');
      expect(messages[0].pluginId).toBe('p1');
      const context = (messages[0].payload as { context: Record<string, unknown> }).context;
      expect(context['manifest']).toEqual(instance.manifest);
      expect(context['capabilities']).toEqual(['read-manifest']);
      expect(context['playerVersion']).toBe('1.0.0');
      expect(context['sessionId']).toMatch(/^[0-9a-f-]{36}$/);
      // opaque-origin plugin: cannot be addressed by origin
      expect(post.calls.mostRecent().args[1]).toBe('*');
    });

    it('uses no sandbox tokens when sandboxAttributes is unset', async () => {
      service.configure({ sandboxAttributes: undefined });
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      const iframe = container.querySelector('iframe')!;
      const post = fakeContentWindow(iframe);
      // An empty sandbox attribute (Chrome sets one even for add() without
      // tokens) means a fully restricted, opaque-origin document; without the
      // attribute the about:blank plugin would run in the host origin.
      const origin = iframe.hasAttribute('sandbox') ? 'null' : HOST_ORIGIN;
      fromPlugin({ type: 'plugin:ready', pluginId: 'p1' }, origin);
      await flush();
      fromPlugin({ type: 'plugin:mounted', pluginId: 'p1' }, origin);
      await done;

      expect(iframe.sandbox.length).toBe(0);
      expect(stateOf('p1')).toBe('mounted');
      expect(post.calls.mostRecent().args[1]).toBe(origin === 'null' ? '*' : HOST_ORIGIN);
    });

    it('passes through the "mounting" state while waiting for ready', async () => {
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      expect(stateOf('p1')).toBe('mounting');
      fakeContentWindow(container.querySelector('iframe')!);
      fromPlugin({ type: 'plugin:ready', pluginId: 'p1' });
      await flush();
      fromPlugin({ type: 'plugin:mounted', pluginId: 'p1' });
      await done;
      expect(stateOf('p1')).toBe('mounted');
    });

    it('ignores ready/mounted messages that claim another registered plugin id', async () => {
      service.configure({ loadTimeout: 60 });
      await service.loadPlugin(manifest());
      await service.loadPlugin(manifest({ id: 'p2', name: 'Two' }));
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      fakeContentWindow(container.querySelector('iframe')!);
      const p1Window = service.getPlugin('p1')!.iframe!.contentWindow;

      sendRaw({ type: 'plugin:ready', pluginId: 'p2' }, p1Window, 'null');
      await flush();
      expect(stateOf('p1')).toBe('mounting');

      fromPlugin({ type: 'plugin:ready', pluginId: 'p1' });
      await flush();
      sendRaw({ type: 'plugin:mounted', pluginId: 'p2' }, p1Window, 'null');
      await flush();
      expect(stateOf('p1')).toBe('mounting');

      fromPlugin({ type: 'plugin:mounted', pluginId: 'p1' });
      await done;
      expect(stateOf('p1')).toBe('mounted');
    });

    it('fails with a timeout when the plugin never becomes ready', async () => {
      service.configure({ loadTimeout: 20 });
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      await expectAsync(service.mountPlugin('p1', container)).toBeRejectedWithError(
        'Plugin p1 did not become ready in time'
      );
      const instance = service.getPlugin('p1')!;
      expect(instance.state).toBe('error');
      expect(instance.error?.message).toBe('Plugin p1 did not become ready in time');
      // iframe stays attached after a failed mount
      expect(container.querySelector('iframe')).not.toBeNull();
    });

    it('fails with a timeout when the plugin never confirms the mount', async () => {
      service.configure({ loadTimeout: 30 });
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      fakeContentWindow(container.querySelector('iframe')!);
      fromPlugin({ type: 'plugin:ready', pluginId: 'p1' });
      await expectAsync(done).toBeRejectedWithError('Plugin p1 did not mount in time');
      expect(stateOf('p1')).toBe('error');
    });

    describe('concurrent mounts (bug: one shared wait slot per message type)', () => {
      it('mounting A then B before A is ready lets both complete', async () => {
        service.configure({ loadTimeout: 200 });
        await service.loadPlugin(manifest({ id: 'a', name: 'A' }));
        await service.loadPlugin(manifest({ id: 'b', name: 'B' }));
        const containerA = document.createElement('div');
        const containerB = document.createElement('div');
        const doneA = service.mountPlugin('a', containerA);
        const doneB = service.mountPlugin('b', containerB);
        fakeContentWindow(containerA.querySelector('iframe')!);
        fakeContentWindow(containerB.querySelector('iframe')!);

        fromPlugin({ type: 'plugin:ready', pluginId: 'a' });
        fromPlugin({ type: 'plugin:ready', pluginId: 'b' });
        await flush();
        fromPlugin({ type: 'plugin:mounted', pluginId: 'b' });
        fromPlugin({ type: 'plugin:mounted', pluginId: 'a' });

        await expectAsync(doneA).toBeResolved();
        await expectAsync(doneB).toBeResolved();
        expect(stateOf('a')).toBe('mounted');
        expect(stateOf('b')).toBe('mounted');
        expect(pendingWaits()).toBe(0);
      });

      it('removes the pending wait when it times out', async () => {
        service.configure({ loadTimeout: 20 });
        await service.loadPlugin(manifest());
        const pending = service.mountPlugin('p1', document.createElement('div'));
        expect(pendingWaits()).toBe(1);
        await expectAsync(pending).toBeRejected();
        expect(pendingWaits()).toBe(0);
      });

      it('a timed-out wait of A does not affect a concurrent wait of B', async () => {
        service.configure({ loadTimeout: 30 });
        await service.loadPlugin(manifest({ id: 'a', name: 'A' }));
        await service.loadPlugin(manifest({ id: 'b', name: 'B' }));
        const doneA = service.mountPlugin('a', document.createElement('div'));
        const containerB = document.createElement('div');
        const doneB = service.mountPlugin('b', containerB);
        fakeContentWindow(containerB.querySelector('iframe')!);

        fromPlugin({ type: 'plugin:ready', pluginId: 'b' });
        await flush();
        await expectAsync(doneA).toBeRejectedWithError('Plugin a did not become ready in time');
        fromPlugin({ type: 'plugin:mounted', pluginId: 'b' });
        await expectAsync(doneB).toBeResolved();
        expect(stateOf('b')).toBe('mounted');
      });
    });
  });

  describe('origin policy (bug: no source/origin check)', () => {
    it('rejects messages claiming a plugin id but coming from another window', async () => {
      service.configure({ loadTimeout: 40 });
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      fakeContentWindow(container.querySelector('iframe')!);

      sendRaw({ type: 'plugin:ready', pluginId: 'p1' }, window, 'null');
      sendRaw({ type: 'plugin:ready', pluginId: 'p1' }, { postMessage: () => undefined }, 'null');
      sendRaw({ type: 'plugin:ready', pluginId: 'p1' }, null, HOST_ORIGIN);

      await expectAsync(done).toBeRejectedWithError('Plugin p1 did not become ready in time');
    });

    it('a mounted plugin cannot spoof api calls or subscriptions for another plugin', async () => {
      await service.loadPlugin(manifest({ id: 'a', name: 'A' }));
      await service.loadPlugin(manifest({ id: 'b', name: 'B' }));
      const a = await mount('a');
      const b = await mount('b');
      a.post.calls.reset();
      b.post.calls.reset();
      const aWindow = service.getPlugin('a')!.iframe!.contentWindow;

      sendRaw({ type: 'api:call', pluginId: 'b', requestId: 'x', payload: { method: 'getManifest' } }, aWindow, 'null');
      sendRaw({ type: 'event:subscribe', pluginId: 'b', payload: { eventType: 'tick' } }, aWindow, 'null');
      await flush();
      service.emitEventToPlugins('tick', 1);
      await flush();

      expect(a.post).not.toHaveBeenCalled();
      expect(b.post).not.toHaveBeenCalled();
    });

    it('rejects messages from the right window but with a foreign origin', async () => {
      await service.loadPlugin(manifest());
      const { post } = await mount();
      post.calls.reset();

      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r', payload: { method: 'getManifest' } }, 'https://evil.example');
      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r', payload: { method: 'getManifest' } }, HOST_ORIGIN);
      await flush();
      expect(post).not.toHaveBeenCalled();

      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r', payload: { method: 'getManifest' } }, 'null');
      await flush();
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('cross-origin plugin keeps allow-same-origin, is addressed by its origin and only its origin is accepted', async () => {
      await service.loadPlugin(manifest({ url: CROSS_URL }));
      const { iframe, post } = await mount('p1', CROSS_ORIGIN);

      expect(iframe.sandbox.contains('allow-same-origin')).toBeTrue();
      expect(iframe.sandbox.contains('allow-scripts')).toBeTrue();
      expect(stateOf('p1')).toBe('mounted');
      expect(post.calls.mostRecent().args[1]).toBe(CROSS_ORIGIN);

      post.calls.reset();
      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r1', payload: { method: 'getManifest' } }, 'null');
      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r2', payload: { method: 'getManifest' } }, HOST_ORIGIN);
      await flush();
      expect(post).not.toHaveBeenCalled();

      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r3', payload: { method: 'getManifest' } }, CROSS_ORIGIN);
      await flush();
      expect(sentMessages(post).map((m) => m.requestId)).toEqual(['r3']);
      expect(post.calls.mostRecent().args[1]).toBe(CROSS_ORIGIN);

      await service.updatePlugin('p1', { a: 1 });
      expect(post.calls.mostRecent().args[1]).toBe(CROSS_ORIGIN);
    });

    it('accepts the extra origins listed in manifest.allowedOrigins and config.allowedOrigins', async () => {
      service.configure({ allowedOrigins: ['https://cdn.example.net'] });
      await service.loadPlugin(manifest({ url: CROSS_URL, allowedOrigins: ['https://auth.example.org'] }));
      const { post } = await mount('p1', CROSS_ORIGIN);
      post.calls.reset();

      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'm', payload: { method: 'getManifest' } }, 'https://auth.example.org');
      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'c', payload: { method: 'getManifest' } }, 'https://cdn.example.net');
      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'x', payload: { method: 'getManifest' } }, 'https://other.example');
      await flush();

      expect(sentMessages(post).map((m) => m.requestId)).toEqual(['m', 'c']);
    });

    it('same-origin plugin URL: allow-same-origin is stripped and it is treated as opaque ("null")', async () => {
      await service.loadPlugin(manifest({ url: '/assets/plugins/local.html' }));
      const { iframe, post } = await mount('p1', 'null');

      expect(iframe.sandbox.contains('allow-scripts')).toBeTrue();
      expect(iframe.sandbox.contains('allow-same-origin')).toBeFalse();
      expect(stateOf('p1')).toBe('mounted');
      expect(post.calls.mostRecent().args[1]).toBe('*');

      post.calls.reset();
      fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r', payload: { method: 'getManifest' } }, HOST_ORIGIN);
      await flush();
      expect(post).not.toHaveBeenCalled();
    });

    it('same-origin plugin with an absolute URL is also stripped of allow-same-origin', async () => {
      await service.loadPlugin(manifest({ url: `${HOST_ORIGIN}/plugin.html` }));
      const { iframe } = await mount('p1', 'null');
      expect(iframe.sandbox.contains('allow-same-origin')).toBeFalse();
    });

    it('data: URL plugins are opaque even without a sandbox', async () => {
      service.configure({ sandboxAttributes: undefined });
      await service.loadPlugin(manifest({ url: 'data:text/html,<p>hi</p>' }));
      const { post } = await mount('p1', 'null');
      expect(stateOf('p1')).toBe('mounted');
      expect(post.calls.mostRecent().args[1]).toBe('*');
    });

    it('an unparseable plugin URL is treated as opaque', async () => {
      await service.loadPlugin(manifest({ url: 'http://[bad-host' }));
      const { post } = await mount('p1', 'null');
      expect(stateOf('p1')).toBe('mounted');
      expect(post.calls.mostRecent().args[1]).toBe('*');
    });
  });

  describe('updatePlugin', () => {
    it('is a no-op for unknown or non-mounted plugins', async () => {
      await service.updatePlugin('ghost', {});
      await service.loadPlugin(manifest());
      await service.updatePlugin('p1', { x: 1 });
      expect(stateOf('p1')).toBe('loaded');
    });

    it('posts the update payload and returns to "mounted"', async () => {
      await service.loadPlugin(manifest());
      const { post } = await mount();
      post.calls.reset();

      await service.updatePlugin('p1', { panelId: 'panel-2' });

      expect(sentMessages(post)).toEqual([{ type: 'plugin:update', pluginId: 'p1', payload: { panelId: 'panel-2' } }]);
      expect(stateOf('p1')).toBe('mounted');
    });

    it('moves to the error state when the message cannot be delivered', async () => {
      await service.loadPlugin(manifest());
      await mount();
      service.getPlugin('p1')!.iframe = null;

      await service.updatePlugin('p1', {});

      const instance = service.getPlugin('p1')!;
      expect(instance.state).toBe('error');
      expect(instance.error?.message).toBe('Cannot send message to plugin p1');
    });
  });

  describe('unmountPlugin', () => {
    it('is a no-op for unknown or non-mounted plugins', async () => {
      await service.unmountPlugin('ghost');
      await service.loadPlugin(manifest());
      await service.unmountPlugin('p1');
      expect(stateOf('p1')).toBe('loaded');
    });

    it('sends unmount, removes the iframe, drops event subscriptions and returns to "loaded"', async () => {
      await service.loadPlugin(manifest());
      const { container, post } = await mount();
      fromPlugin({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'panel:change' } });
      post.calls.reset();

      await service.unmountPlugin('p1');

      expect(sentMessages(post)).toEqual([{ type: 'plugin:unmount', pluginId: 'p1' }]);
      expect(container.children.length).toBe(0);
      expect(service.getPlugin('p1')!.iframe).toBeNull();
      expect(stateOf('p1')).toBe('loaded');

      // subscription was cleaned up: emitting reaches nobody
      post.calls.reset();
      service.emitEventToPlugins('panel:change', {});
      await flush();
      expect(post).not.toHaveBeenCalled();
    });

    it('keeps subscriptions of other plugins when cleaning up', async () => {
      await service.loadPlugin(manifest());
      await service.loadPlugin(manifest({ id: 'p2', name: 'Two' }));
      await mount('p1');
      const second = await mount('p2');
      fromPlugin({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'tick' } });
      fromPlugin({ type: 'event:subscribe', pluginId: 'p2', payload: { eventType: 'tick' } });

      await service.unmountPlugin('p1');
      second.post.calls.reset();
      service.emitEventToPlugins('tick', 1);
      await flush();

      expect(sentMessages(second.post)).toEqual([
        { type: 'event:emit', pluginId: 'p2', payload: { eventType: 'tick', data: 1 } },
      ]);
    });

    it('moves to the error state when the unmount message cannot be delivered', async () => {
      await service.loadPlugin(manifest());
      await mount();
      service.getPlugin('p1')!.iframe = null;

      await service.unmountPlugin('p1');

      expect(stateOf('p1')).toBe('error');
    });
  });

  describe('disposePlugin', () => {
    it('is a no-op for unknown plugins', async () => {
      await expectAsync(service.disposePlugin('ghost')).toBeResolved();
    });

    it('unmounts a mounted plugin, then removes it from the registry', async () => {
      await service.loadPlugin(manifest());
      const { container, post } = await mount();
      post.calls.reset();
      const emitted: Map<string, PluginInstance>[] = [];
      service.getPlugins$().subscribe((m) => emitted.push(m));

      await service.disposePlugin('p1');

      // dispose message cannot be delivered after unmount (iframe gone) and is swallowed
      expect(sentMessages(post).map((m) => m.type)).toEqual(['plugin:unmount']);
      expect(container.children.length).toBe(0);
      expect(service.getPlugin('p1')).toBeUndefined();
      expect(emitted[emitted.length - 1].has('p1')).toBeFalse();
    });

    it('sends dispose and removes a leftover iframe of a failed mount', async () => {
      service.configure({ loadTimeout: 20 });
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      const post = fakeContentWindow(container.querySelector('iframe')!);
      await expectAsync(done).toBeRejected();

      await service.disposePlugin('p1');

      expect(sentMessages(post)).toEqual([{ type: 'plugin:dispose', pluginId: 'p1' }]);
      expect(container.children.length).toBe(0);
      expect(service.getPlugin('p1')).toBeUndefined();
    });

    it('removes a loaded (never mounted) plugin', async () => {
      await service.loadPlugin(manifest());
      await service.disposePlugin('p1');
      expect(service.getPlugins().size).toBe(0);
      // the id can be loaded again afterwards
      await service.loadPlugin(manifest());
      expect(stateOf('p1')).toBe('loaded');
    });

    it('drops event subscriptions of a plugin that is not mounted (bug: leaked subscriptions)', async () => {
      service.configure({ loadTimeout: 30 });
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      fakeContentWindow(container.querySelector('iframe')!);
      fromPlugin({ type: 'plugin:ready', pluginId: 'p1' });
      await flush();
      // subscribes while mounting, then never confirms the mount
      fromPlugin({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'tick' } });
      await expectAsync(done).toBeRejected();
      expect(stateOf('p1')).toBe('error');

      await service.disposePlugin('p1');

      const errorSpy = spyOn(console, 'error');
      service.emitEventToPlugins('tick', 1);
      await flush();
      expect(errorSpy).not.toHaveBeenCalled();
      expect((service as unknown as { eventSubscriptions: Map<string, unknown> }).eventSubscriptions.size).toBe(0);
    });
  });

  describe('incoming message handling', () => {
    it('ignores malformed messages and messages from unknown plugins', async () => {
      await service.loadPlugin(manifest());
      const { post } = await mount();
      post.calls.reset();
      const p1Window = service.getPlugin('p1')!.iframe!.contentWindow;

      send(null);
      send('string payload');
      sendRaw({ pluginId: 'p1' }, p1Window, 'null');
      sendRaw({ type: 'api:call' }, p1Window, 'null');
      sendRaw({ type: 'api:call', pluginId: 'stranger', payload: { method: 'getManifest' } }, p1Window, 'null');
      await flush();

      expect(post).not.toHaveBeenCalled();
    });

    describe('api:call', () => {
      let post: jasmine.Spy;

      beforeEach(async () => {
        await service.loadPlugin(manifest());
        post = (await mount()).post;
        post.calls.reset();
      });

      it('answers default handlers with api:response', async () => {
        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r1', payload: { method: 'getCurrentPanel' } });
        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r2', payload: { method: 'getManifest' } });
        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r3', payload: { method: 'getPlayerState' } });
        await flush();

        expect(sentMessages(post)).toEqual([
          { type: 'api:response', pluginId: 'p1', requestId: 'r1', payload: { result: { chapterId: '', panelId: '' } } },
          { type: 'api:response', pluginId: 'p1', requestId: 'r2', payload: { result: {} } },
          { type: 'api:response', pluginId: 'p1', requestId: 'r3', payload: { result: {} } },
        ]);
      });

      it('passes params to a registered handler and returns its result', async () => {
        const handler = jasmine.createSpy('sum').and.callFake(async (...args: unknown[]) =>
          (args as number[]).reduce((a, b) => a + b, 0)
        );
        service.registerAPIHandler('sum', handler);

        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r9', payload: { method: 'sum', params: [1, 2, 3] } });
        await flush();

        expect(handler).toHaveBeenCalledWith(1, 2, 3);
        expect(sentMessages(post)).toEqual([
          { type: 'api:response', pluginId: 'p1', requestId: 'r9', payload: { result: 6 } },
        ]);
      });

      it('calls the handler with no arguments when params are omitted', async () => {
        const handler = jasmine.createSpy('noop').and.resolveTo('ok');
        service.registerAPIHandler('noop', handler);
        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r', payload: { method: 'noop' } });
        await flush();
        expect(handler).toHaveBeenCalledWith();
      });

      it('replies with api:error for unknown methods', async () => {
        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r4', payload: { method: 'selfDestruct' } });
        await flush();
        expect(sentMessages(post)).toEqual([
          { type: 'api:error', pluginId: 'p1', requestId: 'r4', error: 'Unknown API method: selfDestruct' },
        ]);
      });

      it('replies with api:error when the call has no payload', async () => {
        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r0' });
        await flush();
        expect(sentMessages(post)).toEqual([
          { type: 'api:error', pluginId: 'p1', requestId: 'r0', error: 'Unknown API method: undefined' },
        ]);
      });

      it('replies with api:error when the handler rejects', async () => {
        service.registerAPIHandler('fail', async () => {
          throw new Error('kaputt');
        });
        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r5', payload: { method: 'fail' } });
        await flush();
        expect(sentMessages(post)).toEqual([{ type: 'api:error', pluginId: 'p1', requestId: 'r5', error: 'kaputt' }]);
      });

      it('unregisterAPIHandler makes the method unknown', async () => {
        service.unregisterAPIHandler('getManifest');
        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r6', payload: { method: 'getManifest' } });
        await flush();
        expect(sentMessages(post)[0].type).toBe('api:error');
        expect(sentMessages(post)[0].error).toBe('Unknown API method: getManifest');
      });

      it('logs (no unhandled rejection) when the reply cannot be delivered anymore', async () => {
        const errorSpy = spyOn(console, 'error');
        let release!: (value: unknown) => void;
        service.registerAPIHandler('slow', () => new Promise((resolve) => (release = resolve)));
        const unhandled = jasmine.createSpy('unhandledrejection');
        window.addEventListener('unhandledrejection', unhandled);

        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r7', payload: { method: 'slow' } });
        await flush();
        await service.unmountPlugin('p1');
        release('late');
        await flush();
        await flush();

        window.removeEventListener('unhandledrejection', unhandled);
        expect(errorSpy).toHaveBeenCalledWith('Failed to answer API call of plugin p1:', jasmine.any(Error));
        expect(unhandled).not.toHaveBeenCalled();
      });
    });

    describe('api:call from non-mounted plugins (bug: unhandled rejection)', () => {
      it('ignores api calls while the plugin is still mounting', async () => {
        await service.loadPlugin(manifest());
        const container = document.createElement('div');
        const done = service.mountPlugin('p1', container);
        const post = fakeContentWindow(container.querySelector('iframe')!);
        const handler = jasmine.createSpy('getManifest').and.resolveTo({});
        service.registerAPIHandler('getManifest', handler);

        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'early', payload: { method: 'getManifest' } });
        await flush();
        expect(handler).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();

        fromPlugin({ type: 'plugin:ready', pluginId: 'p1' });
        await flush();
        fromPlugin({ type: 'plugin:mounted', pluginId: 'p1' });
        await done;
      });

      it('ignores api calls from a plugin whose mount failed (iframe still present)', async () => {
        service.configure({ loadTimeout: 20 });
        await service.loadPlugin(manifest());
        const container = document.createElement('div');
        const done = service.mountPlugin('p1', container);
        const post = fakeContentWindow(container.querySelector('iframe')!);
        await expectAsync(done).toBeRejected();
        const errorSpy = spyOn(console, 'error');

        fromPlugin({ type: 'api:call', pluginId: 'p1', requestId: 'r', payload: { method: 'getManifest' } });
        await flush();

        expect(post).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it('ignores api calls from a loaded plugin without an iframe', async () => {
        await service.loadPlugin(manifest());
        const errorSpy = spyOn(console, 'error');
        sendRaw({ type: 'api:call', pluginId: 'p1', requestId: 'r', payload: { method: 'getManifest' } }, null, 'null');
        await flush();
        expect(errorSpy).not.toHaveBeenCalled();
      });
    });

    describe('event subscriptions', () => {
      it('emitEventToPlugins does nothing when nobody subscribed', async () => {
        await service.loadPlugin(manifest());
        const { post } = await mount();
        post.calls.reset();
        service.emitEventToPlugins('nobody:listens', 1);
        await flush();
        expect(post).not.toHaveBeenCalled();
      });

      it('delivers events to subscribers only, once per subscriber, until unsubscribed', async () => {
        await service.loadPlugin(manifest());
        const { post } = await mount();
        post.calls.reset();

        fromPlugin({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'panel:change' } });
        fromPlugin({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'panel:change' } });
        service.emitEventToPlugins('panel:change', { panelId: 'x' });
        service.emitEventToPlugins('other', {});
        await flush();

        expect(sentMessages(post)).toEqual([
          { type: 'event:emit', pluginId: 'p1', payload: { eventType: 'panel:change', data: { panelId: 'x' } } },
        ]);

        post.calls.reset();
        fromPlugin({ type: 'event:unsubscribe', pluginId: 'p1', payload: { eventType: 'panel:change' } });
        fromPlugin({ type: 'event:unsubscribe', pluginId: 'p1', payload: { eventType: 'never-subscribed' } });
        service.emitEventToPlugins('panel:change', {});
        await flush();
        expect(post).not.toHaveBeenCalled();
      });

      it('ignores subscriptions from a plugin whose mount failed', async () => {
        service.configure({ loadTimeout: 20 });
        await service.loadPlugin(manifest());
        const container = document.createElement('div');
        const done = service.mountPlugin('p1', container);
        const post = fakeContentWindow(container.querySelector('iframe')!);
        await expectAsync(done).toBeRejected();

        fromPlugin({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'tick' } });
        service.emitEventToPlugins('tick', 1);
        await flush();
        expect(post).not.toHaveBeenCalled();
      });

      it('logs (and swallows) delivery failures when a subscriber lost its iframe', async () => {
        await service.loadPlugin(manifest());
        await mount();
        fromPlugin({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'tick' } });
        service.getPlugin('p1')!.iframe = null;
        const errorSpy = spyOn(console, 'error');

        service.emitEventToPlugins('tick', 1);
        await flush();

        expect(errorSpy).toHaveBeenCalledWith('Failed to emit event to plugin p1:', jasmine.any(Error));
      });
    });
  });
});
