import { TestBed } from '@angular/core/testing';
import { WidgetPlaybackService, type WidgetEvent } from './widget-playback.service';

describe('WidgetPlaybackService', () => {
  let service: WidgetPlaybackService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [WidgetPlaybackService] });
    service = TestBed.inject(WidgetPlaybackService);
  });

  it('plays one widget at a time', () => {
    const a = { id: 'a', pause: jasmine.createSpy('a') };
    const b = { id: 'b', pause: jasmine.createSpy('b') };
    service.register(a);
    service.register(b);
    service.notifyPlaying('a');
    expect(b.pause).toHaveBeenCalled();
    expect(a.pause).not.toHaveBeenCalled();
    service.notifyPlaying('b');
    expect(a.pause).toHaveBeenCalled();
  });

  it('reports active while playing or while the modal is open', () => {
    const states: boolean[] = [];
    service.active$.subscribe((v) => states.push(v));
    service.notifyPlaying('a');
    service.notifyStopped('a');
    service.setModalOpen(true);
    service.setModalOpen(false);
    expect(states).toEqual([false, true, false, true, false]);
  });

  it('pauseAll pauses every widget and clears the playing one', () => {
    const a = { id: 'a', pause: jasmine.createSpy('a') };
    service.register(a);
    service.notifyPlaying('a');
    service.pauseAll();
    expect(a.pause).toHaveBeenCalled();
    expect(service.isActive()).toBeFalse();
  });

  it('unregistering the playing widget clears playback', () => {
    service.register({ id: 'a', pause: () => undefined });
    service.notifyPlaying('a');
    service.unregister('a');
    expect(service.isActive()).toBeFalse();
  });

  it('ignores stop notifications of a widget that is not playing', () => {
    service.notifyPlaying('a');
    service.notifyStopped('b');
    expect(service.isActive()).toBeTrue();
  });

  it('publishes video requests and events', () => {
    const events: WidgetEvent[] = [];
    let requested = '';
    service.events$.subscribe((e) => events.push(e));
    service.videoRequests$.subscribe((r) => (requested = r.layer.id));
    service.emit({ type: 'download', layerId: 'l1', kind: 'download' });
    service.openVideo({ layer: { kind: 'videoPlayer', id: 'v1', assetId: 'x' }, panelId: 'p1' });
    expect(events[0].type).toBe('download');
    expect(requested).toBe('v1');
  });
});
