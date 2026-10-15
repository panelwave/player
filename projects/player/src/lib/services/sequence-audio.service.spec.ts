/**
 * SequenceAudioService: timeline music/ambience following the reader —
 * start at the right offset, continuity inside a range, fades on leaving,
 * delayed starts / in-panel ends, autoplay-refusal retry.
 */

import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { SequenceAudioService, SEQUENCE_AUDIO_LEAVE_FADE_MS, sequenceEngineId } from './sequence-audio.service';
import { AudioEngineService } from './audio-engine.service';
import { ManifestService } from './manifest.service';
import { UserGestureService } from './user-gesture.service';

class MockGesture {
  private readonly subject = new BehaviorSubject<boolean>(false);
  readonly userHasInteracted$ = this.subject.asObservable();
  hasInteracted(): boolean {
    return this.subject.value;
  }
  set(value: boolean): void {
    this.subject.next(value);
  }
}

describe('SequenceAudioService', () => {
  let service: SequenceAudioService;
  let gesture: MockGesture;
  let active: Set<string>;
  let engine: { play: jasmine.Spy; stop: jasmine.Spy; isActive: (id: string) => boolean };
  let manifest: any;

  const page = (id: string, readingOrder: string[]) => ({ id, layout: { format: 'tablet-portrait', placements: [] }, readingOrder });

  /** ch1: a1 0–3 s, a2 3–6 s · ch2: b1 6–9 s (3 s per panel). */
  function setManifest(ch1Tracks: unknown[], ch2Tracks: unknown[] = []) {
    manifest = {
      settings: { ui: { secondsPerPanel: 3 } },
      assets: { base: { audioBase: 'https://cdn.example.com/audio/' } },
      chapters: [
        { id: 'ch1', panels: { a1: {}, a2: {} }, pages: [page('p1', ['a1', 'a2'])], sequenceAudioTracks: ch1Tracks },
        { id: 'ch2', panels: { b1: {} }, pages: [page('p2', ['b1'])], sequenceAudioTracks: ch2Tracks },
      ],
    };
  }

  const track = (over: Record<string, unknown>) => ({ id: 'music', friendlyId: 'music', assetId: 'theme', role: 'music', startTime: 0, duration: 6000, ...over });
  const ID = sequenceEngineId('music');

  beforeEach(() => {
    active = new Set<string>();
    gesture = new MockGesture();
    engine = {
      play: jasmine.createSpy('engine.play').and.callFake((t: { id: string }) => {
        active.add(t.id);
        return Promise.resolve();
      }),
      stop: jasmine.createSpy('engine.stop').and.callFake((id: string) => {
        active.delete(id);
        return Promise.resolve();
      }),
      isActive: (id: string) => active.has(id),
    };
    setManifest([track({})]);
    const manifestMock = {
      getManifest: () => manifest,
      getAsset: (id: string) =>
        id === 'theme' ? { id, category: 'audio', variants: [{ src: 'theme.mp3', mime: 'audio/mpeg' }] } : null,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AudioEngineService, useValue: engine },
        { provide: ManifestService, useValue: manifestMock },
        { provide: UserGestureService, useValue: gesture },
      ],
    });
    service = TestBed.inject(SequenceAudioService);
  });

  it('starts a track on entering its range, keeps it across panels and fades it out on leaving', () => {
    setManifest([track({ volume: 0.5, fadeIn: 300, playbackRate: 1.5, loop: true })]);
    service.syncPanel('a1', 'tablet-portrait');
    expect(engine.play).toHaveBeenCalledTimes(1);
    const [played, offset] = engine.play.calls.mostRecent().args;
    expect(played).toEqual(jasmine.objectContaining({
      id: ID, url: 'https://cdn.example.com/audio/theme.mp3', role: 'music', loop: true, volume: 0.5, fadeIn: 300, playbackRate: 1.5,
    }));
    expect(offset).toBe(0);

    service.syncPanel('a2', 'tablet-portrait');
    expect(engine.play).toHaveBeenCalledTimes(1); // continuity — no restart
    service.syncPanel('b1', 'tablet-portrait');
    expect(engine.stop).toHaveBeenCalledWith(ID, SEQUENCE_AUDIO_LEAVE_FADE_MS);
    expect(service.getDesiredTrackIds()).toEqual([]);
  });

  it('jumping into the middle of a range starts at the matching offset (scaled by the rate)', () => {
    setManifest([track({ playbackRate: 2 })]);
    service.syncPanel('a2', 'tablet-portrait');
    expect(engine.play.calls.mostRecent().args[1]).toBe(6); // 3 s into the range × 2
  });

  it('a whole-work track continues into the next chapter; its own fadeOut is used on leaving', () => {
    setManifest([track({ span: 'work', startPanelId: 'a1', endPanelId: 'b1', duration: 9000, fadeOut: 800 })]);
    service.syncPanel('a2', 'tablet-portrait');
    service.syncPanel('b1', 'tablet-portrait');
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.stop).not.toHaveBeenCalled();
    service.syncPanel(undefined, 'tablet-portrait'); // e.g. the cover / a locked panel
    expect(engine.stop).toHaveBeenCalledWith(ID, 800);
  });

  it('delays a track that starts inside the panel and stops one that ends inside it', fakeAsync(() => {
    setManifest([track({ startTime: 1000, duration: 1500 })]);
    service.syncPanel('a1', 'tablet-portrait');
    expect(engine.play).not.toHaveBeenCalled();
    tick(1000);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.play.calls.mostRecent().args[1]).toBe(0);
    flushMicrotasks();
    tick(1500);
    expect(engine.stop).toHaveBeenCalledWith(ID, SEQUENCE_AUDIO_LEAVE_FADE_MS);
    expect(service.getDesiredTrackIds()).toEqual([]);
  }));

  it('leaving before a delayed start cancels it', fakeAsync(() => {
    setManifest([track({ startTime: 1000, duration: 1500 })]);
    service.syncPanel('a1', 'tablet-portrait');
    service.syncPanel('b1', 'tablet-portrait');
    tick(2000);
    expect(engine.play).not.toHaveBeenCalled();
  }));

  it('skips muted tracks, unknown assets and other formats', () => {
    spyOn(console, 'warn');
    setManifest([
      track({ id: 'muted', muted: true }),
      track({ id: 'missing', assetId: 'nope' }),
      track({ id: 'mobile', format: 'mobile-portrait' }),
    ]);
    service.syncPanel('a1', 'tablet-portrait');
    expect(engine.play).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('retries a track refused by the autoplay policy on the first gesture, at its offset', fakeAsync(() => {
    engine.play.and.returnValue(Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    service.syncPanel('a2', 'tablet-portrait');
    flushMicrotasks();
    engine.play.and.callFake((t: { id: string }) => {
      active.add(t.id);
      return Promise.resolve();
    });
    gesture.set(true);
    expect(engine.play).toHaveBeenCalledTimes(2);
    expect(engine.play.calls.mostRecent().args[1]).toBe(3);
  }));

  it('stopAll silences everything at once', () => {
    service.syncPanel('a1', 'tablet-portrait');
    service.stopAll();
    expect(engine.stop).toHaveBeenCalledWith(ID, 0);
    expect(service.getDesiredTrackIds()).toEqual([]);
  });
});
