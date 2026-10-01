import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { uiText } from '../../utils/ui-text';

/** English fallback for the `player.locked.*` keys (see assets/i18n/en.json). */
const LOCKED_TEXT_EN: Record<string, string> = {
  title: 'Locked',
  message: 'This panel is part of the full edition.',
};

/**
 * Placeholder for a panel the server stripped from a public manifest
 * (`"x-locked": true`). Fills its positioned container.
 */
@Component({
  selector: 'pw-locked-panel-placeholder',
  templateUrl: './locked-panel.component.html',
  styleUrls: ['./locked-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LockedPanelComponent {
  private readonly translate = inject(TranslateService, { optional: true });

  /** Translate a `player.locked.*` UI string (English fallback). */
  t(key: 'title' | 'message'): string {
    return uiText(this.translate, 'player.locked.' + key, LOCKED_TEXT_EN[key]);
  }
}
