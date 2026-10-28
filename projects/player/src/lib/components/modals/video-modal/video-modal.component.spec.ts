import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { VideoModalComponent } from './video-modal.component';
import { ManifestService } from '../../../services/manifest.service';
import { AudioEngineService } from '../../../services/audio-engine.service';
import { VideoControllerService } from '../../../services/video-controller.service';
import { WidgetPlaybackService, type WidgetEvent } from '../../../services/widget-playback.service';
import type { AssetCatalogItemVideo, VideoPlayerLayer } from '../../../types';

describe('VideoModalComponent', () => {
  let fixture: ComponentFixture<VideoModalComponent>;
  let playback: WidgetPlaybackService;
  let engine: AudioEngineService;
  let controller: VideoControllerService;
  let events: WidgetEvent[];
  let playSpy: jasmine.Spy;

  const asset: AssetCatalogItemVideo = {
    id: 'vid-1',
    category: 'video',
    durationMs: 100000,
    variants: [
      { src: 'https://cdn.example.org/v.mp4', w: 1280, h: 720 },
      { src: 'https://cdn.example.org/v-rev.mp4', w: 1280, h: 720, direction: 'reverse' },
    ],
    poster: { src: 'https://cdn.example.org/p.webp' },
  };
  const layer: VideoPlayerLayer = { kind: 'videoPlayer', id: 'v1', assetId: 'vid-1', width: 480, height: 270, title: { 'en-US': 'Lecture' } };

  function create(l: VideoPlayerLayer = layer): HTMLElement {
    fixture = TestBed.createComponent(VideoModalComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('layer', l);
    fixture.componentRef.setInput('panelId', 'p1');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VideoModalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), WidgetPlaybackService],
    });
    spyOn(TestBed.inject(ManifestService), 'getAsset').and.returnValue(asset);
    playback = TestBed.inject(WidgetPlaybackService);
    engine = TestBed.inject(AudioEngineService);
    controller = TestBed.inject(VideoControllerService);
    spyOn(engine, 'setRoleDuck');
    spyOn(controller, 'pause');
    events = [];
    playback.events$.subscribe((e) => events.push(e));
    playSpy = spyOn(HTMLMediaElement.prototype, 'play').and.returnValue(Promise.resolve());
  });

  afterEach(() => fixture?.destroy());

  it('is a labelled modal dialog with the forward variant and the poster', () => {
    const root = create();
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby')!;
    expect(root.querySelector(`#${titleId}`)?.textContent).toContain('Lecture');
    const video = root.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('https://cdn.example.org/v.mp4');
    expect(video.getAttribute('poster')).toBe('https://cdn.example.org/p.webp');
    expect(video.hasAttribute('crossorigin')).toBeFalse();
    expect((root.querySelector('.video-modal-stage') as HTMLElement).style.aspectRatio).toBe('1280 / 720');
  });

  it('pauses other media, holds autoplay and autoplays in the modal', () => {
    const audioWidget = { id: 'a', pause: jasmine.createSpy('a') };
    playback.register(audioWidget);
    create();
    expect(audioWidget.pause).toHaveBeenCalled();
    expect(controller.pause).toHaveBeenCalled();
    expect(playback.isActive()).toBeTrue();
    expect(playSpy).toHaveBeenCalled();
    expect(events[0]).toEqual({ type: 'open', layerId: 'v1', kind: 'videoPlayer', panelId: 'p1', assetId: 'vid-1' });
  });

  it('does not autoplay with autoplayInModal false', () => {
    create({ ...layer, autoplayInModal: false });
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('focuses the play button on open', () => {
    const root = create();
    expect(document.activeElement).toBe(root.querySelector('button.play'));
  });

  it('ducks music while playing and releases on pause; emits play / pause', () => {
    const root = create();
    const video = root.querySelector('video') as HTMLVideoElement;
    video.dispatchEvent(new Event('play'));
    expect(engine.setRoleDuck).toHaveBeenCalledWith('music', 0.2);
    video.dispatchEvent(new Event('pause'));
    expect(engine.setRoleDuck).toHaveBeenCalledWith('music', 1);
    expect(events.map((e) => e.type)).toEqual(['open', 'play', 'pause']);
  });

  it('keyboard: arrows seek, M mutes, Home/End jump', () => {
    const root = create();
    const comp = fixture.componentInstance;
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    const key = (k: string, shiftKey = false) =>
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
    key('ArrowRight');
    expect(comp.currentTime).toBe(5);
    key('ArrowRight', true);
    expect(comp.currentTime).toBe(35);
    key('ArrowLeft');
    expect(comp.currentTime).toBe(30);
    key('End');
    expect(comp.currentTime).toBe(100);
    key('Home');
    expect(comp.currentTime).toBe(0);
    key('m');
    expect(comp.muted).toBeTrue();
  });

  it('keeps Tab inside the dialog', () => {
    const root = create();
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('.video-modal-dialog button'));
    const last = buttons[buttons.length - 1];
    last.focus();
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(root.querySelector('button.close'));
  });

  it('closes on the close button and on a backdrop click, not on a click inside', () => {
    const root = create();
    const closed = jasmine.createSpy('close');
    fixture.componentInstance.close.subscribe(closed);
    (root.querySelector('.video-modal-dialog') as HTMLElement).click();
    expect(closed).not.toHaveBeenCalled();
    (root.querySelector('.video-modal-overlay') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(1);
    (root.querySelector('button.close') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('releases the autoplay hold and emits close when destroyed', () => {
    create();
    fixture.destroy();
    expect(playback.isActive()).toBeFalse();
    expect(events[events.length - 1].type).toBe('close');
  });

  it('seeks on the scrub bar', () => {
    const root = create();
    const track = root.querySelector('.scrub') as HTMLElement;
    spyOn(track, 'getBoundingClientRect').and.returnValue({ left: 0, width: 400, top: 0, height: 20, right: 400, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
    track.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, bubbles: true, pointerId: 1 }));
    expect(fixture.componentInstance.currentTime).toBeCloseTo(25, 5);
  });
});
