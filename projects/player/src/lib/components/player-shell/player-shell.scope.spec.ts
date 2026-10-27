/**
 * PlayerShellComponent chapter embeds (docs/MULTI_CHAPTER_EMBED.md, P1):
 * `chapterScope` keeps reading inside one chapter, `chapterComplete` reports
 * its end, and `pauseAutoplayWhenHidden` suspends autoplay off screen. Real
 * manifest / flow / variable / paywall services; the template is overridden.
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
import { ImageCacheService } from '../../services/image-cache.service';
import type {
  PanelWaveManifest,
  PlayerChapterCompleteEvent,
  PlayerNavigationAttempt,
} from '../../types';

const placements = (ids: string[]) => ids.map((panelId, i) => ({ panelId, x: i * 0.5, y: 0, w: 0.5, h: 1 }));
const page = (id: string, ids: string[]) => ({
  id,
  readingOrder: ids,
  layout: { format: 'desktop-landscape', placements: placements(ids) },
});
const art = (assetId: string) => ({ layers: [{ id: `l-${assetId}`, kind: 'image', z: 0, assetId }] });

/**
 * Three chapters: c1 (p1 → p2), c2 (q1 → q2 → q3, plus a cross-chapter edge
 * q2 → r1 that is the only way out of q2 when `jump` is set), c3 (r1 → r2).
 * c2 carries a CMS uuid in `chapterId`.
 */
const buildManifest = (): PanelWaveManifest =>
  ({
    panelwave: { version: '1.9.0', schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json' },
    meta: { id: 'work-scope', title: { 'en-US': 'Scope' }, locales: ['en-US'], default_locale: 'en-US' },
    assets: {
      catalog: ['a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'c2'].map((id) => ({
        id,
        category: 'image',
        variants: [{ src: `https://cdn/${id}.webp`, w: 1920, h: 1080 }],
      })),
    },
    extras: { cover: { id: 'cov', contentType: 'image', url: 'https://cdn/cover.jpg' } },
    chapters: [
      {
        id: 'c1',
        panels: { p1: art('a1'), p2: art('a2') },
        graph: { entry: 'p1', edges: [{ from: 'p1', to: 'p2' }] },
        pages: [page('D1', ['p1', 'p2'])],
      },
      {
        id: 'c2',
        chapterId: '7c1e0000-0000-4000-8000-000000000002',
        panels: { q1: art('b1'), q2: art('b2'), q3: art('b3') },
        graph: { entry: 'q1', edges: [{ from: 'q1', to: 'q2' }, { from: 'q2', to: 'q3' }] },
        pages: [page('D2', ['q1', 'q2']), page('D3', ['q3'])],
      },
      {
        id: 'c3',
        panels: { r1: art('c1'), r2: art('c2') },
        graph: { entry: 'r1', edges: [{ from: 'r1', to: 'r2' }] },
        pages: [page('D4', ['r1', 'r2'])],
      },
    ],
  }) as unknown as PanelWaveManifest;

describe('PlayerShellComponent chapter scope (real services)', () => {
  let shell: PlayerShellComponent;
  let attempts: PlayerNavigationAttempt[];
  let completions: PlayerChapterCompleteEvent[];
  let chapterChanges: string[];
  let errors: Error[];

  const flush = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve));
    await new Promise((resolve) => setTimeout(resolve));
  };

  const init = async (): Promise<void> => {
    shell.ngOnInit();
    await flush();
  };

  const priv = () =>
    shell as unknown as {
      autoplayTimer?: unknown;
      autoplayAdvance(): Promise<void>;
      hostIntersecting: boolean;
      updateOnScreen(): void;
      onVideoQueueComplete(): void;
      pendingQueueAdvance: boolean;
    };

  beforeEach(() => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1920);
    spyOnProperty(window, 'innerHeight', 'get').and.returnValue(1080);
    localStorage.removeItem('pw-social');
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
    shell.manifest = buildManifest();
    shell.initialViewMode = 'panel';
    shell.showCover = false;
    attempts = [];
    completions = [];
    chapterChanges = [];
    errors = [];
    shell.navigationAttempt.subscribe((a) => attempts.push(a));
    shell.chapterComplete.subscribe((c) => completions.push(c));
    shell.chapterChange.subscribe((c) => chapterChanges.push(c.id));
    shell.error.subscribe((e) => errors.push(e));
  });

  afterEach(() => {
    shell.autoplayEnabled = false;
    shell.ngOnDestroy();
    localStorage.removeItem('pw-social');
  });

  describe('start position', () => {
    it('starts at the entry of the scoped chapter (by manifest id)', async () => {
      shell.chapterScope = 'c2';
      await init();
      expect(shell.currentChapter?.id).toBe('c2');
      expect(shell.getCurrentPanelId()).toBe('q1');
      expect(shell.scopedChapterId).toBe('c2');
    });

    it('accepts the CMS chapter uuid', async () => {
      shell.chapterScope = '7c1e0000-0000-4000-8000-000000000002';
      await init();
      expect(shell.currentChapter?.id).toBe('c2');
      expect(shell.scopedChapterId).toBe('c2');
    });

    it('fails with an error for an unknown chapter', async () => {
      shell.chapterScope = 'nope';
      let ready = false;
      shell.ready.subscribe(() => (ready = true));
      await init();
      expect(ready).toBeFalse();
      expect(errors.map((e) => e.message)).toContain('chapterScope not found: nope');
    });

    it('ignores a panel link outside the scope', async () => {
      shell.chapterScope = 'c2';
      shell.initialPanelId = 'r2';
      await init();
      expect(shell.getCurrentPanelId()).toBe('q1');
    });

    it('keeps a panel link inside the scope', async () => {
      shell.chapterScope = 'c2';
      shell.initialPanelId = 'q2';
      await init();
      expect(shell.getCurrentPanelId()).toBe('q2');
    });

    it('resumes a bookmark only inside the scope', async () => {
      localStorage.setItem('pw-social', JSON.stringify({ 'work-scope': { bookmark: { chapterId: 'c3', panelId: 'r2' } } }));
      shell.chapterScope = 'c2';
      await init();
      expect(shell.getCurrentPanelId()).toBe('q1');
    });

    it('resumes a bookmark in the scoped chapter', async () => {
      localStorage.setItem('pw-social', JSON.stringify({ 'work-scope': { bookmark: { chapterId: 'c2', panelId: 'q3' } } }));
      shell.chapterScope = 'c2';
      await init();
      expect(shell.getCurrentPanelId()).toBe('q3');
    });

    it('shows the cover only when asked to', async () => {
      shell.chapterScope = 'c2';
      shell.showCover = true;
      await init();
      expect(shell.coverVisible).toBeTrue();
    });
  });

  describe('navigation (panel view)', () => {
    beforeEach(async () => {
      shell.chapterScope = 'c2';
      await init();
    });

    it('stops at the end of the chapter', async () => {
      await shell.navigateNext();
      await shell.navigateNext();
      expect(shell.getCurrentPanelId()).toBe('q3');
      chapterChanges = [];
      await shell.navigateNext();
      expect(shell.currentChapter?.id).toBe('c2');
      expect(shell.getCurrentPanelId()).toBe('q3');
      expect(chapterChanges).toEqual([]);
    });

    it('stays on the first panel going back, without a cover', async () => {
      await shell.navigatePrevious();
      expect(shell.getCurrentPanelId()).toBe('q1');
      expect(shell.coverVisible).toBeFalse();
      shell.showCoverPage();
      expect(shell.coverVisible).toBeFalse();
    });

    it('refuses a jump into another chapter', async () => {
      await shell.navigateToPanel('c3', 'r1');
      expect(shell.getCurrentPanelId()).toBe('q1');
      expect(attempts).toContain(jasmine.objectContaining({ direction: 'panel', target: 'r1', blocked: 'outside-scope' }));
    });

    it('refuses a jump that names the wrong chapter for a panel elsewhere', async () => {
      // A hotspot goTo passes the current chapter; the panel's own chapter wins.
      await shell.navigateToPanel('c2', 'p2');
      expect(shell.currentChapter?.id).toBe('c2');
      expect(shell.getCurrentPanelId()).toBe('q1');
    });

    it('refuses a chapter jump', async () => {
      await shell.navigateToChapter('c1');
      expect(shell.currentChapter?.id).toBe('c2');
      expect(attempts).toContain(jasmine.objectContaining({ target: 'c1', blocked: 'outside-scope' }));
    });

    it('lists only the scoped chapter and no cover entry', () => {
      expect(shell.listedChapters.map((c) => c.id)).toEqual(['c2']);
      expect(shell.coverEntryThumbUrl).toBe('');
    });

    it('never preloads the next chapter', async () => {
      await shell.navigateNext();
      await shell.navigateNext();
      expect(shell.preloadTargets).toEqual([]);
    });

    it('stops autoplay at the end of the chapter', async () => {
      await shell.navigateNext();
      await shell.navigateNext();
      shell.autoplayEnabled = true;
      await priv().autoplayAdvance();
      expect(shell.autoplayEnabled).toBeFalse();
      expect(shell.currentChapter?.id).toBe('c2');
    });
  });

  describe('navigation (page view)', () => {
    beforeEach(async () => {
      shell.chapterScope = 'c2';
      shell.initialViewMode = 'page';
      await init();
      expect(shell.viewMode).toBe('page');
    });

    it('stops at the last page of the chapter', async () => {
      await shell.navigateToNextPage();
      expect(shell.currentPage?.id).toBe('D3');
      await shell.navigateToNextPage();
      expect(shell.currentPage?.id).toBe('D3');
      expect(shell.currentChapter?.id).toBe('c2');
    });

    it('stays on the first page going back', async () => {
      await shell.navigateToPreviousPage();
      expect(shell.currentPage?.id).toBe('D2');
      expect(shell.currentChapter?.id).toBe('c2');
    });

    it('reports the chapter complete on its last page', async () => {
      expect(completions).toEqual([]);
      await shell.navigateToNextPage();
      expect(completions).toEqual([{ chapterId: 'c2', panelId: 'q3', isLastChapter: false }]);
    });
  });

  describe('chapterComplete', () => {
    it('fires once on the end panel, with isLastChapter', async () => {
      shell.chapterScope = 'c3';
      await init();
      expect(completions).toEqual([]);
      await shell.navigateNext();
      expect(completions).toEqual([{ chapterId: 'c3', panelId: 'r2', isLastChapter: true }]);
      await shell.navigatePrevious();
      await shell.navigateNext();
      expect(completions.length).toBe(1);
    });

    it('fires per chapter visit without a scope', async () => {
      await init();
      await shell.navigateNext(); // p2: end of c1
      expect(completions).toEqual([{ chapterId: 'c1', panelId: 'p2', isLastChapter: false }]);
      await shell.navigateNext(); // into c2
      expect(shell.currentChapter?.id).toBe('c2');
      expect(completions.length).toBe(1);
    });
  });

  describe('imageCacheBudgetMb', () => {
    it('sets the image cache budget', async () => {
      const cache = TestBed.inject(ImageCacheService);
      const spy = spyOn(cache, 'setMemoryBudget');
      shell.imageCacheBudgetMb = 32;
      await init();
      expect(spy).toHaveBeenCalledWith(32 * 1024 * 1024);
    });
  });

  describe('pauseAutoplayWhenHidden', () => {
    beforeEach(async () => {
      shell.chapterScope = 'c2';
      await init();
    });

    const goOffScreen = (): void => {
      priv().hostIntersecting = false;
      priv().updateOnScreen();
    };
    const comeBack = (): void => {
      priv().hostIntersecting = true;
      priv().updateOnScreen();
    };

    it('suspends the timer off screen and re-arms it on return', () => {
      shell.onToggleAutoplay();
      expect(priv().autoplayTimer).toBeDefined();
      expect(shell.autoplayRunning).toBeTrue();
      goOffScreen();
      expect(priv().autoplayTimer).toBeUndefined();
      expect(shell.autoplayEnabled).toBeTrue();
      expect(shell.autoplayRunning).toBeFalse();
      comeBack();
      expect(priv().autoplayTimer).toBeDefined();
      expect(shell.autoplayRunning).toBeTrue();
    });

    it('does not start the timer while off screen', () => {
      goOffScreen();
      shell.onToggleAutoplay();
      expect(shell.autoplayEnabled).toBeTrue();
      expect(priv().autoplayTimer).toBeUndefined();
      comeBack();
      expect(priv().autoplayTimer).toBeDefined();
    });

    it('suspends while the tab is hidden', () => {
      shell.onToggleAutoplay();
      const state = spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden');
      priv().updateOnScreen();
      expect(priv().autoplayTimer).toBeUndefined();
      state.and.returnValue('visible');
      priv().updateOnScreen();
      expect(priv().autoplayTimer).toBeDefined();
    });

    it('keeps running when switched off', () => {
      shell.pauseAutoplayWhenHidden = false;
      shell.onToggleAutoplay();
      goOffScreen();
      expect(priv().autoplayTimer).toBeDefined();
    });

    it('holds a page turn finished off screen until the player is back', async () => {
      shell.onToggleView();
      expect(shell.viewMode).toBe('page');
      shell.onToggleAutoplay();
      goOffScreen();
      priv().onVideoQueueComplete();
      expect(priv().pendingQueueAdvance).toBeTrue();
      expect(shell.currentPage?.id).toBe('D2');
      comeBack();
      await flush();
      expect(shell.currentPage?.id).toBe('D3');
    });
  });
});
