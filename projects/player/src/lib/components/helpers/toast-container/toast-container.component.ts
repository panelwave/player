/**
 * Toast Container Component
 * Manages toast notifications with queue system
 */

import { inject,
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef, OnDestroy,
} from '@angular/core';

import { PwIconComponent } from '../../icon/pw-icon.component';


/**
 * Toast type
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * Toast definition
 */
export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

/**
 * Toast with internal state
 */
interface ToastItem extends Toast {
  visible: boolean;
  timeout?: number;
}

/**
 * Toast Container Component
 * Displays toast notifications in a queue
 */
@Component({
    selector: 'pw-toast-container',
    imports: [PwIconComponent],
    templateUrl: './toast-container.component.html',
    styleUrls: ['./toast-container.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastContainerComponent implements OnDestroy {
  /**
   * Toast queue
   */
  toasts: ToastItem[] = [];

  /**
   * Default duration (ms)
   */
  private readonly DEFAULT_DURATION = 3000;

  /**
   * Max toasts to show
   */
  private readonly MAX_TOASTS = 5;

  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Show a toast
   */
  show(toast: Toast): void {
    // Generate ID if not provided
    const toastItem: ToastItem = {
      ...toast,
      id: toast.id || this.generateId(),
      duration: toast.duration ?? this.DEFAULT_DURATION,
      visible: false, // Start hidden for animation
    };

    // Add to queue
    this.toasts.push(toastItem);

    // Limit queue size
    if (this.toasts.length > this.MAX_TOASTS) {
      const removed = this.toasts.shift();
      if (removed && removed.timeout !== undefined) {
        window.clearTimeout(removed.timeout);
      }
    }

    // Trigger change detection
    this.cdr.markForCheck();

    // Show after a tick (for animation)
    setTimeout(() => {
      toastItem.visible = true;
      this.cdr.markForCheck();
    }, 10);

    // Auto-dismiss
    if (toastItem.duration && toastItem.duration > 0) {
      toastItem.timeout = window.setTimeout(() => {
        this.dismiss(toastItem.id);
      }, toastItem.duration);
    }
  }

  /**
   * Dismiss a toast
   */
  dismiss(id: string): void {
    const toast = this.toasts.find((t) => t.id === id);
    if (!toast) return;

    // Clear timeout
    if (toast.timeout !== undefined) {
      window.clearTimeout(toast.timeout);
    }

    // Hide (for animation)
    toast.visible = false;
    this.cdr.markForCheck();

    // Remove after animation
    setTimeout(() => {
      const index = this.toasts.findIndex((t) => t.id === id);
      if (index >= 0) {
        this.toasts.splice(index, 1);
        this.cdr.markForCheck();
      }
    }, 300); // Match animation duration
  }

  /**
   * Get toast icon
   */
  getIcon(type: ToastType): string {
    switch (type) {
      case 'success': return 'lucideCheck';
      case 'error': return 'lucideX';
      case 'warning': return 'lucideTriangleAlert';
      case 'info': return 'lucideInfo';
      default: return 'lucideInfo';
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup on destroy
   */
  ngOnDestroy(): void {
    this.toasts.forEach((toast) => {
      if (toast.timeout !== undefined) {
        window.clearTimeout(toast.timeout);
      }
    });
  }
}
