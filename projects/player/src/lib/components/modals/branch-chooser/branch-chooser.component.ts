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
} from '@angular/core';

import { PwIconComponent } from '../../icon/pw-icon.component';
import type { Edge } from '../../../types';

/** One selectable path out of the current panel. */
export interface BranchChoice {
  /** The graph edge this choice traverses. */
  edge: Edge;
  /** Reader-facing label (edge label → target panel title → "Option N"). */
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
