import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, inject, input, output, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VariableStoreService } from 'player';
import type { VariableStore } from 'player';

/** One line in the dev-tools event log. */
export interface DevToolsEvent {
  at: number;
  type: string;
  detail: string;
}

type Tab = 'variables' | 'events' | 'performance';

/**
 * Demo dev-tools drawer: live variable inspector (all five scopes from the
 * player's VariableStoreService), the shell's event stream, performance
 * readings (FPS, JS heap where the browser exposes it, manifest load time)
 * and a debug-overlay switch that outlines layers and hotspots.
 *
 * Demo-only — nothing here ships in the library.
 */
@Component({
  selector: 'app-dev-tools',
  imports: [JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="dev-tools" aria-label="Developer tools">
      <header>
        <strong>Dev tools</strong>
        <label class="debug-toggle">
          <input type="checkbox" [checked]="debugOverlay()" (change)="debugOverlayChange.emit($any($event.target).checked)" />
          Debug overlay
        </label>
      </header>

      <div class="tabs" role="tablist" aria-label="Dev tools sections">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" [class.active]="tab() === t.id" (click)="tab.set(t.id)">
            {{ t.label }}
          </button>
        }
      </div>

      <div class="panel" role="tabpanel">
        @switch (tab()) {
          @case ('variables') {
            @for (scope of scopes; track scope) {
              <section>
                <h3>{{ scope }}</h3>
                @if (isEmpty(store()?.[scope])) {
                  <p class="muted">—</p>
                } @else {
                  <pre>{{ store()?.[scope] | json }}</pre>
                }
              </section>
            }
          }
          @case ('events') {
            <div class="events-head">
              <span class="muted">{{ events().length }} event(s)</span>
              <button type="button" (click)="clearEvents.emit()">Clear</button>
            </div>
            <ol class="events">
              @for (e of events(); track $index) {
                <li><time>{{ clock(e.at) }}</time> <b>{{ e.type }}</b> <span>{{ e.detail }}</span></li>
              }
            </ol>
          }
          @case ('performance') {
            <dl class="metrics">
              <dt>FPS</dt><dd data-metric="fps">{{ fps() }}</dd>
              <dt>JS heap</dt><dd data-metric="heap">{{ heap() }}</dd>
              <dt>Manifest load</dt><dd data-metric="load">{{ loadMs() === null ? '—' : loadMs() + ' ms' }}</dd>
              <dt>Panel changes</dt><dd data-metric="panels">{{ panelChanges() }}</dd>
            </dl>
          }
        }
      </div>
    </aside>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .dev-tools { height: 100%; display: flex; flex-direction: column; background: #111827; color: #e5e7eb; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; border-bottom: 1px solid #374151; }
    .debug-toggle { display: flex; gap: 0.35rem; align-items: center; cursor: pointer; }
    .tabs { display: flex; border-bottom: 1px solid #374151; }
    .tabs button { flex: 1; background: none; border: 0; color: #d1d5db; padding: 0.45rem; cursor: pointer; font: inherit; }
    .tabs button.active { color: #fff; box-shadow: inset 0 -2px #60a5fa; }
    .tabs button:focus-visible, .events-head button:focus-visible { outline: 2px solid #60a5fa; outline-offset: -2px; }
    .panel { flex: 1; overflow: auto; padding: 0.5rem 0.75rem; }
    h3 { margin: 0.5rem 0 0.25rem; font-size: 12px; text-transform: uppercase; color: #93c5fd; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .muted { color: #9ca3af; margin: 0; }
    .events-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
    .events-head button { background: #374151; color: #fff; border: 0; border-radius: 4px; padding: 0.15rem 0.5rem; cursor: pointer; font: inherit; }
    .events { list-style: none; margin: 0; padding: 0; }
    .events li { padding: 0.15rem 0; border-bottom: 1px solid #1f2937; }
    .events time { color: #9ca3af; }
    .events b { color: #fbbf24; font-weight: 600; margin-inline: 0.4rem; }
    .metrics { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; margin: 0.25rem 0; }
    .metrics dt { color: #9ca3af; }
    .metrics dd { margin: 0; color: #fff; }
  `,
})
export class DevToolsComponent {
  readonly events = input<DevToolsEvent[]>([]);
  readonly loadMs = input<number | null>(null);
  readonly panelChanges = input(0);
  readonly debugOverlay = input(false);
  readonly debugOverlayChange = output<boolean>();
  readonly clearEvents = output<void>();

  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'variables', label: 'Variables' },
    { id: 'events', label: 'Events' },
    { id: 'performance', label: 'Performance' },
  ];
  protected readonly scopes: (keyof VariableStore)[] = ['global', 'chapter', 'page', 'session', 'persistent'];
  protected readonly tab = signal<Tab>('variables');
  protected readonly store = signal<VariableStore | null>(null);
  protected readonly fps = signal(0);
  protected readonly heap = signal('n/a');

  constructor() {
    const destroyRef = inject(DestroyRef);
    inject(VariableStoreService)
      .store.pipe(takeUntilDestroyed(destroyRef))
      .subscribe((s) => this.store.set(s));

    // FPS: count animation frames per second outside Angular so the meter
    // itself does not trigger change detection 60 times a second.
    const zone = inject(NgZone);
    let frames = 0;
    let rafId = 0;
    const tick = () => {
      frames++;
      rafId = requestAnimationFrame(tick);
    };
    zone.runOutsideAngular(() => (rafId = requestAnimationFrame(tick)));
    const interval = setInterval(() => {
      this.fps.set(frames);
      frames = 0;
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      this.heap.set(mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'n/a');
    }, 1000);
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
    });
  }

  protected isEmpty(value: unknown): boolean {
    return !value || (typeof value === 'object' && Object.keys(value as object).length === 0);
  }

  protected clock(at: number): string {
    return new Date(at).toLocaleTimeString(undefined, { hour12: false });
  }
}
