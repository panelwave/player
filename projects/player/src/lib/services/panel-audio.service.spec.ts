/**
 * PanelAudioService tests: manifest → engine resolution, panel enter/leave
 * lifecycle, cross-panel continuity and the autoplay-policy retry.
 */

import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { PanelAudioService, PANEL_AUDIO_LEAVE_FADE_MS, busForRole } from './panel-audio.service';
import { AudioEngineService } from './audio-engine.service';
import { ManifestService } from './manifest.service';
import { UserGestureService } from './user-gesture.service';
import type { Panel } from '../types';

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

describe('PanelAudioService', () => {
  let service: PanelAudioService;
  let gesture: MockGesture;
  let active: Set<string>;
  let engine: {
    play: jasmine.Spy;
    stop: jasmine.Spy;
    isActive: (id: string) => boolean;
    setTrackVolume: jasmine.Spy;
    resumeContext: jasmine.Spy;
  };
  let catalog: Record<string, unknown>;

  const audioAsset = (id: string, src: string, role?: string, loop?: boolean) => ({
    id,
    category: 'audio',
    role,
    variants: [{ src, mime: 'audio/mpeg', loop }],
  });

  beforeEach(() => {
    active = new Set<string>();
    gesture = new MockGesture();
    engine = {
      play: jasmine.createSpy('engine.play').and.callFake((track: { id: string }) => {
        active.add(track.id);
        return Promise.resolve();
      }),
      stop: jasmine.createSpy('engine.stop').and.callFake((id: string) => {
        active.delete(id);
        return Promise.resolve();
      }),
      isActive: (id: string) => active.has(id),
      setTrackVolume: jasmine.createSpy('engine.setTrackVolume'),
      resumeContext: jasmine.createSpy('engine.resumeContext').and.returnValue(Promise.resolve()),
    };
    catalog = {
      'amb-street': audioAsset('amb-street', 'street.mp3', 'ambient', true),
      'sfx-door': audioAsset('sfx-door', 'door.mp3', 'sfx'),
      'ui-click': audioAsset('ui-click', 'click.mp3', 'ui'),
      'theme': audioAsset('theme', 'https://media.example.com/theme.mp3'),
      'not-audio': { id: 'not-audio', category: 'image', variants: [{ src: 'x.png' }] },
    };
    const manifestMock = {
      getAsset: (id: string) => catalog[id] ?? null,
      getManifest: () => ({ assets: { base: { audioBase: 'https://cdn.example.com/audio/' } } }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AudioEngineService, useValue: engine },
        { provide: ManifestService, useValue: manifestMock },
        { provide: UserGestureService, useValue: gesture },
      ],
    });
    service = TestBed.inject(PanelAudioService);
  });

  afterEach(() => {
    service.stopAll();
  });

  const panelWith = (audio: Panel['audio'], layers?: Panel['layers']): Panel =>
    ({ audio, layers }) as unknown as Panel;

  describe('busForRole', () => {
    it('maps manifest roles onto engine buses', () => {
      expect(busForRole('ambient')).toBe('ambient');
      expect(busForRole('music')).toBe('music');
      expect(busForRole('voiceover')).toBe('voiceover');
      expect(busForRole('sfx')).toBe('sfx');
      expect(busForRole('ui')).toBe('sfx');
      expect(busForRole('none')).toBe('music');
      expect(busForRole(undefined)).toBe('music');
    });
  });

  describe('resolution', () => {
    it('starts a panel audio track resolved against the catalog and audio base', () => {
      service.syncPanel(
        'p1',
        panelWith([{ assetId: 'amb-street', role: 'ambient', loop: true, gain: 0.5 }]),
        {}
      );

      expect(engine.play).toHaveBeenCalledWith({
        id: 'amb-street',
        url: 'https://cdn.example.com/audio/street.mp3',
        role: 'ambient',
        loop: true,
        volume: 0.5,
      });
    });

    it('keeps absolute variant URLs, defaults gain to 1 and the role to the music bus', () => {
      service.syncPanel('p1', panelWith([{ assetId: 'theme' }]), {});

      expect(engine.play).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: 'theme',
          url: 'https://media.example.com/theme.mp3',
          role: 'music',
          loop: false,
          volume: 1,
        })
      );
    });

    it('falls back to the catalog role and puts ui sounds on the sfx bus', () => {
      service.syncPanel('p1', panelWith([{ assetId: 'ui-click' }]), {});

      expect(engine.play).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'ui-click', role: 'sfx' }));
    });

    it('clamps gain to 0-2', () => {
      service.syncPanel('p1', panelWith([{ assetId: 'sfx-door', gain: 5 }]), {});

      expect(engine.play).toHaveBeenCalledWith(jasmine.objectContaining({ volume: 2 }));
    });

    it('resolves kind:audio layers too', () => {
      service.syncPanel(
        'p1',
        panelWith(undefined, [
          { kind: 'audio', id: 'l1', assetId: 'amb-street', loop: true } as never,
          { kind: 'image', id: 'l2', assetId: 'img' } as never,
        ]),
        {}
      );

      expect(engine.play).toHaveBeenCalledTimes(1);
      expect(engine.play).toHaveBeenCalledWith(
        jasmine.objectContaining({ id: 'amb-street', role: 'ambient', loop: true })
      );
    });

    it('skips tracks whose asset is missing or not audio (warning once)', () => {
      const warn = spyOn(console, 'warn');

      service.syncPanel('p1', panelWith([{ assetId: 'nope' }, { assetId: 'not-audio' }]), {});
      service.syncPanel('p2', panelWith([{ assetId: 'nope' }]), {});

      expect(engine.play).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('gives a twice-referenced asset distinct engine ids', () => {
      service.syncPanel(
        'p1',
        panelWith([{ assetId: 'sfx-door' }, { assetId: 'sfx-door', startAtMs: 0 }]),
        {}
      );

      const ids = engine.play.calls.allArgs().map((args) => (args[0] as { id: string }).id);
      expect(ids).toEqual(['sfx-door', 'sfx-door#2']);
    });
  });

  describe('visibleIf', () => {
    it('does not start a track whose condition is false', () => {
      service.syncPanel(
        'p1',
        panelWith([{ assetId: 'sfx-door', visibleIf: { '==': [{ var: 'door' }, 'open'] } }]),
        { door: 'closed' }
      );

      expect(engine.play).not.toHaveBeenCalled();
    });

    it('starts it once the variable context satisfies the condition (same panel)', () => {
      const panel = panelWith([
        { assetId: 'amb-street', loop: true },
        { assetId: 'sfx-door', visibleIf: { '==': [{ var: 'door' }, 'open'] } },
      ]);
      service.syncPanel('p1', panel, { door: 'closed' });
      expect(engine.play).toHaveBeenCalledTimes(1);

      service.syncPanel('p1', panel, { door: 'open' });

      expect(engine.play).toHaveBeenCalledTimes(2);
      expect(engine.play.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ id: 'sfx-door' }));
      // The already-playing loop was not restarted.
      expect(engine.stop).not.toHaveBeenCalled();
    });
  });

  describe('panel lifecycle', () => {
    it('stops tracks the next panel does not reference (loops fade, one-shots cut)', () => {
      service.syncPanel(
        'p1',
        panelWith([{ assetId: 'amb-street', loop: true }, { assetId: 'sfx-door' }]),
        {}
      );

      service.syncPanel('p2', panelWith([]), {});

      expect(engine.stop).toHaveBeenCalledWith('amb-street', PANEL_AUDIO_LEAVE_FADE_MS);
      expect(engine.stop).toHaveBeenCalledWith('sfx-door', 0);
      expect(service.getDesiredTrackIds()).toEqual([]);
    });

    it('keeps a looping track playing across consecutive panels and follows its gain', () => {
      service.syncPanel('p1', panelWith([{ assetId: 'amb-street', loop: true, gain: 0.5 }]), {});

      service.syncPanel('p2', panelWith([{ assetId: 'amb-street', loop: true, gain: 0.8 }]), {});

      expect(engine.play).toHaveBeenCalledTimes(1);
      expect(engine.stop).not.toHaveBeenCalled();
      expect(engine.setTrackVolume).toHaveBeenCalledWith('amb-street', 0.8);
    });

    it('restarts a one-shot track when the next panel references it again', () => {
      service.syncPanel('p1', panelWith([{ assetId: 'sfx-door' }]), {});

      service.syncPanel('p2', panelWith([{ assetId: 'sfx-door' }]), {});

      expect(engine.play).toHaveBeenCalledTimes(2);
    });

    it('is idempotent for an unchanged panel', () => {
      const panel = panelWith([{ assetId: 'amb-street', loop: true }, { assetId: 'sfx-door' }]);
      service.syncPanel('p1', panel, {});

      service.syncPanel('p1', panel, {});

      expect(engine.play).toHaveBeenCalledTimes(2);
      expect(engine.stop).not.toHaveBeenCalled();
    });

    it('syncing to no panel stops everything', () => {
      service.syncPanel('p1', panelWith([{ assetId: 'amb-street', loop: true }]), {});

      service.syncPanel(undefined, undefined, null);

      expect(engine.stop).toHaveBeenCalledWith('amb-street', PANEL_AUDIO_LEAVE_FADE_MS);
    });
  });

  describe('startAtMs', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('delays the start and cancels it when the panel changes first', () => {
      service.syncPanel('p1', panelWith([{ assetId: 'sfx-door', startAtMs: 2500 }]), {});
      expect(engine.play).not.toHaveBeenCalled();

      jasmine.clock().tick(2499);
      expect(engine.play).not.toHaveBeenCalled();
      jasmine.clock().tick(1);
      expect(engine.play).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'sfx-door' }));
    });

    it('a pending start is dropped when the reader leaves before it fires', () => {
      service.syncPanel('p1', panelWith([{ assetId: 'sfx-door', startAtMs: 2500 }]), {});

      service.syncPanel('p2', panelWith([]), {});
      jasmine.clock().tick(3000);

      expect(engine.play).not.toHaveBeenCalled();
    });
  });

  describe('autoplay policy', () => {
    it('retries a refused track (and resumes the context) on the first user gesture', async () => {
      const refusal = Object.assign(new Error('play() failed'), { name: 'NotAllowedError' });
      engine.play.and.returnValue(Promise.reject(refusal));

      service.syncPanel('p1', panelWith([{ assetId: 'amb-street', loop: true }]), {});
      await Promise.resolve();
      await Promise.resolve();
      expect(engine.play).toHaveBeenCalledTimes(1);

      engine.play.and.callFake((track: { id: string }) => {
        active.add(track.id);
        return Promise.resolve();
      });
      gesture.set(true);

      expect(engine.resumeContext).toHaveBeenCalled();
      expect(engine.play).toHaveBeenCalledTimes(2);
      expect(engine.play.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ id: 'amb-street' }));
    });

    it('does not retry a track the panel no longer wants', async () => {
      const refusal = Object.assign(new Error('play() failed'), { name: 'NotAllowedError' });
      engine.play.and.returnValue(Promise.reject(refusal));

      service.syncPanel('p1', panelWith([{ assetId: 'amb-street', loop: true }]), {});
      await Promise.resolve();
      await Promise.resolve();
      service.syncPanel('p2', panelWith([]), {});

      gesture.set(true);

      expect(engine.play).toHaveBeenCalledTimes(1);
    });

    it('swallows other playback errors', async () => {
      engine.play.and.returnValue(Promise.reject(new Error('decode')));

      service.syncPanel('p1', panelWith([{ assetId: 'amb-street' }]), {});
      await Promise.resolve();
      await Promise.resolve();
      gesture.set(true);

      expect(engine.play).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopAll', () => {
    it('stops active tracks and clears pending ones', () => {
      jasmine.clock().install();
      service.syncPanel(
        'p1',
        panelWith([{ assetId: 'amb-street', loop: true }, { assetId: 'sfx-door', startAtMs: 500 }]),
        {}
      );

      service.stopAll();
      jasmine.clock().tick(1000);

      expect(engine.stop).toHaveBeenCalledWith('amb-street', 0);
      expect(engine.play).toHaveBeenCalledTimes(1);
      expect(service.getDesiredTrackIds()).toEqual([]);
      jasmine.clock().uninstall();
    });
  });
});
