import { EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ManifestService } from '../services/manifest.service';
import { UserGestureService } from '../services/user-gesture.service';
import type { PlayerShellComponent } from '../components/player-shell/player-shell.component';
import { EMBED_STATE_DEBOUNCE_MS, PlayerEmbedBridge } from './player-embed-bridge';
import type { EmbedBridgeHandlers } from './player-embed-bridge';

const HOST = 'https://course.example';

/** A shell made of the outputs and methods the bridge uses. */
function fakeShell() {
  return {
    ready: new EventEmitter<void>(),
    panelChange: new EventEmitter<unknown>(),
    chapterChange: new EventEmitter<unknown>(),
    chapterComplete: new EventEmitter<unknown>(),
    autoplayChange: new EventEmitter<boolean>(),
    locationChange: new EventEmitter<unknown>(),
    variableChange: new EventEmitter<unknown>(),
    localeChange: new EventEmitter<unknown>(),
    navigationAttempt: new EventEmitter<unknown>(),
    cameraChange: new EventEmitter<unknown>(),
    paywallAction: new EventEmitter<unknown>(),
    ageVerified: new EventEmitter<unknown>(),
    likeChange: new EventEmitter<unknown>(),
    bookmarkChange: new EventEmitter<unknown>(),
    widgetEvent: new EventEmitter<unknown>(),
    error: new EventEmitter<Error>(),
    currentChapter: { id: 'c2', graph: { entry: 'q1', edges: [] }, panels: {} },
    currentPage: undefined,
    viewMode: 'panel',
    coverVisible: false,
    visitedPanelIds: ['q1'],
    paywallVisible: false,
    paywallGate: null,
    scopedChapterId: 'c2',
    chapterCompleted: false,
    autoplayRunning: true,
    getCurrentPanelId: jasmine.createSpy('getCurrentPanelId').and.returnValue('q1'),
    seedVariable: jasmine.createSpy('seedVariable'),
    navigateToPanel: jasmine.createSpy('navigateToPanel').and.returnValue(Promise.resolve()),
    hideCover: jasmine.createSpy('hideCover'),
    setAudioEnabled: jasmine.createSpy('setAudioEnabled'),
    onLocaleChange: jasmine.createSpy('onLocaleChange'),
    reload: jasmine.createSpy('reload').and.returnValue(Promise.resolve()),
    setThemeOverride: jasmine.createSpy('setThemeOverride'),
  };
}

describe('PlayerEmbedBridge', () => {
  let bridge: PlayerEmbedBridge;
  let host: { postMessage: jasmine.Spy };
  let listen: EventTarget;
  let shell: ReturnType<typeof fakeShell>;
  let handlers: jasmine.SpyObj<EmbedBridgeHandlers>;
  let gesture: jasmine.SpyObj<UserGestureService>;

  const posted = (type: string) =>
    host.postMessage.calls.allArgs().filter(([m]) => m.type === type).map(([m]) => m);
  const send = (data: unknown, origin = HOST) => listen.dispatchEvent(new MessageEvent('message', { data, origin }));

  beforeEach(() => {
    jasmine.clock().install();
    gesture = jasmine.createSpyObj('UserGestureService', ['markInteracted']);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ManifestService,
          useValue: {
            getPanel: (id: string) => (id === 'q2' ? { panel: { title: { 'en-US': 'Two' } }, chapterId: 'c2' } : null),
          },
        },
        { provide: UserGestureService, useValue: gesture },
      ],
    });
    bridge = TestBed.inject(PlayerEmbedBridge);
    host = { postMessage: jasmine.createSpy('postMessage') };
    listen = new EventTarget();
    shell = fakeShell();
    handlers = jasmine.createSpyObj<EmbedBridgeHandlers>('handlers', ['setOptions']);
    bridge.connect({ hostOrigin: HOST, hostWindow: host as unknown as Window, listenWindow: listen as unknown as Window, handlers });
    bridge.attach(shell as unknown as PlayerShellComponent);
  });

  afterEach(() => {
    bridge.disconnect();
    jasmine.clock().uninstall();
  });

  it('greets the host with protocol 2, at the host origin only', () => {
    expect(host.postMessage).toHaveBeenCalledWith({ type: 'pw:hello', protocol: 3 }, HOST);
  });

  it('posts pw:ready and a state after the shell is ready', () => {
    shell.ready.emit();
    expect(posted('pw:ready').length).toBe(1);
    expect(posted('pw:event')).toContain(jasmine.objectContaining({ name: 'ready' }));
    jasmine.clock().tick(EMBED_STATE_DEBOUNCE_MS + 1);
    const [state] = posted('pw:state');
    expect(state.data).toEqual(
      jasmine.objectContaining({ chapterId: 'c2', panelId: 'q1', chapterScope: 'c2', chapterComplete: false, autoplayActive: true })
    );
  });

  it('forwards chapterComplete and autoplayChange as pw:event', () => {
    shell.chapterComplete.emit({ chapterId: 'c2', panelId: 'q3', isLastChapter: false });
    shell.autoplayChange.emit(false);
    const events = posted('pw:event');
    expect(events).toContain({ type: 'pw:event', name: 'chapterComplete', data: { chapterId: 'c2', panelId: 'q3', isLastChapter: false } });
    expect(events).toContain({ type: 'pw:event', name: 'autoplayChange', data: false });
  });

  it('sends panel changes as ids, errors as messages (kept for the state)', () => {
    shell.panelChange.emit({ panelId: 'q2', previousPanelId: 'q1', chapter: { id: 'c2' }, panel: { layers: [] } });
    shell.error.emit(new Error('boom'));
    const events = posted('pw:event');
    expect(events).toContain({ type: 'pw:event', name: 'panelChange', data: { panelId: 'q2', previousPanelId: 'q1', chapterId: 'c2' } });
    expect(events).toContain({ type: 'pw:event', name: 'error', data: { message: 'boom' } });
    send({ type: 'getState' });
    expect(posted('pw:state').pop().data.errors).toEqual(['boom']);
  });

  it('ignores messages from another origin and unknown types', () => {
    send({ type: 'setOptions', data: { autoplay: true } }, 'https://evil.example');
    send({ type: 'launchMissiles' });
    expect(handlers.setOptions).not.toHaveBeenCalled();
  });

  it('routes setOptions to the app, muted and showCover:false to the shell', () => {
    shell.coverVisible = true;
    send({ type: 'setOptions', data: { autoplay: true, muted: true, showCover: false } });
    expect(handlers.setOptions).toHaveBeenCalledWith({ autoplay: true, muted: true, showCover: false });
    expect(shell.setAudioEnabled).toHaveBeenCalledWith(false);
    expect(shell.hideCover).toHaveBeenCalled();
  });

  it('applies a config through setOptions and the locale by default', () => {
    send({ type: 'config', data: { showToolbar: true, locale: 'de-DE' } });
    expect(handlers.setOptions).toHaveBeenCalledWith(jasmine.objectContaining({ showToolbar: true }));
    expect(shell.onLocaleChange).toHaveBeenCalledWith('de-DE');
  });

  it('navigates to known panels and reports unknown ones', async () => {
    send({ type: 'navigate', panelId: 'q2' });
    await Promise.resolve();
    expect(shell.navigateToPanel).toHaveBeenCalledWith('c2', 'q2');
    send({ type: 'navigate', panelId: 'nope' });
    await Promise.resolve();
    send({ type: 'getState' });
    expect(posted('pw:state').pop().data.errors).toContain('navigate: unknown panel "nope"');
  });

  it('seeds variables, restarts and answers getState at once', () => {
    send({ type: 'setVariable', key: 'score', value: 3 });
    expect(shell.seedVariable).toHaveBeenCalledWith('score', 3);
    send({ type: 'restart' });
    expect(shell.reload).toHaveBeenCalled();
    send({ type: 'getState' });
    expect(posted('pw:state').length).toBe(1);
  });

  it('applies a live theme (v3 setTheme) and ignores malformed ones', () => {
    send({ type: 'setTheme', theme: { colors: { accent: '#e11d48' } } });
    expect(shell.setThemeOverride).toHaveBeenCalledWith({ colors: { accent: '#e11d48' } });
    send({ type: 'setTheme', theme: null });
    expect(shell.setThemeOverride).toHaveBeenCalledWith(null);
    shell.setThemeOverride.calls.reset();
    send({ type: 'setTheme', theme: 'red' });
    expect(shell.setThemeOverride).not.toHaveBeenCalled();
  });

  it('forwards widget events (v3)', () => {
    shell.widgetEvent.emit({ type: 'download', layerId: 'd1', kind: 'download' });
    expect(host.postMessage).toHaveBeenCalledWith(
      { type: 'pw:event', name: 'widgetEvent', data: { type: 'download', layerId: 'd1', kind: 'download' } },
      HOST
    );
  });

  it('marks a host-page gesture as user interaction', () => {
    send({ type: 'hostGesture' });
    expect(gesture.markInteracted).toHaveBeenCalled();
  });

  it('stops talking after disconnect', () => {
    bridge.disconnect();
    host.postMessage.calls.reset();
    shell.chapterComplete.emit({ chapterId: 'c2', panelId: 'q3', isLastChapter: false });
    send({ type: 'getState' });
    expect(host.postMessage).not.toHaveBeenCalled();
  });
});
