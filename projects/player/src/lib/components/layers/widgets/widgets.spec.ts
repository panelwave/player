/**
 * Content widget layer components (schema 1.10+): download, audio player,
 * video trigger, scroll text, iframe.
 */
import { type Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ManifestService } from '../../../services/manifest.service';
import { AudioEngineService } from '../../../services/audio-engine.service';
import { WidgetPlaybackService, type WidgetEvent } from '../../../services/widget-playback.service';
import type { AssetCatalogItem, PanelWaveManifest } from '../../../types';
import { DownloadLayerComponent } from './download-layer/download-layer.component';
import { AudioPlayerLayerComponent, resamplePeaks } from './audio-player-layer/audio-player-layer.component';
import { VideoPlayerLayerComponent } from './video-player-layer/video-player-layer.component';
import { ScrollTextLayerComponent } from './scroll-text-layer/scroll-text-layer.component';
import { IframeLayerComponent } from './iframe-layer/iframe-layer.component';

const CATALOG: Record<string, AssetCatalogItem> = {
  'file-1': {
    id: 'file-1',
    category: 'file',
    variants: [{ src: 'https://cdn.example.org/files/worksheet-3.pdf', mime: 'application/pdf', sizeBytes: 482133, fileName: 'Worksheet 3.pdf' }],
  },
  'aud-1': {
    id: 'aud-1',
    category: 'audio',
    durationMs: 120000,
    waveform: Array.from({ length: 50 }, (_, i) => (i % 10) / 10),
    variants: [{ src: 'https://cdn.example.org/a.m4a' }],
  },
  'aud-2': { id: 'aud-2', category: 'audio', durationMs: 60000, variants: [{ src: 'https://cdn.example.org/b.mp3' }] },
  'vid-1': {
    id: 'vid-1',
    category: 'video',
    durationMs: 312000,
    variants: [{ src: 'https://cdn.example.org/v.mp4', w: 1280, h: 720 }],
    poster: { src: 'https://cdn.example.org/poster.webp' },
  },
  'img-1': { id: 'img-1', category: 'image', variants: [{ src: 'x.webp', w: 10, h: 10 }] },
};

let manifest: Partial<PanelWaveManifest> = {};

function setup<T>(component: Type<T>): {
  fixture: ComponentFixture<T>;
  playback: WidgetPlaybackService;
  events: WidgetEvent[];
} {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [provideHttpClient(), provideHttpClientTesting(), WidgetPlaybackService],
  });
  const ms = TestBed.inject(ManifestService);
  spyOn(ms, 'getAsset').and.callFake((id: string) => CATALOG[id] ?? null);
  spyOn(ms, 'getManifest').and.callFake(() => manifest as PanelWaveManifest);
  const playback = TestBed.inject(WidgetPlaybackService);
  const events: WidgetEvent[] = [];
  playback.events$.subscribe((e) => events.push(e));
  const fixture = TestBed.createComponent(component);
  return { fixture, playback, events };
}

const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;

describe('content widgets', () => {
  beforeEach(() => {
    manifest = {};
    document.documentElement.classList.remove('pw-print');
  });

  // ---------------------------------------------------------------------------
  describe('DownloadLayerComponent', () => {
    it('shows icon, name and size and links to the file', () => {
      const { fixture } = setup(DownloadLayerComponent);
      fixture.componentRef.setInput('layer', { kind: 'download', id: 'd1', assetId: 'file-1', width: 400, height: 96 });
      fixture.detectChanges();
      const a = el(fixture).querySelector('a') as HTMLAnchorElement;
      expect(a.getAttribute('href')).toBe('https://cdn.example.org/files/worksheet-3.pdf');
      expect(a.getAttribute('download')).toBe('Worksheet 3.pdf');
      expect(a.getAttribute('rel')).toBe('noopener');
      expect(el(fixture).querySelector('.name')?.textContent).toContain('Worksheet 3.pdf');
      expect(el(fixture).querySelector('.size')?.textContent).toContain('471 KB');
      expect(el(fixture).querySelector('.badge-label')?.textContent).toContain('PDF');
      expect(a.getAttribute('aria-label')).toBe('Download Worksheet 3.pdf, 471 KB');
    });

    it('uses the localized fileName and description; hides size and icon on request', () => {
      const { fixture } = setup(DownloadLayerComponent);
      fixture.componentRef.setInput('layer', {
        kind: 'download',
        id: 'd1',
        assetId: 'file-1',
        width: 400,
        height: 96,
        fileName: { 'en-US': 'Worksheet 3.pdf', 'de-DE': 'Arbeitsblatt 3.pdf' },
        description: { 'de-DE': 'Ausdrucken' },
        showSize: false,
        showIcon: false,
      });
      fixture.componentRef.setInput('locale', 'de-DE');
      fixture.detectChanges();
      expect(el(fixture).querySelector('.name')?.textContent).toContain('Arbeitsblatt 3.pdf');
      expect(el(fixture).querySelector('a')?.getAttribute('download')).toBe('Arbeitsblatt 3.pdf');
      expect(el(fixture).querySelector('.description')?.textContent).toContain('Ausdrucken');
      expect(el(fixture).querySelector('.size')).toBeNull();
      expect(el(fixture).querySelector('.file-icon')).toBeNull();
    });

    it('emits a download event on click', () => {
      const { fixture, events } = setup(DownloadLayerComponent);
      fixture.componentRef.setInput('layer', { kind: 'download', id: 'd1', assetId: 'file-1', width: 400, height: 96 });
      fixture.componentRef.setInput('panelId', 'p1');
      fixture.detectChanges();
      const a = el(fixture).querySelector('a') as HTMLAnchorElement;
      a.addEventListener('click', (e) => e.preventDefault());
      a.click();
      expect(events).toEqual([{ type: 'download', layerId: 'd1', kind: 'download', panelId: 'p1', assetId: 'file-1' }]);
    });

    it('renders an unavailable card without a link when the asset is missing or not a file', () => {
      const { fixture, events } = setup(DownloadLayerComponent);
      fixture.componentRef.setInput('layer', { kind: 'download', id: 'd1', assetId: 'img-1', width: 400, height: 96 });
      fixture.detectChanges();
      const a = el(fixture).querySelector('a') as HTMLAnchorElement;
      expect(a.hasAttribute('href')).toBeFalse();
      expect(a.getAttribute('aria-disabled')).toBe('true');
      a.click();
      expect(events.length).toBe(0);
    });

    it('applies plain appearance and per-layer colour overrides', () => {
      const { fixture } = setup(DownloadLayerComponent);
      fixture.componentRef.setInput('layer', {
        kind: 'download',
        id: 'd1',
        assetId: 'file-1',
        width: 400,
        height: 96,
        appearance: 'plain',
        themeOverrides: { accent: '#e11d48', surface: 'nope' },
      });
      fixture.detectChanges();
      const a = el(fixture).querySelector('a') as HTMLAnchorElement;
      expect(a.classList.contains('plain')).toBeTrue();
      expect(a.style.getPropertyValue('--pw-theme-accent')).toBe('#e11d48');
      expect(a.style.getPropertyValue('--pw-theme-surface')).toBe('');
    });

    it('is a static card in a print render', () => {
      document.documentElement.classList.add('pw-print');
      const { fixture } = setup(DownloadLayerComponent);
      fixture.componentRef.setInput('layer', { kind: 'download', id: 'd1', assetId: 'file-1', width: 400, height: 96 });
      fixture.detectChanges();
      expect(el(fixture).querySelector('a')?.hasAttribute('href')).toBeFalse();
      expect(el(fixture).querySelector('.action')).toBeNull();
      document.documentElement.classList.remove('pw-print');
    });
  });

  // ---------------------------------------------------------------------------
  describe('AudioPlayerLayerComponent', () => {
    let engine: AudioEngineService;

    function make(layer: Record<string, unknown> = {}) {
      const ctx = setup(AudioPlayerLayerComponent);
      engine = TestBed.inject(AudioEngineService);
      spyOn(engine, 'setRoleDuck');
      ctx.fixture.componentRef.setInput('layer', { kind: 'audioPlayer', id: 'a1', assetId: 'aud-1', width: 500, height: 140, ...layer });
      ctx.fixture.componentRef.setInput('panelId', 'p1');
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders title, play button, waveform canvas and the duration from the catalog', () => {
      const { fixture } = make({ title: { 'en-US': 'Interview' } });
      expect(el(fixture).querySelector('.title')?.textContent).toContain('Interview');
      expect(el(fixture).querySelector('button.play')?.getAttribute('aria-label')).toBe('Play: Interview');
      expect(el(fixture).querySelector('canvas.wave')).not.toBeNull();
      expect(el(fixture).querySelector('.time')?.textContent).toContain('0:00 / 2:00');
      const slider = el(fixture).querySelector('[role="slider"]') as HTMLElement;
      expect(slider.getAttribute('aria-valuemax')).toBe('120');
    });

    it('falls back to a progress bar without peaks', () => {
      const a = make({ assetId: 'aud-2' });
      expect(el(a.fixture).querySelector('canvas')).toBeNull();
      expect(el(a.fixture).querySelector('.bar')).not.toBeNull();
    });

    it('plays on click and ducks music + ambient while playing, one at a time', async () => {
      const { fixture, playback, events } = make();
      const other = { id: 'other', pause: jasmine.createSpy('other') };
      playback.register(other);
      const audio = el(fixture).querySelector('audio') as HTMLAudioElement;
      spyOn(audio, 'play').and.callFake(() => {
        audio.dispatchEvent(new Event('play'));
        return Promise.resolve();
      });
      (el(fixture).querySelector('button.play') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(audio.play).toHaveBeenCalled();
      expect(other.pause).toHaveBeenCalled();
      expect(engine.setRoleDuck).toHaveBeenCalledWith('music', 0.2);
      expect(engine.setRoleDuck).toHaveBeenCalledWith('ambient', 0.2);
      expect(playback.isActive()).toBeTrue();
      expect(events.map((e) => e.type)).toContain('play');

      audio.dispatchEvent(new Event('pause'));
      expect(engine.setRoleDuck).toHaveBeenCalledWith('music', 1);
      expect(playback.isActive()).toBeFalse();
      expect(events.map((e) => e.type)).toContain('pause');
    });

    it('does not duck with duckMusic false', () => {
      const { fixture } = make({ duckMusic: false });
      el(fixture).querySelector('audio')!.dispatchEvent(new Event('play'));
      expect(engine.setRoleDuck).not.toHaveBeenCalled();
    });

    it('seeks with the keyboard (±5 s, PageUp 30 s, Home/End)', () => {
      const { fixture } = make();
      const comp = fixture.componentInstance;
      const slider = el(fixture).querySelector('[role="slider"]') as HTMLElement;
      const key = (k: string) => slider.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      key('ArrowRight');
      expect(comp.currentTime).toBe(5);
      key('PageUp');
      expect(comp.currentTime).toBe(35);
      key('ArrowLeft');
      expect(comp.currentTime).toBe(30);
      key('End');
      expect(comp.currentTime).toBe(120);
      key('Home');
      expect(comp.currentTime).toBe(0);
    });

    it('seeks to the pointer position on the track', () => {
      const { fixture } = make();
      const comp = fixture.componentInstance;
      const track = el(fixture).querySelector('.seek') as HTMLElement;
      spyOn(track, 'getBoundingClientRect').and.returnValue({ left: 100, width: 200, top: 0, height: 20, right: 300, bottom: 20, x: 100, y: 0, toJSON: () => ({}) });
      track.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, bubbles: true, pointerId: 1 }));
      expect(comp.currentTime).toBeCloseTo(30, 5);
      track.dispatchEvent(new PointerEvent('pointermove', { clientX: 250, bubbles: true, pointerId: 1 }));
      expect(comp.currentTime).toBeCloseTo(90, 5);
      track.dispatchEvent(new PointerEvent('pointerup', { clientX: 250, bubbles: true, pointerId: 1 }));
      track.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, bubbles: true, pointerId: 1 }));
      expect(comp.currentTime).toBeCloseTo(90, 5);
    });

    it('starts at startAtMs and pauses through the registry (panel change)', () => {
      const { fixture, playback } = make({ startAtMs: 10000 });
      expect(fixture.componentInstance.currentTime).toBe(10);
      spyOn(fixture.componentInstance, 'pause').and.callThrough();
      playback.pauseAll();
      expect(fixture.componentInstance.pause).toHaveBeenCalled();
    });

    it('follows the master mute', () => {
      const { fixture } = make();
      engine.setMasterMuted(true);
      expect((el(fixture).querySelector('audio') as HTMLAudioElement).muted).toBeTrue();
      engine.setMasterMuted(false);
    });

    it('resamplePeaks keeps the maximum of each bucket', () => {
      expect(resamplePeaks([0.1, 0.9, 0.2, 0.4], 2)).toEqual([0.9, 0.4]);
      expect(resamplePeaks([0.5], 3)).toEqual([0.5, 0.5, 0.5]);
      expect(resamplePeaks([], 3)).toEqual([]);
      expect(resamplePeaks([2, NaN], 1)).toEqual([1]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('VideoPlayerLayerComponent', () => {
    it('shows poster, title and duration and opens the modal on click', () => {
      const { fixture, playback } = setup(VideoPlayerLayerComponent);
      const requests: unknown[] = [];
      playback.videoRequests$.subscribe((r) => requests.push(r));
      const layer = { kind: 'videoPlayer', id: 'v1', assetId: 'vid-1', width: 480, height: 270, title: { 'en-US': 'Lecture' } };
      fixture.componentRef.setInput('layer', layer);
      fixture.componentRef.setInput('panelId', 'p1');
      fixture.detectChanges();
      expect(el(fixture).querySelector('img.poster')?.getAttribute('src')).toBe('https://cdn.example.org/poster.webp');
      expect(el(fixture).querySelector('.duration')?.textContent).toContain('5:12');
      const button = el(fixture).querySelector('button') as HTMLButtonElement;
      expect(button.getAttribute('aria-label')).toBe('Watch video: Lecture (5:12)');
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      button.click();
      expect(requests).toEqual([jasmine.objectContaining({ layer, panelId: 'p1', returnFocus: button })]);
    });

    it('renders a button trigger and is disabled without a video', () => {
      const { fixture } = setup(VideoPlayerLayerComponent);
      fixture.componentRef.setInput('layer', { kind: 'videoPlayer', id: 'v1', assetId: 'missing', trigger: 'button', width: 300, height: 60 });
      fixture.detectChanges();
      const button = el(fixture).querySelector('button.pw-video-button') as HTMLButtonElement;
      expect(button).not.toBeNull();
      expect(button.disabled).toBeTrue();
    });
  });

  // ---------------------------------------------------------------------------
  describe('ScrollTextLayerComponent', () => {
    it('renders markdown safely with a region label', () => {
      const { fixture } = setup(ScrollTextLayerComponent);
      fixture.componentRef.setInput('layer', {
        kind: 'scrollText',
        id: 's1',
        width: 400,
        height: 300,
        format: 'markdown',
        title: { 'en-US': 'Background' },
        text: { 'en-US': '## Meanders\n\nA **river** <script>x</script>' },
      });
      fixture.detectChanges();
      expect(el(fixture).querySelector('.content h2')?.textContent).toBe('Meanders');
      expect(el(fixture).querySelector('.content strong')?.textContent).toBe('river');
      expect(el(fixture).querySelector('.content script')).toBeNull();
      expect(el(fixture).querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Background');
      expect(el(fixture).querySelector('.heading')?.textContent).toContain('Background');
    });

    it('renders plain text paragraphs per locale', () => {
      const { fixture } = setup(ScrollTextLayerComponent);
      fixture.componentRef.setInput('layer', { kind: 'scrollText', id: 's1', width: 400, height: 300, text: { 'en-US': 'One', 'de-DE': 'Eins\n\nZwei' } });
      fixture.componentRef.setInput('locale', 'de-DE');
      fixture.detectChanges();
      expect(el(fixture).querySelectorAll('.content p').length).toBe(2);
    });

    it('applies the styleRef preset and inline style', () => {
      manifest = { settings: { typography: { textStyles: { body: { font: 'Source Serif 4', color: '#112233', sizePt: 21 } } } } } as unknown as PanelWaveManifest;
      const { fixture } = setup(ScrollTextLayerComponent);
      fixture.componentRef.setInput('layer', { kind: 'scrollText', id: 's1', width: 400, height: 300, styleRef: 'body', style: { color: '#445566' }, text: { 'en-US': 'x' } });
      fixture.detectChanges();
      const content = el(fixture).querySelector('.content') as HTMLElement;
      expect(content.style.fontFamily).toContain('Source Serif 4');
      expect(content.style.fontSize).toBe('1.5em');
      expect(content.style.color).toBe('rgb(68, 85, 102)');
    });

    it('opens links in a new tab instead of navigating', () => {
      const { fixture } = setup(ScrollTextLayerComponent);
      fixture.componentRef.setInput('layer', { kind: 'scrollText', id: 's1', width: 400, height: 300, format: 'markdown', text: { 'en-US': '[Wiki](https://example.org/x)' } });
      fixture.detectChanges();
      const open = spyOn(window, 'open');
      const link = el(fixture).querySelector('.content a') as HTMLAnchorElement;
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBeTrue();
      expect(open).toHaveBeenCalledWith('https://example.org/x', '_blank', 'noopener,noreferrer');
    });
  });

  // ---------------------------------------------------------------------------
  describe('IframeLayerComponent', () => {
    const layer = {
      kind: 'iframe',
      id: 'i1',
      width: 560,
      height: 315,
      src: 'https://www.openstreetmap.org/export/embed.html',
      title: { 'en-US': 'Map' },
      allow: ['fullscreen', 'camera'],
    };

    function make(l: Record<string, unknown>, inputs: Record<string, unknown> = {}) {
      const ctx = setup(IframeLayerComponent);
      ctx.fixture.componentRef.setInput('layer', l);
      for (const [k, v] of Object.entries(inputs)) ctx.fixture.componentRef.setInput(k, v);
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('mounts a sandboxed frame while the panel is current', () => {
      const { fixture, events } = make(layer, { viewActive: true, panelId: 'p1' });
      const frame = el(fixture).querySelector('iframe') as HTMLIFrameElement;
      expect(frame).not.toBeNull();
      expect(frame.getAttribute('src')).toBe(layer.src);
      expect(frame.getAttribute('title')).toBe('Map');
      expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
      expect(frame.getAttribute('allow')).toBe('fullscreen');
      expect(frame.hasAttribute('allowfullscreen')).toBeTrue();
      expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
      expect(el(fixture).querySelector('a.open')?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(events).toEqual([{ type: 'open', layerId: 'i1', kind: 'iframe', panelId: 'p1' }]);
    });

    it('stays unmounted on other panels while lazy', () => {
      expect(el(make(layer, { viewActive: false }).fixture).querySelector('iframe')).toBeNull();
    });

    it('mounts regardless of the panel with lazy false', () => {
      expect(el(make({ ...layer, lazy: false }, { viewActive: false }).fixture).querySelector('iframe')).not.toBeNull();
    });

    it('page view mounts once the box is on screen', () => {
      const { fixture } = make(layer, { viewMode: 'page' });
      const comp = fixture.componentInstance;
      expect(comp.mounted).toBeFalse();
      comp.onScreen = true;
      expect(comp.mounted).toBeTrue();
    });

    it('blocks non-https sources', () => {
      const http = make({ ...layer, src: 'http://example.org' }, { viewActive: true });
      expect(el(http.fixture).querySelector('iframe')).toBeNull();
      expect(el(http.fixture).querySelector('.blocked')).not.toBeNull();
      expect(el(http.fixture).querySelector('a.open')).toBeNull();
    });

    it('honours the strict preset and hides the open link on request', () => {
      const strict = make({ ...layer, sandbox: 'strict', showOpenLink: false }, { viewActive: true });
      expect(el(strict.fixture).querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts');
      expect(el(strict.fixture).querySelector('a.open')).toBeNull();
    });

    it('drops the sandbox attribute for the none preset', () => {
      const none = make({ ...layer, sandbox: 'none' }, { viewActive: true });
      expect(el(none.fixture).querySelector('iframe')?.hasAttribute('sandbox')).toBeFalse();
    });

    it('never loads in a print render', () => {
      document.documentElement.classList.add('pw-print');
      const { fixture } = make(layer, { viewActive: true });
      expect(el(fixture).querySelector('iframe')).toBeNull();
      expect(el(fixture).querySelector('.url')?.textContent).toContain(layer.src);
      document.documentElement.classList.remove('pw-print');
    });
  });
});
