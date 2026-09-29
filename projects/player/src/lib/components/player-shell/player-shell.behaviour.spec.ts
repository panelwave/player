/**
 * PlayerShellComponent behaviour against REAL manifest / flow / variable /
 * paywall services (only media, audio, tracking and translation are mocked):
 * navigation gating, input changes after init and the keyboard contract
 * while blocking overlays are open. The template is overridden — these
 * tests drive the component class.
 */

import { TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { PlayerShellComponent } from './player-shell.component';
import { TranslationService } from '../../services/translation.service';
import { TrackingService } from '../../services/tracking.service';
import { VideoControllerService } from '../../services/video-controller.service';
import { VideoSequencerService } from '../../services/video-sequencer.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { PanelAudioService } from '../../services/panel-audio.service';
import { VariableStoreService } from '../../services/variable-store.service';
import type { PanelWaveManifest, PlayerPanelChangeEvent } from '../../types';

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
  let setLanguage: jasmine.Spy;

  const tries = () => variables.get('tries', 'session');

  const init = async (): Promise<void> => {
    shell.ngOnInit();
    // initializePlayer is async (awaits manifest load + navigation).
    await new Promise((resolve) => setTimeout(resolve));
    await new Promise((resolve) => setTimeout(resolve));
  };

  /** Set an input after init the way Angular does, then flush the async reload. */
  const change = async (name: string, value: unknown): Promise<void> => {
    (shell as unknown as Record<string, unknown>)[name] = value;
    shell.ngOnChanges({ [name]: new SimpleChange(undefined, value, false) });
    await new Promise((resolve) => setTimeout(resolve));
    await new Promise((resolve) => setTimeout(resolve));
  };

  beforeEach(() => {
    setLanguage = jasmine.createSpy('setLanguage');
    localStorage.removeItem('pw-social');
    localStorage.removeItem('pw-age-verified');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslationService, useValue: { setLanguage, instant: (k: string) => k } },
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


  describe('Choices button', () => {
    const branching = (condition?: unknown) =>
      buildManifest({
        paywall: undefined,
        chapters: [
          {
            id: 'c1',
            title: { 'en-US': 'One' },
            panels: { p1: { layers: [] }, p2: { layers: [] }, p3: { layers: [] } },
            graph: {
              entry: 'p1',
              edges: [
                { from: 'p1', to: 'p2' },
                { from: 'p1', to: 'p3', ...(condition ? { condition } : {}) },
              ],
            },
          },
        ],
      });

    it('shows with two open paths', async () => {
      shell.manifest = branching();
      await init();
      expect(shell.hasBranchesAhead).toBeTrue();
    });

    it('hides when a conditional edge is closed, and shows once it opens', async () => {
      shell.manifest = branching({ '>': [{ var: 'tries' }, 0] });
      await init();
      expect(shell.hasBranchesAhead).toBeFalse();

      variables.set('tries', 1, 'session');
      expect(shell.hasBranchesAhead).toBeTrue();
    });

    it('hides on a panel with a single path', async () => {
      await init();
      expect(shell.hasBranchesAhead).toBeFalse();
    });
  });

  describe('manifestUrl loading', () => {
    it('exposes the fetched manifest to the ToC and thumbnail strip', async () => {
      shell.manifest = undefined;
      shell.manifestUrl = '/works/behaviour.json';
      shell.ngOnInit();
      TestBed.inject(HttpTestingController).expectOne('/works/behaviour.json').flush(buildManifest());
      await new Promise((resolve) => setTimeout(resolve));

      expect(shell.getCurrentPanelId()).toBe('p1');
      expect(shell.loadedManifest?.chapters.map((c) => c.id)).toEqual(['c1']);
    });
  });

  describe('autoplay input', () => {
    it('starts autoplay when the host sets it', async () => {
      shell.autoplay = true;
      await init();
      expect(shell.autoplayEnabled).toBeTrue();

      // The reader's toolbar toggle still works afterwards.
      shell.onToggleAutoplay();
      expect(shell.autoplayEnabled).toBeFalse();
    });

    it('stays off by default', async () => {
      await init();
      expect(shell.autoplayEnabled).toBeFalse();
    });
  });

  describe('input changes after init', () => {
    it('ignores the first round of changes (ngOnInit loads once)', () => {
      const load = spyOn(shell as unknown as { initializePlayer(): Promise<void> }, 'initializePlayer').and.resolveTo();
      shell.ngOnChanges({ manifest: new SimpleChange(undefined, shell.manifest, true) });
      expect(load).not.toHaveBeenCalled();
      shell.ngOnInit();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('reloads the work when manifest changes, resetting story state', async () => {
      shell.entitlementSnapshot = { subscriptionTier: null, purchasedProductIds: ['p2-product'], ageVerified: false };
      await init();
      await shell.navigateNext();
      expect(tries()).toBe(1);

      const next = buildManifest();
      next.chapters[0].graph.entry = 'p3';
      await change('manifest', next);

      expect(shell.getCurrentPanelId()).toBe('p3');
      expect(tries()).toBe(0);
      expect(shell.loadedManifest).toBe(next);
    });

    it('reloads from a new manifestUrl', async () => {
      await init();
      shell.manifest = undefined;
      shell.manifestUrl = '/works/other.json';
      shell.ngOnChanges({ manifestUrl: new SimpleChange(undefined, '/works/other.json', false) });
      const other = buildManifest();
      other.meta.id = 'other-work';
      TestBed.inject(HttpTestingController).expectOne('/works/other.json').flush(other);
      await new Promise((resolve) => setTimeout(resolve));
      await new Promise((resolve) => setTimeout(resolve));
      expect(shell.loadedManifest?.meta.id).toBe('other-work');
      expect(shell.getCurrentPanelId()).toBe('p1');
    });

    it('switches locale', async () => {
      await init();
      setLanguage.calls.reset();
      await change('locale', 'de-DE');
      expect(setLanguage).toHaveBeenCalledWith('de-DE');
    });

    it('re-evaluates gates when the entitlement snapshot changes', async () => {
      await init();
      await shell.navigateNext();
      expect(shell.paywallVisible).toBeTrue();

      await change('entitlementSnapshot', { subscriptionTier: null, purchasedProductIds: ['p2-product'], ageVerified: false });
      expect(shell.paywallVisible).toBeFalse();
      await shell.navigateNext();
      expect(shell.getCurrentPanelId()).toBe('p2');

      // Removing the snapshot falls back to the anonymous reader.
      await change('entitlementSnapshot', undefined);
      await shell.navigateToPanel('c1', 'p2');
      expect(shell.paywallVisible).toBeTrue();
    });

    it('applies showToolbar, autoplay, secondsPerPanel and viewModeOverride', async () => {
      await init();
      await change('showToolbar', true);
      expect(shell.toolbarVisible).toBeTrue();

      await change('autoplay', true);
      expect(shell.autoplayEnabled).toBeTrue();
      const rearm = spyOn(shell as unknown as { startAutoplay(): void }, 'startAutoplay').and.callThrough();
      await change('secondsPerPanel', 2);
      expect(rearm).toHaveBeenCalled();
      await change('autoplay', false);
      expect(shell.autoplayEnabled).toBeFalse();

      shell.viewMode = 'page';
      await change('viewModeOverride', 'panel');
      expect(shell.viewMode).toBe('panel');
    });
  });

  describe('panelChange output', () => {
    let events: PlayerPanelChangeEvent[];
    const ids = () => events.map((e) => [e.panelId, e.previousPanelId ?? null, e.chapter.id]);

    beforeEach(() => {
      events = [];
      shell.panelChange.subscribe((e) => events.push(e));
    });

    it('carries the entry panel id, without a previous panel, once', async () => {
      await init();
      expect(ids()).toEqual([['p1', null, 'c1']]);
      expect(events[0].panel).toBe(shell.loadedManifest!.chapters[0].panels['p1']);
    });

    it('carries the new and the previous panel id on each move', async () => {
      shell.entitlementSnapshot = { subscriptionTier: null, purchasedProductIds: ['p2-product'], ageVerified: false };
      await init();
      await shell.navigateNext();
      await shell.navigateNext();
      await shell.navigatePrevious();
      expect(ids()).toEqual([
        ['p1', null, 'c1'],
        ['p2', 'p1', 'c1'],
        ['p3', 'p2', 'c1'],
        ['p2', 'p3', 'c1'],
      ]);
    });

    it('does not fire for a move the paywall blocks', async () => {
      await init();
      await shell.navigateNext();
      expect(shell.paywallVisible).toBeTrue();
      expect(ids()).toEqual([['p1', null, 'c1']]);
    });

    it('keeps the previous panel across a chapter change', async () => {
      const manifest = buildManifest({ paywall: undefined });
      manifest.chapters.push({
        id: 'c2',
        title: { 'en-US': 'Two' },
        panels: { q1: { layers: [] } },
        graph: { entry: 'q1', edges: [] },
      } as unknown as PanelWaveManifest['chapters'][number]);
      shell.manifest = manifest;
      await init();
      await shell.navigateToPanel('c2', 'q1');
      expect(ids()).toEqual([
        ['p1', null, 'c1'],
        ['q1', 'p1', 'c2'],
      ]);
    });

    it('starts over without a previous panel after a reload', async () => {
      shell.entitlementSnapshot = { subscriptionTier: null, purchasedProductIds: ['p2-product'], ageVerified: false };
      await init();
      await shell.navigateNext();
      events = [];
      await change('manifest', buildManifest());
      expect(ids()).toEqual([['p1', null, 'c1']]);
    });
  });

  describe('paywall purchase options', () => {
    it("passes the rule's product on the gate and reports it with the action", async () => {
      await init();
      const emitted: unknown[] = [];
      shell.paywallAction.subscribe((e) => emitted.push(e));

      await shell.navigateNext();
      expect(shell.paywallGate?.options?.map((o) => [o.productId, o.type])).toEqual([['p2-product', 'one-time']]);

      // The overlay emits `purchase` (product id) before `action`.
      shell.paywallProductId = 'p2-product';
      shell.onPaywallAction('purchase');
      expect(emitted).toEqual([
        jasmine.objectContaining({ action: 'purchase', productId: 'p2-product', gate: jasmine.objectContaining({ refId: 'p2' }) }),
      ]);
      expect(shell.paywallVisible).toBeFalse();
    });

    it('reports login and dismiss without a product', async () => {
      await init();
      const emitted: { productId?: string }[] = [];
      shell.paywallAction.subscribe((e) => emitted.push(e));
      await shell.navigateNext();
      shell.onPaywallAction('dismiss');
      expect(emitted[0].productId).toBeUndefined();
    });
  });

  describe('age on top of a purchase', () => {
    it('asks for the age, then shows the paywall with Buy, then lets a buyer through', async () => {
      shell.manifest = buildManifest({
        paywall: {
          rules: [
            { id: 'adult-sale', scope: 'panel', refId: 'p2', requireEntitlement: 'token', ageGate: 18, requiredProductIds: ['p2-product'] },
          ],
        },
      });
      await init();

      await shell.navigateNext();
      expect(shell.ageGateVisible).toBeTrue();
      expect(shell.paywallVisible).toBeFalse();

      await shell.onAgeGateVerify({ verified: true, age: 30 });
      expect(shell.ageGateVisible).toBeFalse();
      expect(shell.paywallVisible).toBeTrue();
      expect(shell.paywallGate?.lockReason).toBe('purchase_required');
      expect(shell.paywallGate?.options?.map((o) => o.productId)).toEqual(['p2-product']);
      expect(shell.getCurrentPanelId()).toBe('p1');
      expect(tries()).toBe(0);

      await shell.refreshEntitlements({ subscriptionTier: null, purchasedProductIds: ['p2-product'], ageVerified: false });
      await shell.navigateNext();
      expect(shell.getCurrentPanelId()).toBe('p2');
      expect(tries()).toBe(1);
    });
  });
});
