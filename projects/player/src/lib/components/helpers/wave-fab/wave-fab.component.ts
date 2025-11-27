/**
 * Wave FAB Component
 * Floating Action Button to toggle toolbar
 */

import {
  Component,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';


/**
 * Wave FAB Component
 * Circular floating button with wave animation
 */
@Component({
    selector: 'pw-wave-fab',
    imports: [],
    templateUrl: './wave-fab.component.html',
    styleUrls: ['./wave-fab.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WaveFabComponent {
  /**
   * Click event
   */
  @Output() click = new EventEmitter<void>();

  /**
   * Handle click
   */
  onClick(): void {
    this.click.emit();
  }
}
