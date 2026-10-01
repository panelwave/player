import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { uiText } from '../../utils/ui-text';

/** English fallback for the `player.locked.*` keys (see assets/i18n/en.json). */
const LOCKED_TEXT_EN: Record<string, string> = {
  title: 'Locked',
  message: 'This panel is part of the full edition.',
  unlock: 'Unlock this panel',
};

/**
 * Placeholder for a locked panel: one the server stripped from a public
 * manifest (`"x-locked": true`), or one the paywall rules lock for the
 * reader. Fills its positioned container.
 *
 * `actionable` turns it into a button (click, Enter, Space) that emits
 * `activate`, so the host can raise the gate that unlocks the panel.
 */
@Component({
  selector: 'pw-locked-panel-placeholder',
  templateUrl: './locked-panel.component.html',
  styleUrls: ['./locked-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LockedPanelComponent {
  private readonly translate = inject(TranslateService, { optional: true });

  /** Render as a button that emits `activate` (page view: open the gate). */
  @Input() actionable = false;

  /** The reader clicked or keyboard-activated an actionable placeholder. */
  @Output() activate = new EventEmitter<void>();

  /** Translate a `player.locked.*` UI string (English fallback). */
  t(key: 'title' | 'message' | 'unlock'): string {
    return uiText(this.translate, 'player.locked.' + key, LOCKED_TEXT_EN[key]);
  }

  /**
   * Click / Enter / Space on an actionable placeholder. The event stops
   * here: the panel container underneath would otherwise treat it as a
   * tap-to-advance or focus click (and its keydown handler would cancel the
   * activation).
   */
  onActivate(event: Event): void {
    if (!this.actionable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.activate.emit();
  }
}
