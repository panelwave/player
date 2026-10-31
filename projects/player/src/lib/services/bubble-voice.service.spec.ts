/**
 * BubbleVoiceService tests: lines play when their balloon appears on the
 * panel clock, one after another; shown panels read in order; a panel that
 * is paused or left stops talking; the Voices toggle, the language switch,
 * a tap on a balloon and the autoplay-policy retry.
 */

import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { BubbleVoiceService, BUBBLE_VOICE_STOP_FADE_MS } from './bubble-voice.service';
import { AudioEngineService, type AudioTrack } from './audio-engine.service';
import { ManifestService } from './manifest.service';
import { PlayerStateService } from './player-state.service';
import { UserGestureService } from './user-gesture.service';
import { BubbleClock } from '../utils/bubble-clock';
import type { Panel } from '../types';

class MockGesture {
  private readonly subject = new BehaviorSubject<boolean>(true);
  readonly userHasInteracted$ = this.subject.asObservable();
  hasInteracted(): boolean {
    return this.subject.value;
  }
  set(value: boolean): void {
    this.subject.next(value);
  }
}

describe('BubbleVoiceService', () => {
  let service: BubbleVoiceService;
  let gesture: MockGesture;
  let locale$: BehaviorSubject<string>;
  let now: number;
  let played: AudioTrack[];
  let active: Map<string, AudioTrack>;
  let engine: {
    play: jasmine.Spy;
    stop: jasmine.Spy;
    isActive: (id: string) => boolean;
    resumeContext: jasmine.Spy;
  };
  let playRefusal: Error | null;

  const voice = (id: string, locales?: string[]) => ({
    id,
    category: 'audio',
    role: 'voiceover',
    variants: locales
      ? locales.map((locale) => ({ src: `${id}.${locale}.mp3`, locale }))
      : [{ src: `${id}.mp3` }],
  });
  const catalog: Record<string, ReturnType<typeof voice>> = {
    'v-a': voice('v-a'),
    'v-b': voice('v-b'),
    'v-c': voice('v-c'),
    'v-loc': voice('v-loc', ['en-US', 'de-DE']),
  };

  const panel = (...bubbles: { id: string; audioAssetId?: string; showAtMs?: number }[]): Panel =>
    ({ speechBubbles: bubbles }) as unknown as Panel;

  /** Finish the line being played (the engine fires the track's onEnded). */
  const endCurrent = (): void => {
    const current = played[played.length - 1];
    active.delete(current.id);
    current.onEnded?.();
  };

  const playedIds = () => played.map((track) => track.id);

  beforeEach(() => {
    now = 0;
    played = [];
    active = new Map();
    playRefusal = null;
    gesture = new MockGesture();
    locale$ = new BehaviorSubject<string>('en-US');
    engine = {
      play: jasmine.createSpy('engine.play').and.callFake((track: AudioTrack) => {
        if (playRefusal) {
          return Promise.reject(playRefusal);
        }
        played.push(track);
        active.set(track.id, track);
        return Promise.resolve();
      }),
      stop: jasmine.createSpy('engine.stop').and.callFake((id: string) => {
        active.delete(id);
        return Promise.resolve();
      }),
      isActive: (id: string) => active.has(id),
      resumeContext: jasmine.createSpy('engine.resumeContext').and.returnValue(Promise.resolve()),
    };
    const manifestMock = {
      getAsset: (id: string, locale?: string) => {
        const asset = catalog[id];
        if (!asset || !locale || !asset.variants.some((v) => 'locale' in v)) {
          return asset ?? null;
        }
        return { ...asset, variants: asset.variants.filter((v) => (v as { locale?: string }).locale === locale) };
      },
      getManifest: () => ({ assets: { base: { audioBase: 'https://cdn.example.com/voice/' } } }),
    };
    const stateMock = {
      getLocale: () => locale$.value,
      locale$: locale$.asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AudioEngineService, useValue: engine },
        { provide: ManifestService, useValue: manifestMock },
        { provide: PlayerStateService, useValue: stateMock },
        { provide: UserGestureService, useValue: gesture },
      ],
    });
    service = TestBed.inject(BubbleVoiceService);
  });

  afterEach(() => {
    service.stopAll();
  });

  it('speaks the lines of a shown panel one after another, resolved against the audio base', fakeAsync(() => {
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-a' }, { id: 'b', audioAssetId: 'v-b' }), clock);
    expect(engine.play).not.toHaveBeenCalled();

    clock.start();
    tick();
    expect(playedIds()).toEqual(['voice:p1:a']);
    expect(played[0]).toEqual(jasmine.objectContaining({ role: 'voiceover', loop: false, volume: 1, url: 'https://cdn.example.com/voice/v-a.mp3' }));
    expect(engine.play).toHaveBeenCalledTimes(1); // b waits for a

    endCurrent();
    tick();
    expect(playedIds()).toEqual(['voice:p1:a', 'voice:p1:b']);
    endCurrent();
    tick();
    expect(engine.play).toHaveBeenCalledTimes(2); // every line spoken once
    flush();
  }));

  it('waits for a timed balloon and does not start it before the previous line ended', fakeAsync(() => {
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'late', audioAssetId: 'v-b', showAtMs: 1000 }, { id: 'now', audioAssetId: 'v-a' }), clock);
    clock.start();
    tick();
    expect(playedIds()).toEqual(['voice:p1:now']);

    now = 1200;
    tick(1200);
    expect(playedIds()).toEqual(['voice:p1:now']); // its time came, but a line is being spoken
    endCurrent();
    tick();
    expect(playedIds()).toEqual(['voice:p1:now', 'voice:p1:late']);
    flush();
  }));

  it('starts a timed line at its time when nothing is being spoken', fakeAsync(() => {
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'late', audioAssetId: 'v-b', showAtMs: 1500 }), clock);
    clock.start();
    tick();
    expect(engine.play).not.toHaveBeenCalled();
    now = 1500;
    tick(1500);
    expect(playedIds()).toEqual(['voice:p1:late']);
    flush();
  }));

  it('reads panels shown together in the order they were attached (reading order), whichever clock started first', fakeAsync(() => {
    const clockA = new BubbleClock(() => now);
    const clockB = new BubbleClock(() => now);
    service.attach('pA', panel({ id: 'a', audioAssetId: 'v-a' }), clockA);
    service.attach('pB', panel({ id: 'b', audioAssetId: 'v-b' }), clockB);
    clockB.start();
    clockA.start();
    tick();
    expect(playedIds()).toEqual(['voice:pA:a']);
    endCurrent();
    tick();
    expect(playedIds()).toEqual(['voice:pA:a', 'voice:pB:b']);
    flush();
  }));

  it('a later panel waits for the timed line of the panel before it (a page reads in order)', fakeAsync(() => {
    const clockA = new BubbleClock(() => now);
    const clockB = new BubbleClock(() => now);
    service.attach('pA', panel({ id: 'a1', audioAssetId: 'v-a' }, { id: 'a2', audioAssetId: 'v-b', showAtMs: 1000 }), clockA);
    service.attach('pB', panel({ id: 'b', audioAssetId: 'v-c' }), clockB);
    clockA.start();
    clockB.start();
    tick();
    expect(playedIds()).toEqual(['voice:pA:a1']);
    endCurrent();
    tick();
    expect(playedIds()).toEqual(['voice:pA:a1']); // a2 is not due yet; b waits its turn
    now = 1000;
    tick(1000);
    expect(playedIds()).toEqual(['voice:pA:a1', 'voice:pA:a2']);
    endCurrent();
    tick();
    expect(playedIds()).toEqual(['voice:pA:a1', 'voice:pA:a2', 'voice:pB:b']);
    flush();
  }));

  it('a paused panel stops talking and is read again from that line when shown again', fakeAsync(() => {
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-a' }, { id: 'b', audioAssetId: 'v-b' }), clock);
    clock.start();
    tick();
    expect(playedIds()).toEqual(['voice:p1:a']);

    clock.pause();
    tick();
    expect(engine.stop).toHaveBeenCalledWith('voice:p1:a', BUBBLE_VOICE_STOP_FADE_MS);

    clock.start();
    tick();
    expect(playedIds()).toEqual(['voice:p1:a', 'voice:p1:a']); // the cut line again, not the next one
    flush();
  }));

  it('leaving the panel (detach) stops its line and lets the next panel speak', fakeAsync(() => {
    const clockA = new BubbleClock(() => now);
    const clockB = new BubbleClock(() => now);
    const detachA = service.attach('pA', panel({ id: 'a', audioAssetId: 'v-a' }), clockA);
    service.attach('pB', panel({ id: 'b', audioAssetId: 'v-b' }), clockB);
    clockA.start();
    clockB.start();
    tick();
    expect(playedIds()).toEqual(['voice:pA:a']);

    detachA();
    tick();
    expect(engine.stop).toHaveBeenCalledWith('voice:pA:a', BUBBLE_VOICE_STOP_FADE_MS);
    expect(playedIds()).toEqual(['voice:pA:a', 'voice:pB:b']);
    flush();
  }));

  it('the Voices toggle stops the line and reads the shown panel from the top when turned on again', fakeAsync(() => {
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-a' }, { id: 'b', audioAssetId: 'v-b' }), clock);
    clock.start();
    tick();
    endCurrent();
    tick();
    expect(playedIds()).toEqual(['voice:p1:a', 'voice:p1:b']);

    service.setEnabled(false);
    tick();
    expect(engine.stop).toHaveBeenCalledWith('voice:p1:b', BUBBLE_VOICE_STOP_FADE_MS);
    expect(service.isEnabled()).toBeFalse();
    clock.pause();
    clock.start();
    tick();
    expect(engine.play).toHaveBeenCalledTimes(2); // silent while off

    service.setEnabled(true);
    tick();
    expect(playedIds()).toEqual(['voice:p1:a', 'voice:p1:b', 'voice:p1:a']);
    flush();
  }));

  it('picks the variant of the reader\'s language and re-reads the panel when the language changes', fakeAsync(() => {
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-loc' }), clock);
    clock.start();
    tick();
    expect(played[0].url).toBe('https://cdn.example.com/voice/v-loc.en-US.mp3');

    locale$.next('de-DE');
    tick();
    expect(engine.stop).toHaveBeenCalledWith('voice:p1:a', BUBBLE_VOICE_STOP_FADE_MS);
    expect(played[1].url).toBe('https://cdn.example.com/voice/v-loc.de-DE.mp3');
    flush();
  }));

  it('a language switch while a panel is scrolled away re-reads it when it is shown again', fakeAsync(() => {
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-loc' }), clock);
    clock.start();
    tick();
    endCurrent();
    tick();
    expect(played.map((t) => t.url)).toEqual(['https://cdn.example.com/voice/v-loc.en-US.mp3']);

    clock.pause();
    locale$.next('de-DE');
    tick();
    expect(engine.play).toHaveBeenCalledTimes(1); // nothing while hidden
    clock.start();
    tick();
    expect(played.map((t) => t.url)).toEqual(['https://cdn.example.com/voice/v-loc.en-US.mp3', 'https://cdn.example.com/voice/v-loc.de-DE.mp3']);
    flush();
  }));

  it('a tap on a balloon speaks its line again (not while voices are off)', fakeAsync(() => {
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-a' }, { id: 'b', audioAssetId: 'v-b' }), clock);
    clock.start();
    tick();
    endCurrent();
    tick();
    endCurrent();
    tick();
    expect(playedIds()).toEqual(['voice:p1:a', 'voice:p1:b']);

    service.replay({ id: 'a' });
    tick();
    expect(playedIds()).toEqual(['voice:p1:a', 'voice:p1:b', 'voice:p1:a']);

    service.setEnabled(false);
    service.replay({ id: 'b' });
    tick();
    expect(engine.play).toHaveBeenCalledTimes(3);
    flush();
  }));

  it('a line refused by the autoplay policy is spoken on the first gesture', fakeAsync(() => {
    gesture.set(false);
    playRefusal = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-a' }), clock);
    clock.start();
    tick();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(played).toEqual([]);

    playRefusal = null;
    gesture.set(true);
    tick();
    expect(engine.resumeContext).toHaveBeenCalled();
    expect(playedIds()).toEqual(['voice:p1:a']);
    flush();
  }));

  it('skips a line whose asset is missing and goes on with the next', fakeAsync(() => {
    spyOn(console, 'warn');
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-missing' }, { id: 'b', audioAssetId: 'v-b' }), clock);
    clock.start();
    tick();
    expect(playedIds()).toEqual(['voice:p1:b']);
    expect(console.warn).toHaveBeenCalledTimes(1);
    flush();
  }));

  it('a panel without lines attaches nothing', () => {
    const clock = new BubbleClock(() => now);
    const detach = service.attach('p1', panel({ id: 'a' }), clock);
    clock.start();
    expect(engine.play).not.toHaveBeenCalled();
    detach();
  });

  it('exposes the balloon being spoken', fakeAsync(() => {
    const seen: (string | null)[] = [];
    service.speaking$.subscribe((id) => seen.push(id));
    const clock = new BubbleClock(() => now);
    service.attach('p1', panel({ id: 'a', audioAssetId: 'v-a' }), clock);
    clock.start();
    tick();
    endCurrent();
    tick();
    expect(seen).toEqual([null, 'a', null]);
    flush();
  }));
});
