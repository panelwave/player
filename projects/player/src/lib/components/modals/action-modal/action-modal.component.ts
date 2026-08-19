/**
 * Action Modal Component
 * Simple localized title + content dialog opened by a hotspot's openModal
 * action. Follows the shell's modal contract: visible input + close output.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';

import { PwIconComponent } from '../../icon/pw-icon.component';
import type { LocalizedString } from '../../../types';
import { resolveLocalizedString } from '../../../utils';

@Component({
  selector: 'pw-action-modal',
  imports: [PwIconComponent],
  templateUrl: './action-modal.component.html',
  styleUrls: ['./action-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionModalComponent {
  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Current locale for text resolution
   */
  @Input() locale = 'en-US';

  /**
   * Localized modal title
   */
  @Input() title: LocalizedString | null = null;

  /**
   * Localized modal body text
   */
  @Input() content: LocalizedString | null = null;

  /**
   * Close requested
   */
  @Output() close = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible) {
      this.close.emit();
    }
  }

  resolved(ls: LocalizedString | null): string {
    return ls ? resolveLocalizedString(ls, this.locale, 'en-US') : '';
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
