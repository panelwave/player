import { BubbleClock, type BubbleClockState } from './bubble-clock';

describe('BubbleClock', () => {
  let now: number;
  let clock: BubbleClock;
  let states: BubbleClockState[];

  beforeEach(() => {
    now = 1000;
    clock = new BubbleClock(() => now);
    states = [];
    clock.changes$.subscribe((s) => states.push(s));
  });

  it('starts waiting at 0', () => {
    expect(clock.state).toBe('waiting');
    now += 5000;
    expect(clock.elapsed()).toBe(0);
  });

  it('advances while running', () => {
    clock.start();
    now += 1500;
    expect(clock.state).toBe('running');
    expect(clock.elapsed()).toBe(1500);
  });

  it('holds the time while paused and continues on resume', () => {
    clock.start();
    now += 1000;
    clock.pause();
    now += 4000; // video buffering / panel scrolled away
    expect(clock.elapsed()).toBe(1000);
    clock.start();
    now += 500;
    expect(clock.elapsed()).toBe(1500);
    expect(states).toEqual(['running', 'paused', 'running']);
  });

  it('ignores calls that change nothing', () => {
    clock.pause(); // waiting: nothing to pause
    clock.start();
    clock.start(); // already running
    expect(states).toEqual(['running']);
  });

  it('finish makes every balloon due and is final until reset', () => {
    clock.finish();
    expect(clock.state).toBe('done');
    expect(clock.elapsed()).toBe(Number.POSITIVE_INFINITY);
    clock.start();
    clock.pause();
    expect(clock.state).toBe('done');
    expect(states).toEqual(['done']);
  });

  it('reset goes back to 0, waiting', () => {
    clock.start();
    now += 2000;
    clock.reset();
    expect(clock.state).toBe('waiting');
    expect(clock.elapsed()).toBe(0);
    expect(states).toEqual(['running', 'waiting']);
  });

  it('reset of a fresh clock emits nothing', () => {
    clock.reset();
    expect(states).toEqual([]);
  });

  it('dispose completes the change stream', () => {
    let completed = false;
    clock.changes$.subscribe({ complete: () => (completed = true) });
    clock.dispose();
    expect(completed).toBeTrue();
  });
});
