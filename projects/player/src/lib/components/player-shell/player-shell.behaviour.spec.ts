/**
 * PlayerShellComponent behaviour against REAL manifest / flow / variable /
 * paywall services (only media, audio, tracking and translation are mocked):
 * navigation gating, input changes after init and the keyboard contract
 * while blocking overlays are open. The template is overridden — these
 * tests drive the component class.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { PlayerShellComponent } from './player-shell.component';
import { TranslationService } from '../../services/translation.service';
import { TrackingService } from '../../services/tracking.service';
import { VideoControllerService } from '../../services/video-controller.service';
import { VideoSequencerService } from '../../services/video-sequencer.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { PanelAudioService } from '../../services/panel-audio.service';
import { VariableStoreService } from '../../services/variable-store.service';
import type { PanelWaveManifest } from '../../types';

/** p1 → p2 (edge increments `tries`) → p3; p2 is sold separately. */
const buildManifest = (over: Record<string, unknown> = {}): PanelWaveManifest =>
  ({
    panelwave: { version: '1.0.0', schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json' },
    meta: { id: 'work-behaviour', title: { 'en-US': 'Behaviour' }, locales: ['en-US', 'de-DE'], default_locale: 'en-US' },
    variables: { definitions: [{ id: 'tries', type: 'number', scope: 'session', default: 0 }] },
    chapters: [
      {
        id: 'c1',
        title: { 'en-US': 'One' },
        panels: { p1: { layers: [] }, p2: { layers: [] }, p3: { layers: [] } },
        graph: {
          entry: 'p1',
          edges: [
            { from: 'p1', to: 'p2', action: [{ op: 'increment', var: 'tries', value: 1 }] },
            { from: 'p2', to: 'p3' },
          ],
        },
      },
    ],
    paywall: {
      rules: [
        {
          id: 'p2-sale',
          scope: 'panel',
          refId: 'p2',
          requireEntitlement: 'purchase',
          entitlementType: 'purchase',
          requiredProductIds: ['p2-product'],
        },
      ],
    },
    ...over,
  }) as unknown as PanelWaveManifest;

describe('PlayerShellComponent behaviour (real services)', () => {
  let shell: PlayerShellComponent;
  let variables: VariableStoreService;

  const tries = () => variables.get('tries', 'session');

  const init = async (): Promise<void> => {
    shell.ngOnInit();
    // initializePlayer is async (awaits manifest load + navigation).
    await new Promise((resolve) => setTimeout(resolve));
    await new Promise((resolve) => setTimeout(resolve));
  };

  beforeEach(() => {
    localStorage.removeItem('pw-social');
    localStorage.removeItem('pw-age-verified');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslationService, useValue: { setLanguage: () => undefined, instant: (k: string) => k } },
        {
          provide: TrackingService,
          useValue: { configure: () => undefined, setConsent: () => undefined, track: () => undefined, flushSync: () => undefined },
        },
        { provide: VideoControllerService, useValue: { passComplete$: new Subject() } },
        {
          provide: VideoSequencerService,
          useValue: { queueComplete: new Subject(), start: () => undefined, reset: () => undefined, getStallTimeout: () => 10_000 },
        },
        {
          provide: AudioEngineService,
          useValue: jasmine.createSpyObj('AudioEngineService', ['setMasterVolume', 'setRoleVolume', 'setMasterMuted', 'setRoleMuted']),
        },
        { provide: PanelAudioService, useValue: { syncPanel: () => undefined, stopAll: () => undefined } },
      ],
    });
    TestBed.overrideComponent(PlayerShellComponent, { set: { template: '', imports: [] } });
    shell = TestBed.createComponent(PlayerShellComponent).componentInstance;
    variables = TestBed.inject(VariableStoreService);
    shell.manifest = buildManifest();
  });

  afterEach(() => {
    shell.autoplayEnabled = false;
    shell.ngOnDestroy();
  });

  describe('edge mutations vs. the paywall', () => {
    it('does not apply edge mutations when the paywall blocks the move', async () => {
      await init();
      expect(shell.getCurrentPanelId()).toBe('p1');

      await shell.navigateNext();
      await shell.navigateNext();

      expect(shell.paywallVisible).toBeTrue();
      expect(shell.getCurrentPanelId()).toBe('p1');
      expect(tries()).toBe(0);
    });

    it('applies them exactly once when the move is allowed', async () => {
      shell.entitlementSnapshot = { subscriptionTier: null, purchasedProductIds: ['p2-product'], ageVerified: false };
      await init();

      await shell.navigateNext();

      expect(shell.getCurrentPanelId()).toBe('p2');
      expect(tries()).toBe(1);
    });

    it("does not apply a chosen branch's mutations when the target is gated", async () => {
      await init();
      const edge = shell.currentChapter!.graph.edges[0];

      await shell.onBranchChosen({ edge, index: 0, label: 'Go' });

      expect(shell.paywallVisible).toBeTrue();
      expect(tries()).toBe(0);
    });

    it("applies an age-gated edge's mutations only once the reader passes", async () => {
      shell.manifest = buildManifest({
        paywall: { rules: [{ id: 'age', scope: 'panel', refId: 'p2', requireEntitlement: 'age_gate', minimumAge: 18 }] },
      });
      await init();

      await shell.navigateNext();
      expect(shell.ageGateVisible).toBeTrue();
      expect(tries()).toBe(0);

      await shell.onAgeGateVerify({ verified: true, age: 30 });
      expect(shell.getCurrentPanelId()).toBe('p2');
      expect(tries()).toBe(1);
    });
  });

});
