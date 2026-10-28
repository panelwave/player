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
    const a = { id: 'a', pause: () => undefined };
    service.register(a);
    service.notifyPlaying('a');
    service.unregister(a);
    expect(service.isActive()).toBeFalse();
  });

  it('keeps a second instance of the same widget registered when the first unmounts (page transition)', () => {
    const live = { id: 'p1::a', pause: jasmine.createSpy('live') };
    const outgoing = { id: 'p1::a', pause: jasmine.createSpy('outgoing') };
    service.register(live);
    service.register(outgoing);
    service.unregister(outgoing);
    service.pauseForNavigation();
    expect(live.pause).toHaveBeenCalled();
  });

  it('a panel change pauses every widget except keepPlaying audio', () => {
    const stays = { id: 'a', pause: jasmine.createSpy('a'), keepPlaying: () => true };
    const stops = { id: 'b', pause: jasmine.createSpy('b'), keepPlaying: () => false };
    service.register(stays);
    service.register(stops);
    service.notifyPlaying('a');
    service.pauseForNavigation();
    expect(stays.pause).not.toHaveBeenCalled();
    expect(stops.pause).toHaveBeenCalled();
    expect(service.isActive()).toBeTrue(); // still playing: autoplay keeps waiting
    service.pauseAll(); // the video modal stops it too
    expect(stays.pause).toHaveBeenCalled();
  });

  it('keeps a parked element playing in a hidden holder and hands it back', () => {
    const events: WidgetEvent[] = [];
    service.events$.subscribe((e) => events.push(e));
    const audio = document.createElement('audio');
    service.park('p1::a', { audio, ducked: true, event: { layerId: 'a', kind: 'audioPlayer', panelId: 'p1' } });
    expect(audio.parentElement?.hasAttribute('data-pw-parked-audio')).toBeTrue();
    expect(service.isActive()).toBeTrue();
    service.pauseForNavigation(); // still plays on
    expect(service.unpark('p1::a')?.audio).toBe(audio);
    expect(service.unpark('p1::a')).toBeNull();
    expect(events).toEqual([]);
  });

  it('stops a parked element when another widget starts, and reports the pause', () => {
    const events: WidgetEvent[] = [];
    service.events$.subscribe((e) => events.push(e));
    const audio = document.createElement('audio');
    const pause = spyOn(audio, 'pause').and.callFake(() => audio.dispatchEvent(new Event('pause')));
    service.park('p1::a', { audio, ducked: false, event: { layerId: 'a', kind: 'audioPlayer', panelId: 'p1' } });
    service.notifyPlaying('p2::b');
    expect(pause).toHaveBeenCalled();
    expect(audio.isConnected).toBeFalse();
    expect(service.unpark('p1::a')).toBeNull();
    expect(events.map((e) => e.type)).toEqual(['pause']);
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
