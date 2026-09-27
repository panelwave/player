/**
 * Branch Chooser Component
 * Lists the outgoing edges of the current panel whose conditions currently
 * pass, so a reader can pick a path explicitly instead of relying on edge
 * priority. Opened from the toolbar's "Choices" button; follows the shell's
 * modal contract (visible input + close output).
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  HostListener,
  inject,
} from '@angular/core';

import { TranslateService } from '@ngx-translate/core';
import { PwIconComponent } from '../../icon/pw-icon.component';
import type { Edge } from '../../../types';
import { uiText } from '../../../utils/ui-text';

/** English fallback for the `branch_chooser.*` keys (see assets/i18n/en.json). */
const BRANCH_TEXT_EN: Record<string, string> = {
  title: 'Choose your path',
  close: 'Close',
  option: 'Option {{n}}',
};

/** One selectable path out of the current panel. */
export interface BranchChoice {
  /** The graph edge this choice traverses. */
  edge: Edge;
  /**
   * Reader-facing label (edge label → target panel title). Empty: the
   * chooser shows a translated "Option N".
   */
  label: string;
  /** Position in the offered list (0-based), stable for tracking. */
  index: number;
}

@Component({
  selector: 'pw-branch-chooser',
  imports: [PwIconComponent],
  templateUrl: './branch-chooser.component.html',
  styleUrls: ['./branch-chooser.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchChooserComponent {
  private readonly translate = inject(TranslateService, { optional: true });

  /** Translate a `branch_chooser.*` UI string (English fallback). */
  t(key: string, params?: Record<string, unknown>): string {
    return uiText(this.translate, 'branch_chooser.' + key, BRANCH_TEXT_EN[key], params);
  }

  /** Visible state */
  @Input() visible = false;

  /** Current locale (labels are already resolved by the shell). */
  @Input() locale = 'en-US';

  /** Paths on offer, in graph order. */
  @Input() choices: BranchChoice[] = [];

  /** Reader picked a path. */
  @Output() choose = new EventEmitter<BranchChoice>();

  /** Close requested without choosing. */
  @Output() close = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible) {
      this.close.emit();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  trackChoice(_index: number, choice: BranchChoice): number {
    return choice.index;
  }
}
