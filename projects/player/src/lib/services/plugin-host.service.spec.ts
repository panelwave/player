/**
 * Unit tests for PluginHostService
 *
 * No remote URLs are ever loaded: plugin iframes are mounted into detached
 * containers (a detached iframe never navigates) and their contentWindow is
 * replaced with a fake whose postMessage is a spy. Incoming plugin messages
 * are simulated by dispatching MessageEvents on window.
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

  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const send = (data: unknown): void => {
    window.dispatchEvent(new MessageEvent('message', { data }));
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
  const mount = async (id = 'p1'): Promise<Mounted> => {
    const container = document.createElement('div');
    const done = service.mountPlugin(id, container);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const post = fakeContentWindow(iframe);
    send({ type: 'plugin:ready', pluginId: id });
    await flush();
    send({ type: 'plugin:mounted', pluginId: id });
    await done;
    return { container, iframe, post };
  };

  const sentMessages = (post: jasmine.Spy): PluginMessage[] =>
    post.calls.allArgs().map((args) => args[0] as PluginMessage);

  const stateOf = (id: string): PluginState | undefined => service.getPlugin(id)?.state;

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
      expect(iframe.sandbox.contains('allow-same-origin')).toBeTrue();
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
      expect(post.calls.mostRecent().args[1]).toBe('*');
    });

    it('uses no sandbox tokens when sandboxAttributes is unset', async () => {
      service.configure({ sandboxAttributes: undefined });
      await service.loadPlugin(manifest());
      const { iframe } = await mount();
      expect(iframe.sandbox.length).toBe(0);
    });

    it('passes through the "mounting" state while waiting for ready', async () => {
      await service.loadPlugin(manifest());
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      expect(stateOf('p1')).toBe('mounting');
      fakeContentWindow(container.querySelector('iframe')!);
      send({ type: 'plugin:ready', pluginId: 'p1' });
      await flush();
      send({ type: 'plugin:mounted', pluginId: 'p1' });
      await done;
      expect(stateOf('p1')).toBe('mounted');
    });

    it('ignores ready/mounted messages that belong to another registered plugin', async () => {
      service.configure({ loadTimeout: 60 });
      await service.loadPlugin(manifest());
      await service.loadPlugin(manifest({ id: 'p2', name: 'Two' }));
      const container = document.createElement('div');
      const done = service.mountPlugin('p1', container);
      fakeContentWindow(container.querySelector('iframe')!);

      send({ type: 'plugin:ready', pluginId: 'p2' });
      await flush();
      expect(stateOf('p1')).toBe('mounting');

      send({ type: 'plugin:ready', pluginId: 'p1' });
      await flush();
      send({ type: 'plugin:mounted', pluginId: 'p2' });
      await flush();
      expect(stateOf('p1')).toBe('mounting');

      send({ type: 'plugin:mounted', pluginId: 'p1' });
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
      send({ type: 'plugin:ready', pluginId: 'p1' });
      await expectAsync(done).toBeRejectedWithError('Plugin p1 did not mount in time');
      expect(stateOf('p1')).toBe('error');
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
      send({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'panel:change' } });
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
      send({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'tick' } });
      send({ type: 'event:subscribe', pluginId: 'p2', payload: { eventType: 'tick' } });

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
  });

  describe('incoming message handling', () => {
    it('ignores malformed messages and messages from unknown plugins', async () => {
      await service.loadPlugin(manifest());
      const { post } = await mount();
      post.calls.reset();

      send(null);
      send('string payload');
      send({ pluginId: 'p1' });
      send({ type: 'api:call' });
      send({ type: 'api:call', pluginId: 'stranger', payload: { method: 'getManifest' } });
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
        send({ type: 'api:call', pluginId: 'p1', requestId: 'r1', payload: { method: 'getCurrentPanel' } });
        send({ type: 'api:call', pluginId: 'p1', requestId: 'r2', payload: { method: 'getManifest' } });
        send({ type: 'api:call', pluginId: 'p1', requestId: 'r3', payload: { method: 'getPlayerState' } });
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

        send({ type: 'api:call', pluginId: 'p1', requestId: 'r9', payload: { method: 'sum', params: [1, 2, 3] } });
        await flush();

        expect(handler).toHaveBeenCalledWith(1, 2, 3);
        expect(sentMessages(post)).toEqual([
          { type: 'api:response', pluginId: 'p1', requestId: 'r9', payload: { result: 6 } },
        ]);
      });

      it('calls the handler with no arguments when params are omitted', async () => {
        const handler = jasmine.createSpy('noop').and.resolveTo('ok');
        service.registerAPIHandler('noop', handler);
        send({ type: 'api:call', pluginId: 'p1', requestId: 'r', payload: { method: 'noop' } });
        await flush();
        expect(handler).toHaveBeenCalledWith();
      });

      it('replies with api:error for unknown methods', async () => {
        send({ type: 'api:call', pluginId: 'p1', requestId: 'r4', payload: { method: 'selfDestruct' } });
        await flush();
        expect(sentMessages(post)).toEqual([
          { type: 'api:error', pluginId: 'p1', requestId: 'r4', error: 'Unknown API method: selfDestruct' },
        ]);
      });

      it('replies with api:error when the handler rejects', async () => {
        service.registerAPIHandler('fail', async () => {
          throw new Error('kaputt');
        });
        send({ type: 'api:call', pluginId: 'p1', requestId: 'r5', payload: { method: 'fail' } });
        await flush();
        expect(sentMessages(post)).toEqual([{ type: 'api:error', pluginId: 'p1', requestId: 'r5', error: 'kaputt' }]);
      });

      it('unregisterAPIHandler makes the method unknown', async () => {
        service.unregisterAPIHandler('getManifest');
        send({ type: 'api:call', pluginId: 'p1', requestId: 'r6', payload: { method: 'getManifest' } });
        await flush();
        expect(sentMessages(post)[0].type).toBe('api:error');
        expect(sentMessages(post)[0].error).toBe('Unknown API method: getManifest');
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

        send({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'panel:change' } });
        send({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'panel:change' } });
        service.emitEventToPlugins('panel:change', { panelId: 'x' });
        service.emitEventToPlugins('other', {});
        await flush();

        expect(sentMessages(post)).toEqual([
          { type: 'event:emit', pluginId: 'p1', payload: { eventType: 'panel:change', data: { panelId: 'x' } } },
        ]);

        post.calls.reset();
        send({ type: 'event:unsubscribe', pluginId: 'p1', payload: { eventType: 'panel:change' } });
        send({ type: 'event:unsubscribe', pluginId: 'p1', payload: { eventType: 'never-subscribed' } });
        service.emitEventToPlugins('panel:change', {});
        await flush();
        expect(post).not.toHaveBeenCalled();
      });

      it('logs (and swallows) delivery failures for subscribers without an iframe', async () => {
        await service.loadPlugin(manifest());
        const errorSpy = spyOn(console, 'error');
        send({ type: 'event:subscribe', pluginId: 'p1', payload: { eventType: 'tick' } });

        service.emitEventToPlugins('tick', 1);
        await flush();

        expect(errorSpy).toHaveBeenCalledWith('Failed to emit event to plugin p1:', jasmine.any(Error));
      });
    });
  });
});
