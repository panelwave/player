/**
 * PlayerShellComponent ↔ content widgets (schema 1.10+): widget events go
 * out as `widgetEvent` + analytics, the video modal opens / closes through
 * the shell's dialog handling, autoplay waits while a widget plays, keys
 * inside a widget never navigate. Template stubbed as in the auto-advance spec.
 */
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { PlayerShellComponent } from './player-shell.component';
import { PlayerStateService } from '../../services/player-state.service';
import { ManifestService } from '../../services/manifest.service';
import { VariableStoreService } from '../../services/variable-store.service';
import { FlowEngineService } from '../../services/flow-engine.service';
import { TranslationService } from '../../services/translation.service';
import { TrackingService } from '../../services/tracking.service';
import { VideoControllerService } from '../../services/video-controller.service';
import { VideoSequencerService } from '../../services/video-sequencer.service';
import type { Panel, VideoPlayerLayer } from '../../types';
import type { WidgetEvent } from '../../services/widget-playback.service';

describe('PlayerShellComponent content widgets', () => {
  let shell: PlayerShellComponent;
  let track: jasmine.Spy;

  const priv = () =>
    shell as unknown as {
      subscribeToWidgets(): void;
      startAutoplay(): void;
      stopAutoplay(): void;
      closableDialogOpen(): boolean;
      closeTopDialog(): void;
      handleKeyboard(e: KeyboardEvent): void;
      autoplayTimer?: unknown;
      autoplayHeldByWidget: boolean;
    };

  beforeEach(() => {
    jasmine.clock().install();
    track = jasmine.createSpy('track');
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerStateService, useValue: {} },
        { provide: ManifestService, useValue: { getManifest: () => null } },
        { provide: VariableStoreService, useValue: {} },
        { provide: FlowEngineService, useValue: {} },
        { provide: TranslationService, useValue: {} },
        { provide: TrackingService, useValue: { track, configure: () => undefined, flushSync: () => undefined } },
        { provide: VideoControllerService, useValue: { passComplete$: new Subject<string>() } },
        { provide: VideoSequencerService, useValue: { queueComplete: new Subject<void>(), reset: () => undefined, getStallTimeout: () => 10000 } },
      ],
    });
    TestBed.overrideComponent(PlayerShellComponent, { set: { template: '', imports: [] } });
    shell = TestBed.createComponent(PlayerShellComponent).componentInstance;
    priv().subscribeToWidgets();
  });

  afterEach(() => {
    shell.autoplayEnabled = false;
    priv().stopAutoplay();
    shell.ngOnDestroy();
    jasmine.clock().uninstall();
  });

  it('re-emits widget events and tracks download / widgetPlay / widgetOpen', () => {
    const out: WidgetEvent[] = [];
    shell.widgetEvent.subscribe((e) => out.push(e));
    shell.widgetPlayback.emit({ type: 'download', layerId: 'd1', kind: 'download', panelId: 'p1', assetId: 'f1' });
    shell.widgetPlayback.emit({ type: 'play', layerId: 'a1', kind: 'audioPlayer', panelId: 'p1' });
    shell.widgetPlayback.emit({ type: 'open', layerId: 'v1', kind: 'videoPlayer', panelId: 'p1' });
    shell.widgetPlayback.emit({ type: 'pause', layerId: 'a1', kind: 'audioPlayer', panelId: 'p1' });
    expect(out.map((e) => e.type)).toEqual(['download', 'play', 'open', 'pause']);
    expect(track.calls.allArgs().map((a) => a[0])).toEqual(['download', 'widgetPlay', 'widgetOpen']);
    expect(track.calls.first().args[1]).toEqual(jasmine.objectContaining({ panelId: 'p1', layerId: 'd1', kind: 'download', assetId: 'f1' }));
  });

  it('opens the video modal on request and closes it as the top dialog, restoring focus', () => {
    const layer: VideoPlayerLayer = { kind: 'videoPlayer', id: 'v1', assetId: 'x', width: 1, height: 1 };
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    shell.widgetPlayback.openVideo({ layer, panelId: 'p1', returnFocus: trigger });
    expect(shell.videoModal?.layer).toBe(layer);
    expect(priv().closableDialogOpen()).toBeTrue();
    priv().closeTopDialog();
    expect(shell.videoModal).toBeNull();
    jasmine.clock().tick(1);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('holds the autoplay advance while a widget plays and advances once it stops', () => {
    shell.viewMode = 'panel';
    shell.autoplayEnabled = true;
    shell.currentPanel = { durationMs: 1000, layers: [] } as unknown as Panel;
    const nav = spyOn(shell, 'navigateNext').and.resolveTo();
    shell.widgetPlayback.notifyPlaying('a1');
    priv().startAutoplay();
    jasmine.clock().tick(1001);
    expect(nav).not.toHaveBeenCalled();
    expect(priv().autoplayHeldByWidget).toBeTrue();

    shell.widgetPlayback.notifyStopped('a1');
    expect(priv().autoplayHeldByWidget).toBeFalse();
    expect(priv().autoplayTimer).toBeDefined();
    jasmine.clock().tick(1001);
    expect(nav).toHaveBeenCalledTimes(1);
  });

  /** A key pressed on `target` inside a widget; returns whether the story navigated. */
  function pressIn(markup: string, selector: string, key: string): boolean {
    const widget = document.createElement('div');
    widget.setAttribute('data-pw-widget', 'audioPlayer');
    widget.innerHTML = markup;
    document.body.appendChild(widget);
    const next = jasmine.isSpy(shell.navigateNext) ? (shell.navigateNext as jasmine.Spy) : spyOn(shell, 'navigateNext').and.resolveTo();
    shell.viewMode = 'panel';
    const target = widget.querySelector(selector)!;
    target.addEventListener('keydown', (e) => priv().handleKeyboard(e as KeyboardEvent));
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    widget.remove();
    const navigated = next.calls.count() > 0;
    next.calls.reset();
    return navigated;
  }

  it('keeps keys for the parts of a widget that use them (slider, scroll box, fields)', () => {
    expect(pressIn('<div role="slider" data-pw-owns-keys tabindex="0"></div>', '[role="slider"]', 'ArrowRight')).toBeFalse();
    expect(pressIn('<div class="scroller" data-pw-owns-keys tabindex="0"><p>text</p></div>', 'p', 'ArrowRight')).toBeFalse();
    expect(pressIn('<input type="text" />', 'input', 'ArrowRight')).toBeFalse();
  });

  it('navigates with the arrows from a widget button (after clicking Play), Enter / Space stay with the button', () => {
    expect(pressIn('<button class="play">Play</button>', 'button', 'ArrowRight')).toBeTrue();
    expect(pressIn('<button class="play">Play</button>', 'button', ' ')).toBeFalse();
    expect(pressIn('<button class="play">Play</button>', 'button', 'Enter')).toBeFalse();
  });
});
