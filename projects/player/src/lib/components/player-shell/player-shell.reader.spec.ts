/**
 * PlayerShellComponent reading features against REAL manifest / flow /
 * variable / paywall services: page format per screen, page view jumps from
 * thumbnails, the cover, chapter crossing, author autoplay timing and the
 * preload look-ahead. The template is overridden — these tests drive the
 * component class.
 */

import { TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
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
import { PreloadService } from '../../services/preload.service';
import type { PanelWaveManifest } from '../../types';

const placements = (ids: string[]) => ids.map((panelId, i) => ({ panelId, x: i * 0.5, y: 0, w: 0.5, h: 1 }));
const page = (id: string, format: string, ids: string[]) => ({
  id,
  readingOrder: ids,
  layout: { format, placements: placements(ids) },
});
const art = (assetId: string) => ({ layers: [{ id: `l-${assetId}`, kind: 'image', z: 0, assetId }] });

/**
 * Two chapters (c1: p1 → p2 → p3, c2: q1 → q2). Desktop pages hold one or two
 * panels, big-screen pages a whole chapter; the cover comes as the CMS
 * exports it (extras.cover with a direct url, meta.cover not in the catalog).
 */
const buildManifest = (): PanelWaveManifest =>
  ({
    panelwave: { version: '1.7.0', schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json' },
    meta: { id: 'work-reader', title: { 'en-US': 'Reader' }, locales: ['en-US'], default_locale: 'en-US', cover: 'sha256-missing' },
    assets: {
      catalog: ['a1', 'a2', 'a3', 'b1', 'b2'].map((id) => ({
        id,
        category: 'image',
        variants: [
          { src: `https://cdn/${id}-1920.webp`, w: 1920, h: 1080 },
          { src: `https://cdn/${id}-400.webp`, w: 400, h: 225 },
        ],
      })),
    },
    extras: { cover: { id: 'cov', contentType: 'image', url: 'https://cdn/cover.jpg' } },
    chapters: [
      {
        id: 'c1',
        title: { 'en-US': 'One' },
        panels: { p1: { ...art('a1'), durationMs: 1200 }, p2: { ...art('a2'), durationMs: 800 }, p3: art('a3') },
        graph: { entry: 'p1', edges: [{ from: 'p1', to: 'p2' }, { from: 'p2', to: 'p3' }] },
        pages: [
          page('D1', 'desktop-landscape', ['p1', 'p2']),
          page('D2', 'desktop-landscape', ['p3']),
          page('B1', 'bigscreen-landscape', ['p1', 'p2', 'p3']),
        ],
      },
      {
        id: 'c2',
        title: { 'en-US': 'Two' },
        panels: { q1: { ...art('b1'), durationMs: 2000 }, q2: art('b2') },
        graph: { entry: 'q1', edges: [{ from: 'q1', to: 'q2' }] },
        pages: [page('D3', 'desktop-landscape', ['q1', 'q2']), page('B2', 'bigscreen-landscape', ['q1', 'q2'])],
      },
    ],
  }) as unknown as PanelWaveManifest;

describe('PlayerShellComponent reading features (real services)', () => {
  let shell: PlayerShellComponent;
  let screen: { w: number; h: number; dpr: number };

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
      currentDwellMs(): number;
      autoplayDuration: number;
      startAutoplay(): void;
      stopAutoplay(): void;
    };

  const toPageView = (): void => {
    shell.onToggleView();
    expect(shell.viewMode).toBe('page');
  };

  beforeEach(() => {
    screen = { w: 1920, h: 1080, dpr: 1 };
    spyOnProperty(window, 'innerWidth', 'get').and.callFake(() => screen.w);
    spyOnProperty(window, 'innerHeight', 'get').and.callFake(() => screen.h);
    spyOnProperty(window, 'devicePixelRatio', 'get').and.callFake(() => screen.dpr);
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
    // Most cases start in panel view and switch on purpose; the default
    // start (cover, then page view) has its own describe below.
    shell.initialViewMode = 'panel';
  });

  afterEach(() => {
    shell.autoplayEnabled = false;
    shell.ngOnDestroy();
  });

  describe('page format per screen', () => {
    it('shows the big-screen pages on a 4K screen (150 % scaling)', async () => {
      screen = { w: 2560, h: 1440, dpr: 1.5 };
      await init();
      shell.hideCover();
      toPageView();
      expect(shell.activePageFormat).toBe('bigscreen-landscape');
      expect(shell.currentPage?.id).toBe('B1');
    });

    it('shows the desktop pages on a desktop screen', async () => {
      await init();
      shell.hideCover();
      toPageView();
      expect(shell.activePageFormat).toBe('desktop-landscape');
      expect(shell.currentPage?.id).toBe('D1');
      expect(shell.chapterPages(shell.currentChapter).map((p) => p.id)).toEqual(['D1', 'D2']);
    });

    it('switches the page sequence when the window changes size', async () => {
      await init();
      shell.hideCover();
      await shell.navigateToPanel('c1', 'p3');
      toPageView();
      expect(shell.currentPage?.id).toBe('D2');

      screen = { w: 3840, h: 2160, dpr: 1 };
      shell.onWindowResize();
      expect(shell.currentPage?.id).toBe('B1');
    });

    it('honors the host pageFormat input', async () => {
      shell.pageFormat = 'bigscreen-landscape';
      await init();
      expect(shell.activePageFormat).toBe('bigscreen-landscape');
      shell.pageFormat = 'auto';
      shell.ngOnChanges({ pageFormat: new SimpleChange('bigscreen-landscape', 'auto', false) });
      expect(shell.activePageFormat).toBe('desktop-landscape');
    });
  });

  describe('page view navigation', () => {
    it('a thumbnail opens the page that shows the panel', async () => {
      await init();
      shell.hideCover();
      toPageView();
      expect(shell.currentPage?.id).toBe('D1');

      shell.onThumbnailNavigate({ chapterId: 'c1', panelId: 'p3' });
      await flush();
      expect(shell.currentPage?.id).toBe('D2');

      shell.onThumbnailNavigate({ chapterId: 'c2', panelId: 'q2' });
      await flush();
      expect(shell.currentChapter?.id).toBe('c2');
      expect(shell.currentPage?.id).toBe('D3');
    });

    it('a TOC entry opens the page that shows the panel', async () => {
      await init();
      shell.hideCover();
      toPageView();
      shell.onTocNavigate({ chapterId: 'c1', panelId: 'p3' });
      await flush();
      expect(shell.currentPage?.id).toBe('D2');
    });

    it('turns from the last page of a chapter to the next chapter and back', async () => {
      await init();
      shell.hideCover();
      toPageView();
      await shell.navigateToNextPage();
      expect(shell.currentPage?.id).toBe('D2');
      await shell.navigateToNextPage();
      expect(shell.currentChapter?.id).toBe('c2');
      expect(shell.currentPage?.id).toBe('D3');
      await shell.navigateToPreviousPage();
      expect(shell.currentChapter?.id).toBe('c1');
      expect(shell.currentPage?.id).toBe('D2');
    });
  });

  describe('cover', () => {
    it('opens on the cover (CMS extras.cover link) when reading starts at the beginning', async () => {
      await init();
      expect(shell.coverUrl).toBe('https://cdn/cover.jpg');
      expect(shell.coverThumbUrl).toBe('https://cdn/cover.jpg');
      expect(shell.coverVisible).toBeTrue();
      expect(shell.getCurrentPanelId()).toBe('p1');
    });

    it('next leaves the cover for the first panel; previous on the first panel returns to it', async () => {
      await init();
      await shell.navigateNext();
      expect(shell.coverVisible).toBeFalse();
      expect(shell.getCurrentPanelId()).toBe('p1');
      await shell.navigatePrevious();
      expect(shell.coverVisible).toBeTrue();
    });

    it('page view: the cover comes before the first page', async () => {
      await init();
      toPageView();
      await shell.navigateToNextPage();
      expect(shell.coverVisible).toBeFalse();
      expect(shell.currentPage?.id).toBe('D1');
      await shell.navigateToPreviousPage();
      expect(shell.coverVisible).toBeTrue();
    });

    it('the thumbnail strip / TOC cover entry shows it; a panel jump hides it', async () => {
      await init();
      shell.hideCover();
      await shell.navigateToPanel('c2', 'q1');
      shell.onThumbnailNavigate({ chapterId: '', panelId: '', cover: true });
      expect(shell.coverVisible).toBeTrue();
      shell.onTocNavigate({ chapterId: 'c1', panelId: 'p2' });
      await flush();
      expect(shell.coverVisible).toBeFalse();
      shell.onTocNavigate({ chapterId: '', cover: true });
      expect(shell.coverVisible).toBeTrue();
    });

    it('warms the first panel’s artwork while the cover is shown', async () => {
      const add = spyOn(TestBed.inject(PreloadService), 'add');
      await init();
      expect(shell.coverVisible).toBeTrue();
      expect(add.calls.allArgs().map(([item]) => item.url)).toContain('https://cdn/a1-1920.webp');
    });

    it('shows the cover’s own seconds in the autoplay controls', async () => {
      await init();
      expect(shell.autoplaySecondsDisplay).toBe(5);
      shell.hideCover();
      expect(shell.autoplaySecondsDisplay).toBe(1.2);
    });

    it('is skipped for a host start position and with showCover off', async () => {
      shell.initialChapterId = 'c1';
      shell.initialPanelId = 'p2';
      await init();
      expect(shell.coverVisible).toBeFalse();

      shell.initialChapterId = shell.initialPanelId = undefined;
      shell.showCover = false;
      shell.manifest = buildManifest();
      await shell.reload();
      expect(shell.coverVisible).toBeFalse();
    });
  });

  describe('start: cover, then page view', () => {
    beforeEach(() => {
      shell.initialViewMode = undefined;
    });

    it('opens on the cover with the first page behind it', async () => {
      await init();
      expect(shell.coverVisible).toBeTrue();
      expect(shell.viewMode).toBe('page');
      expect(shell.currentPage?.id).toBe('D1');
      expect(shell.currentLocation.view).toBe('cover');
      shell.hideCover();
      expect(shell.currentLocation).toEqual({ view: 'page', chapterId: 'c1', panelId: 'p1', pageId: 'D1' });
    });

    it('resumes a bookmark behind the cover, on its page', async () => {
      localStorage.setItem('pw-social', JSON.stringify({ 'work-reader': { bookmark: { chapterId: 'c2', panelId: 'q2' } } }));
      await init();
      expect(shell.coverVisible).toBeTrue();
      expect(shell.currentPage?.id).toBe('D3');
    });

    it('a page link opens that page, without the cover', async () => {
      shell.initialPageId = 'D2';
      await init();
      expect(shell.coverVisible).toBeFalse();
      expect(shell.viewMode).toBe('page');
      expect(shell.currentPage?.id).toBe('D2');
    });

    it('a page link of another format opens the page showing the same panels', async () => {
      shell.initialPageId = 'B2'; // a big-screen page, read on a desktop screen
      await init();
      expect(shell.currentPage?.id).toBe('D3');
    });

    it('a panel link opens the panel in panel view (chapter looked up)', async () => {
      shell.initialPanelId = 'q2';
      await init();
      expect(shell.coverVisible).toBeFalse();
      expect(shell.viewMode).toBe('panel');
      expect(shell.currentChapter?.id).toBe('c2');
      expect(shell.currentLocation).toEqual({ view: 'panel', chapterId: 'c2', panelId: 'q2' });
    });

    it('an unknown link falls back to the cover', async () => {
      shell.initialPageId = 'nope';
      await init();
      expect(shell.coverVisible).toBeTrue();
      expect(shell.viewMode).toBe('page');
    });
  });

  describe('share link', () => {
    beforeEach(() => {
      shell.initialViewMode = undefined;
    });

    it('links the current page in page view and the panel in panel view', async () => {
      await init();
      shell.hideCover();
      shell.onShare();
      const pageLink = new URL(shell.shareLink);
      expect(pageLink.searchParams.get('page')).toBe('D1');
      expect(pageLink.searchParams.get('panel')).toBeNull();

      shell.onToggleView(); // page -> panel
      shell.onShare();
      const panelLink = new URL(shell.shareLink);
      expect(panelLink.searchParams.get('panel')).toBe('p1');
      expect(panelLink.searchParams.get('page')).toBeNull();
    });

    it('uses the host share URL when given', async () => {
      shell.shareUrl = 'https://example.org/work';
      await init();
      shell.onShare();
      expect(shell.shareLink).toBe('https://example.org/work');
    });
  });

  describe('autoplay timing', () => {
    it("plays each panel for its authored durationMs (CMS timeline), else secondsPerPanel", async () => {
      await init();
      shell.hideCover();
      expect(shell.autoplayTiming).toBe('author');
      expect(priv().currentDwellMs()).toBe(1200);
      await shell.navigateToPanel('c1', 'p3'); // no durationMs
      expect(priv().currentDwellMs()).toBe(5000);
    });

    it('page view sums the authored times of the page’s panels', async () => {
      await init();
      shell.hideCover();
      toPageView();
      expect(priv().currentDwellMs()).toBe(2000); // 1200 + 800
    });

    it('a speed the reader picks replaces the author timing until they switch back', async () => {
      await init();
      shell.hideCover();
      shell.onSecondsPerPanelChange(3);
      expect(shell.autoplayTiming).toBe('manual');
      expect(priv().currentDwellMs()).toBe(3000);
      expect(shell.autoplaySecondsDisplay).toBe(3);

      shell.onAutoplayTimingChange('author');
      expect(priv().currentDwellMs()).toBe(1200);
      expect(shell.autoplaySecondsDisplay).toBe(1.2);
    });

    it('arms the timer with the authored time', async () => {
      await init();
      shell.hideCover();
      shell.autoplayEnabled = true;
      priv().startAutoplay();
      expect(priv().autoplayDuration).toBe(1200);
      priv().stopAutoplay();
    });

    it('stops at the end of the work', async () => {
      await init();
      shell.hideCover();
      await shell.navigateToPanel('c2', 'q2');
      shell.autoplayEnabled = true;
      await (shell as unknown as { autoplayAdvance(): Promise<void> }).autoplayAdvance();
      expect(shell.autoplayEnabled).toBeFalse();
    });
  });

  describe('chapter crossing', () => {
    it('next on a chapter’s last panel continues with the next chapter', async () => {
      await init();
      shell.hideCover();
      await shell.navigateToPanel('c1', 'p3');
      await shell.navigateNext();
      expect(shell.currentChapter?.id).toBe('c2');
      expect(shell.getCurrentPanelId()).toBe('q1');
    });
  });

  describe('preload look-ahead', () => {
    it('panel view: the next panels in reading order, into the next chapter', async () => {
      await init();
      shell.hideCover();
      await shell.navigateToPanel('c1', 'p2');
      expect(shell.preloadTargets.map((t) => t.panelId)).toEqual(['p3', 'q1', 'q2']);
    });

    it('page view: the panels of the next pages, each with its share of the page width', async () => {
      await init();
      shell.hideCover();
      toPageView();
      expect(shell.preloadTargets.map((t) => t.panelId)).toEqual(['p3', 'q1', 'q2']);
      expect(shell.preloadTargets.every((t) => t.widthFraction === 0.5)).toBeTrue();
    });
  });
});
