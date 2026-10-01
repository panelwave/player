/**
 * PlayerShellComponent gating with the REAL template and services: what the
 * reader can see (DOM) while an age gate or paywall stands between them and
 * a panel — on the initial load, on chapter jumps, in page view.
 */

import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PlayerShellComponent } from './player-shell.component';
import { PanelAudioService } from '../../services/panel-audio.service';
import type { PanelWaveManifest } from '../../types';

/** A panel whose only content is a text layer carrying `secret`. */
const textPanel = (secret: string) => ({
  layers: [{ kind: 'text', id: `t-${secret}`, text: { 'en-US': secret }, x: 10, y: 10, z: 0 }],
});

const page = (id: string, panelIds: string[]) => ({
  id,
  layout: {
    format: 'bigscreen-landscape',
    canvasSize: { width: 1920, height: 1080 },
    placements: panelIds.map((panelId, i) => ({ panelId, x: i * 0.5, y: 0, w: 0.5, h: 1, z: i })),
  },
  readingOrder: panelIds,
});

const manifestWith = (over: Record<string, unknown>): PanelWaveManifest =>
  ({
    panelwave: { version: '1.0.0' },
    meta: { id: 'gating-work', title: { 'en-US': 'Gating' }, locales: ['en-US'], default_locale: 'en-US' },
    chapters: [
      {
        id: 'c1',
        panels: { p1: textPanel('Alpha'), p2: textPanel('Bravo'), p3: textPanel('Charlie') },
        graph: { entry: 'p1', edges: [{ from: 'p1', to: 'p2' }, { from: 'p2', to: 'p3' }] },
        pages: [page('pg1', ['p1']), page('pg2', ['p2', 'p3'])],
      },
      {
        id: 'c2',
        panels: { q1: textPanel('Quebec') },
        graph: { entry: 'q1', edges: [] },
      },
    ],
    ...over,
  }) as unknown as PanelWaveManifest;

const verified = { verified: true, age: 30 } as const;

describe('PlayerShellComponent gating (real template)', () => {
  let fixture: ComponentFixture<PlayerShellComponent>;
  let shell: PlayerShellComponent;

  /** Flush async work and repaint (the OnPush shell is driven from outside its template here). */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
    }
  };
  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const locks = (): number => (fixture.nativeElement as HTMLElement).querySelectorAll('.pw-locked-panel').length;

  async function start(manifest: PanelWaveManifest): Promise<void> {
    shell.manifest = manifest;
    fixture.detectChanges();
    await settle();
  }

  beforeEach(() => {
    localStorage.removeItem('pw-age-verified');
    localStorage.removeItem('pw-social');
    TestBed.configureTestingModule({
      imports: [PlayerShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    });
    fixture = TestBed.createComponent(PlayerShellComponent);
    shell = fixture.componentInstance;
  });

  afterEach(() => {
    shell.ngOnDestroy();
    localStorage.removeItem('pw-age-verified');
  });

  describe('initial load', () => {
    const ageGatedWork = () =>
      manifestWith({
        paywall: { rules: [{ id: 'adult', scope: 'work', entitlementType: 'age_gate', minimumAge: 18, previewPanelCount: 0 }] },
      });

    it('opens the age gate for a gated entry panel and keeps its content out of the DOM', async () => {
      await start(ageGatedWork());

      expect(shell.ageGateVisible).toBeTrue();
      expect(shell.getCurrentPanelId()).toBe('p1');
      expect(locks()).toBe(1);
      expect(text()).not.toContain('Alpha');

      await shell.onAgeGateVerify(verified);
      await settle();
      expect(shell.ageGateVisible).toBeFalse();
      expect(shell.paywallVisible).toBeFalse();
      expect(locks()).toBe(0);
      expect(text()).toContain('Alpha');
      expect(shell.getCurrentPanelId()).toBe('p1');
    });

    it('raises the paywall for a purchase-gated entry panel, content hidden', async () => {
      await start(
        manifestWith({
          paywall: { rules: [{ id: 'buy', scope: 'work', entitlementType: 'purchase', requiredProductIds: ['book'] }] },
        }),
      );
      expect(shell.paywallVisible).toBeTrue();
      expect(shell.ageGateVisible).toBeFalse();
      expect(text()).not.toContain('Alpha');
      expect(locks()).toBe(1);
    });

    it('changes nothing for a work without rules', async () => {
      await start(manifestWith({}));
      expect(shell.ageGateVisible).toBeFalse();
      expect(shell.paywallVisible).toBeFalse();
      expect(locks()).toBe(0);
      expect(text()).toContain('Alpha');
    });
  });

  describe('chapter jumps (TOC)', () => {
    it('stops at a gated chapter entry: gate opens, the reader stays put', async () => {
      await start(
        manifestWith({
          paywall: { rules: [{ id: 'adult-c2', scope: 'chapter', refId: 'c2', entitlementType: 'age_gate', minimumAge: 18 }] },
        }),
      );
      expect(shell.ageGateVisible).toBeFalse();

      await shell.navigateToChapter('c2');
      await settle();
      expect(shell.ageGateVisible).toBeTrue();
      expect(shell.getCurrentPanelId()).toBe('p1');
      expect(text()).not.toContain('Quebec');

      await shell.onAgeGateVerify(verified);
      await settle();
      expect(shell.getCurrentPanelId()).toBe('q1');
      expect(text()).toContain('Quebec');
    });
  });

  describe('page view', () => {
    const p2AgeGated = () =>
      manifestWith({
        paywall: { rules: [{ id: 'adult-p2', scope: 'panel', refId: 'p2', entitlementType: 'age_gate', minimumAge: 18 }] },
      });

    it('turning onto a page with an age-locked panel: placeholder plus one age prompt, content after confirming', async () => {
      await start(p2AgeGated());
      shell.onToggleView(); // panel -> page
      await settle();
      expect(shell.viewMode).toBe('page');
      expect(shell.ageGateVisible).toBeFalse();
      expect(text()).toContain('Alpha');

      shell.navigateToNextPage();
      await settle();
      expect(shell.ageGateVisible).toBeTrue();
      expect(locks()).toBe(1);
      expect(text()).not.toContain('Bravo');
      expect(text()).toContain('Charlie');

      await shell.onAgeGateVerify(verified);
      await settle();
      expect(shell.ageGateVisible).toBeFalse();
      expect(locks()).toBe(0);
      expect(text()).toContain('Bravo');
    });

    it('activating a purchase-locked placeholder opens the paywall for that panel', async () => {
      await start(
        manifestWith({
          paywall: {
            rules: [{ id: 'buy-p2', scope: 'panel', refId: 'p2', entitlementType: 'purchase', requiredProductIds: ['book'] }],
          },
        }),
      );
      shell.onToggleView();
      shell.navigateToNextPage();
      await settle();
      expect(shell.paywallVisible).toBeFalse();

      const lock = (fixture.nativeElement as HTMLElement).querySelector('[data-panel-id="p2"] .pw-locked-panel') as HTMLElement;
      lock.click();
      await settle();
      expect(shell.paywallVisible).toBeTrue();
      expect(shell.paywallGate?.ruleId).toBe('buy-p2');
      expect(shell.paywallGate?.lockReason).toBe('purchase_required');

      shell.closePaywall();
      lock.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await settle();
      expect(shell.paywallVisible).toBeTrue();
    });

    it('activating an age-locked placeholder asks for the age', async () => {
      await start(p2AgeGated());
      shell.onToggleView();
      shell.navigateToNextPage();
      await settle();
      shell.closeAgeGate();
      await settle();

      ((fixture.nativeElement as HTMLElement).querySelector('[data-panel-id="p2"] .pw-locked-panel') as HTMLElement).click();
      await settle();
      expect(shell.ageGateVisible).toBeTrue();
      expect(shell.paywallVisible).toBeFalse();
      await shell.onAgeGateVerify(verified);
      await settle();
      expect(text()).toContain('Bravo');
    });

    it('shows no placeholders when the work has no rules', async () => {
      await start(manifestWith({}));
      shell.onToggleView();
      shell.navigateToNextPage();
      await settle();
      expect(shell.ageGateVisible).toBeFalse();
      expect(locks()).toBe(0);
      expect(text()).toContain('Bravo');
    });
  });

  describe('panel audio', () => {
    const audioPanel = { ...textPanel('Alpha'), audio: [{ id: 'theme', src: 'theme.mp3', loop: true }] };
    const withAudio = (paywall?: unknown) =>
      manifestWith({
        chapters: [
          {
            id: 'c1',
            panels: { p1: audioPanel },
            graph: { entry: 'p1', edges: [] },
          },
        ],
        ...(paywall ? { paywall } : {}),
      });
    let syncPanel: jasmine.Spy;

    beforeEach(() => {
      syncPanel = spyOn(TestBed.inject(PanelAudioService), 'syncPanel').and.stub();
    });

    it('keeps an age-gated entry panel silent until the age is verified', async () => {
      await start(
        withAudio({ rules: [{ id: 'adult', scope: 'work', entitlementType: 'age_gate', minimumAge: 18 }] }),
      );
      expect(shell.ageGateVisible).toBeTrue();
      expect(syncPanel).toHaveBeenCalled();
      for (const call of syncPanel.calls.allArgs()) {
        expect(call[1]).withContext('no panel audio under the gate').toBeUndefined();
      }

      syncPanel.calls.reset();
      await shell.onAgeGateVerify(verified);
      await settle();
      const last = syncPanel.calls.mostRecent().args;
      expect(last[0]).toBe('p1');
      expect(last[1]).toEqual(jasmine.objectContaining({ audio: audioPanel.audio }));
    });

    it('plays the panel audio of an ungated panel as before', async () => {
      await start(withAudio());
      const last = syncPanel.calls.mostRecent().args;
      expect(last[0]).toBe('p1');
      expect(last[1]).toEqual(jasmine.objectContaining({ audio: audioPanel.audio }));
    });
  });
});
