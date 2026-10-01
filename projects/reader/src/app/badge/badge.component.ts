import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';

const IDLE_MS = 3000;
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown'] as const;

/** "Made with PanelWave" pill: fades out after 3 s idle, returns on activity. */
@Component({
  selector: 'pwr-badge',
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  readonly href = 'https://panelwave.org/?utm_source=reader&utm_medium=badge';
  readonly visible = signal(true);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const onActivity = (): void => this.wake();
    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, onActivity, { passive: true }));
    inject(DestroyRef).onDestroy(() => {
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, onActivity));
      clearTimeout(this.timer);
    });
    this.wake();
  }

  private wake(): void {
    this.visible.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), IDLE_MS);
  }
}
