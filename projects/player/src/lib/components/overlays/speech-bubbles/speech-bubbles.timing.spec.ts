/**
 * pw-speech-bubbles with timed balloons (schema 1.10 `showAtMs`): pending
 * balloons are laid out but hidden, revealed when the panel clock reaches
 * their time, and never flicker across re-renders.
 */
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BUBBLE_PENDING_CLASS, BUBBLE_REVEAL_MS, SpeechBubblesComponent } from './speech-bubbles.component';
import { BubbleClockDirective } from '../../../directives/bubble-clock.directive';
import { BubbleClock } from '../../../utils/bubble-clock';
import type { SpeechBubble } from '../../../types';

const bubbles = [
  { id: 'now', text: { 'en-US': 'You came back.' }, shape: { x: 0.55, y: 0.05, w: 0.35, h: 0.2 } },
  { id: 'later', text: { 'en-US': 'I never left.' }, shape: { x: 0.05, y: 0.1, w: 0.35, h: 0.2 }, showAtMs: 1000 },
  { id: 'last', text: { 'en-US': 'Then why the bags?' }, shape: { x: 0.5, y: 0.6, w: 0.35, h: 0.2 }, showAtMs: 2500 },
] as unknown as SpeechBubble[];

describe('SpeechBubblesComponent — timed balloons (showAtMs)', () => {
  let fixture: ComponentFixture<SpeechBubblesComponent>;
  let component: SpeechBubblesComponent;
  let now: number;
  let clock: BubbleClock;

  const wrapper = (id: string): HTMLElement =>
    fixture.nativeElement.querySelector(`.speech-bubble-wrapper[data-bubble-id="${id}"]`) as HTMLElement;
  const isPending = (id: string): boolean => wrapper(id).classList.contains(BUBBLE_PENDING_CLASS);
  const advance = (ms: number): void => {
    now += ms;
    tick(ms);
  };

  /** Create the overlay (with or without a panel clock around it) and let the first render run. */
  const setup = (withClock: boolean): void => {
    TestBed.configureTestingModule({
      imports: [SpeechBubblesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...(withClock ? [{ provide: BubbleClockDirective, useValue: { clock } }] : []),
      ],
    });
    fixture = TestBed.createComponent(SpeechBubblesComponent);
    component = fixture.componentInstance;
    component.containerWidth = 400;
    component.containerHeight = 300;
    component.bubbles = bubbles;
    fixture.detectChanges(); // ngAfterViewInit: subscribes to the clock, schedules the first render
    tick(60);
  };

  const finish = (): void => {
    fixture.destroy();
    flush();
  };

  beforeEach(() => {
    now = 0;
    clock = new BubbleClock(() => now);
  });

  afterEach(() => {
    document.documentElement.classList.remove('pw-print');
  });

  it('without a panel clock every balloon shows at once (standalone use, outgoing copies)', fakeAsync(() => {
    setup(false);
    expect(isPending('now')).toBeFalse();
    expect(isPending('later')).toBeFalse();
    expect(isPending('last')).toBeFalse();
    expect(wrapper('later').style.visibility).toBe('');
    finish();
  }));

  it('leaves untimed balloons exactly as before', fakeAsync(() => {
    setup(true);
    const w = wrapper('now');
    expect(w.hasAttribute('data-show-at')).toBeFalse();
    expect(w.classList.contains(BUBBLE_PENDING_CLASS)).toBeFalse();
    expect(w.style.visibility).toBe('');
    expect(w.style.pointerEvents).toBe('');
    expect(w.getAttribute('tabindex')).toBe('0');
    expect(w.hasAttribute('aria-hidden')).toBeFalse();
    finish();
  }));

  it('lays out a waiting balloon but keeps it hidden, inert and out of the tab order', fakeAsync(() => {
    setup(true);
    const w = wrapper('later');
    expect(w).toBeTruthy();
    expect(w.getAttribute('data-show-at')).toBe('1000');
    expect(isPending('later')).toBeTrue();
    expect(w.style.visibility).toBe('hidden');
    expect(w.style.pointerEvents).toBe('none');
    expect(w.getAttribute('aria-hidden')).toBe('true');
    expect(w.getAttribute('tabindex')).toBe('-1');
    expect(w.style.left).not.toBe(''); // positioned like every other balloon
    finish();
  }));

  it('reveals each balloon when the running clock reaches its time', fakeAsync(() => {
    setup(true);
    clock.start();
    advance(999);
    expect(isPending('later')).toBeTrue();
    advance(1);
    expect(isPending('later')).toBeFalse();
    expect(wrapper('later').style.visibility).toBe('');
    expect(wrapper('later').getAttribute('tabindex')).toBe('0');
    expect(wrapper('later').hasAttribute('aria-hidden')).toBeFalse();
    expect(isPending('last')).toBeTrue();
    advance(1500);
    expect(isPending('last')).toBeFalse();
    finish();
  }));

  it('fades a balloon in when its time comes', fakeAsync(() => {
    const animate = spyOn(HTMLElement.prototype, 'animate').and.callThrough();
    setup(true);
    clock.start();
    advance(1000);
    expect(animate).toHaveBeenCalledTimes(1);
    const [, options] = animate.calls.mostRecent().args as [Keyframe[], KeyframeAnimationOptions];
    expect(options.duration).toBe(BUBBLE_REVEAL_MS);
    finish();
  }));

  it('holds pending balloons while the clock is paused', fakeAsync(() => {
    setup(true);
    clock.start();
    advance(500);
    clock.pause();
    advance(5000); // the video buffers
    expect(isPending('later')).toBeTrue();
    clock.start();
    advance(499);
    expect(isPending('later')).toBeTrue();
    advance(1);
    expect(isPending('later')).toBeFalse();
    finish();
  }));

  it('a re-render keeps shown balloons shown and waiting ones hidden', fakeAsync(() => {
    setup(true);
    clock.start();
    advance(1200);
    component.renderAllBalloons(); // fonts arrived / resize / locale switch
    expect(isPending('now')).toBeFalse();
    expect(isPending('later')).toBeFalse();
    expect(isPending('last')).toBeTrue();
    advance(1300);
    expect(isPending('last')).toBeFalse();
    finish();
  }));

  it('shows everything when the clock is done', fakeAsync(() => {
    setup(true);
    expect(isPending('later')).toBeTrue();
    clock.finish();
    expect(isPending('later')).toBeFalse();
    expect(isPending('last')).toBeFalse();
    finish();
  }));

  it('hides the timed balloons again when the clock restarts', fakeAsync(() => {
    setup(true);
    clock.start();
    advance(3000);
    expect(isPending('last')).toBeFalse();
    clock.reset();
    expect(isPending('later')).toBeTrue();
    expect(isPending('last')).toBeTrue();
    expect(isPending('now')).toBeFalse();
    finish();
  }));

  it('print renders show every balloon', fakeAsync(() => {
    document.documentElement.classList.add('pw-print');
    setup(true);
    expect(isPending('later')).toBeFalse();
    expect(isPending('last')).toBeFalse();
    finish();
  }));

  it('cancels its reveal timers when destroyed', fakeAsync(() => {
    setup(true);
    clock.start();
    const timers = (component as unknown as { revealTimers: unknown[] }).revealTimers;
    expect(timers.length).toBe(2);
    fixture.destroy();
    expect((component as unknown as { revealTimers: unknown[] }).revealTimers.length).toBe(0);
    advance(3000); // nothing fires
    flush();
  }));
});
