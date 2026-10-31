import { CUSTOM_ELEMENTS_SCHEMA, Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { Panel } from '../types';
import { BubbleClockDirective } from './bubble-clock.directive';
import { SpeechBubblesComponent } from '../components/overlays/speech-bubbles/speech-bubbles.component';
import { BubbleVoiceService } from '../services/bubble-voice.service';

const timedBubbles = [
  { id: 'b1', text: { 'en-US': 'You came back.' }, shape: { x: 0.55, y: 0.05, w: 0.35, h: 0.2 } },
  { id: 'b2', text: { 'en-US': 'I never left.' }, shape: { x: 0.05, y: 0.1, w: 0.35, h: 0.2 }, showAtMs: 2400 },
];

const imagePanel = { layers: [{ id: 'bg', kind: 'image' }], speechBubbles: timedBubbles } as unknown as Panel;
const videoPanel = { layers: [{ id: 'clip', kind: 'video' }], speechBubbles: timedBubbles } as unknown as Panel;
const untimedPanel = { layers: [], speechBubbles: [timedBubbles[0]] } as unknown as Panel;
const voicedUntimedPanel = { layers: [], speechBubbles: [{ ...timedBubbles[0], audioAssetId: 'voice-b1' }] } as unknown as Panel;
const voicedTimedPanel = { layers: [], speechBubbles: [{ ...timedBubbles[0], audioAssetId: 'voice-b1' }, timedBubbles[1]] } as unknown as Panel;

@Component({
  imports: [BubbleClockDirective, SpeechBubblesComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div
      class="panel"
      style="width: 400px; height: 300px; position: relative;"
      [pwBubbleClock]="panel"
      [pwBubbleClockKey]="key"
      [pwBubbleClockReducedMotion]="reducedMotion"
      [pwBubbleClockStatic]="isStatic">
      <pw-video-layer><video class="layer-video"></video></pw-video-layer>
      <video class="stray-video"></video>
      <audio class="widget-audio"></audio>
      @if (withOverlay) {
        <pw-speech-bubbles [bubbles]="panel?.speechBubbles ?? []" [containerWidth]="400" [containerHeight]="300"></pw-speech-bubbles>
      }
    </div>
  `,
})
class HostComponent {
  @ViewChild(BubbleClockDirective, { static: true }) directive!: BubbleClockDirective;
  @ViewChild(SpeechBubblesComponent) overlay?: SpeechBubblesComponent;
  panel: Panel | null = imagePanel;
  key = 'p1';
  reducedMotion = false;
  isStatic = false;
  withOverlay = false;
}

describe('BubbleClockDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let observerCallback: IntersectionObserverCallback | null;
  let originalObserver: typeof IntersectionObserver;
  let detach: jasmine.Spy;
  let voices: { attach: jasmine.Spy; replay: jasmine.Spy };

  const clock = () => host.directive.clock;
  const el = (selector: string): HTMLMediaElement => fixture.nativeElement.querySelector(selector) as HTMLMediaElement;

  const setShown = (shown: boolean): void => {
    observerCallback?.(
      [
        {
          isIntersecting: shown,
          intersectionRatio: shown ? 1 : 0,
          intersectionRect: { width: shown ? 400 : 0, height: shown ? 300 : 0 } as DOMRectReadOnly,
          rootBounds: { width: 1000, height: 800 } as DOMRectReadOnly,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    );
  };

  /** Fake the playback state of a media element (the real getters are read-only). */
  const mediaState = (media: HTMLMediaElement, state: { paused: boolean; ended?: boolean; readyState?: number }): void => {
    Object.defineProperty(media, 'paused', { configurable: true, get: () => state.paused });
    Object.defineProperty(media, 'ended', { configurable: true, get: () => state.ended ?? false });
    Object.defineProperty(media, 'readyState', { configurable: true, get: () => state.readyState ?? 4 });
  };

  /** Media events do not bubble — the directive must catch them in the capture phase. */
  const fire = (media: HTMLMediaElement, type: string): void => {
    media.dispatchEvent(new Event(type, { bubbles: false }));
  };

  beforeEach(() => {
    observerCallback = null;
    originalObserver = window.IntersectionObserver;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
      observe(): void { /* driven by setShown() */ }
      disconnect(): void { observerCallback = null; }
    };
    detach = jasmine.createSpy('detach');
    voices = { attach: jasmine.createSpy('attach').and.returnValue(detach), replay: jasmine.createSpy('replay') };
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: BubbleVoiceService, useValue: voices }],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = originalObserver;
    document.documentElement.classList.remove('pw-print');
  });

  it('is done right away when no balloon on the panel is timed', () => {
    host.panel = untimedPanel;
    fixture.detectChanges();
    expect(clock().state).toBe('done');
    expect(observerCallback).toBeNull(); // nothing observed
  });

  it('is done right away under reduced motion, for static copies and in print renders', () => {
    host.reducedMotion = true;
    fixture.detectChanges();
    expect(clock().state).toBe('done');

    host.reducedMotion = false;
    host.isStatic = true;
    fixture.detectChanges();
    expect(clock().state).toBe('done');

    host.isStatic = false;
    document.documentElement.classList.add('pw-print');
    host.key = 'p1-print'; // force a restart
    fixture.detectChanges();
    expect(clock().state).toBe('done');
  });

  describe('image panel (no video): runs while the panel is shown', () => {
    it('waits until the panel is shown, pauses off screen, resumes when back', () => {
      fixture.detectChanges();
      expect(clock().state).toBe('waiting');
      setShown(true);
      expect(clock().state).toBe('running');
      setShown(false);
      expect(clock().state).toBe('paused');
      setShown(true);
      expect(clock().state).toBe('running');
    });

    it('pauses while the tab is hidden', () => {
      let hidden = false;
      spyOnProperty(document, 'hidden', 'get').and.callFake(() => hidden);
      fixture.detectChanges();
      setShown(true);
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      expect(clock().state).toBe('paused');
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      expect(clock().state).toBe('running');
    });

    it('ignores video events (they are not its clock)', () => {
      fixture.detectChanges();
      mediaState(el('.layer-video'), { paused: false });
      fire(el('.layer-video'), 'playing');
      expect(clock().state).toBe('waiting');
    });
  });

  describe('video panel: follows the video', () => {
    beforeEach(() => {
      host.panel = videoPanel;
    });

    it('waits for the video to play, not for the panel to be shown', () => {
      fixture.detectChanges();
      expect(observerCallback).toBeNull();
      expect(clock().state).toBe('waiting');
      mediaState(el('.layer-video'), { paused: false });
      fire(el('.layer-video'), 'playing');
      expect(clock().state).toBe('running');
    });

    it('pauses while the video is paused or buffering and resumes on playing', () => {
      fixture.detectChanges();
      const video = el('.layer-video');
      mediaState(video, { paused: false });
      fire(video, 'playing');

      mediaState(video, { paused: true });
      fire(video, 'pause');
      expect(clock().state).toBe('paused');

      mediaState(video, { paused: false });
      fire(video, 'playing');
      expect(clock().state).toBe('running');

      mediaState(video, { paused: false, readyState: 2 });
      fire(video, 'waiting');
      expect(clock().state).toBe('paused');
    });

    it('keeps running when a pass ends (a balloon after the clip still appears)', () => {
      fixture.detectChanges();
      const video = el('.layer-video');
      mediaState(video, { paused: false });
      fire(video, 'playing');
      mediaState(video, { paused: true, ended: true });
      fire(video, 'pause');
      expect(clock().state).toBe('running');
    });

    it('only listens to videos of video layers', () => {
      fixture.detectChanges();
      mediaState(el('.stray-video'), { paused: false });
      fire(el('.stray-video'), 'playing');
      mediaState(el('.widget-audio'), { paused: false });
      fire(el('.widget-audio'), 'playing');
      expect(clock().state).toBe('waiting');
    });

    it('starts at once when re-armed while the video already plays', () => {
      host.panel = { ...videoPanel, speechBubbles: [timedBubbles[0]] } as unknown as Panel;
      fixture.detectChanges();
      expect(clock().state).toBe('done'); // nothing timed yet
      mediaState(el('.layer-video'), { paused: false });
      host.panel = videoPanel; // the author added a timed balloon (CMS preview)
      fixture.detectChanges();
      expect(clock().state).toBe('running');
    });
  });

  describe('spoken lines (voiced balloons)', () => {
    it('keeps following the panel for its lines when no balloon is timed: every balloon due, clock running', () => {
      host.panel = voicedUntimedPanel;
      fixture.detectChanges();
      expect(clock().state).toBe('waiting');
      expect(clock().allDue).toBeTrue();
      expect(clock().elapsed()).toBe(Number.POSITIVE_INFINITY);
      expect(voices.attach).toHaveBeenCalledWith('p1', voicedUntimedPanel, clock());
      setShown(true);
      expect(clock().state).toBe('running');
      setShown(false);
      expect(clock().state).toBe('paused');
    });

    it('under reduced motion a voiced panel shows every balloon at once but still follows the panel', () => {
      host.panel = voicedTimedPanel;
      host.reducedMotion = true;
      fixture.detectChanges();
      expect(clock().allDue).toBeTrue();
      expect(clock().state).toBe('waiting');
      expect(voices.attach).toHaveBeenCalledTimes(1);
      setShown(true);
      expect(clock().state).toBe('running');
    });

    it('a timed and voiced panel keeps its timing', () => {
      host.panel = voicedTimedPanel;
      fixture.detectChanges();
      expect(clock().allDue).toBeFalse();
      expect(voices.attach).toHaveBeenCalledTimes(1);
    });

    it('detaches the lines when another panel is shown in the host and when destroyed', () => {
      host.panel = voicedUntimedPanel;
      fixture.detectChanges();
      expect(detach).not.toHaveBeenCalled();
      host.key = 'p2';
      host.panel = { ...voicedUntimedPanel } as Panel;
      fixture.detectChanges();
      expect(detach).toHaveBeenCalledTimes(1);
      expect(voices.attach).toHaveBeenCalledTimes(2);
      fixture.destroy();
      expect(detach).toHaveBeenCalledTimes(2);
    });

    it('attaches nothing for static copies, print renders and silent panels', () => {
      host.panel = voicedUntimedPanel;
      host.isStatic = true;
      fixture.detectChanges();
      expect(voices.attach).not.toHaveBeenCalled();
      expect(clock().state).toBe('done');

      host.isStatic = false;
      host.panel = untimedPanel;
      fixture.detectChanges();
      expect(voices.attach).not.toHaveBeenCalled();
      expect(clock().state).toBe('done');
    });
  });

  it('restarts from 0 when another panel is shown in the same host', () => {
    fixture.detectChanges();
    setShown(true);
    expect(clock().state).toBe('running');
    host.key = 'p2';
    host.panel = { ...imagePanel } as Panel;
    fixture.detectChanges();
    expect(clock().state).toBe('waiting');
    expect(clock().elapsed()).toBe(0);
  });

  it('does not restart for a new panel object that times nothing differently', () => {
    fixture.detectChanges();
    setShown(true);
    host.panel = { ...imagePanel } as Panel; // variant re-resolution, same key
    fixture.detectChanges();
    expect(clock().state).toBe('running');
  });

  it('stops listening when destroyed', () => {
    host.panel = videoPanel;
    fixture.detectChanges();
    const video = el('.layer-video');
    const directive = host.directive;
    fixture.destroy();
    mediaState(video, { paused: false });
    fire(video, 'playing');
    expect(directive.clock.state).toBe('waiting');
  });

  it('hands its clock to the speech-bubble overlay inside the panel', () => {
    host.withOverlay = true;
    fixture.detectChanges();
    const overlay = host.overlay!;
    expect(overlay).toBeTruthy();
    expect((overlay as unknown as { clockHost: BubbleClockDirective | null }).clockHost).toBe(host.directive);
  });
});
