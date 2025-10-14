/**
 * Speech Bubbles Component
 * Renders speech bubbles with SVG tails and localized text
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { LocaleCode, LocalizedString } from '../../../types';

/**
 * Speech bubble definition
 */
export interface SpeechBubble {
  id: string;
  text: LocalizedString;
  x: number;
  y: number;
  width?: number;
  height?: number;
  tailPosition?: 'top' | 'bottom' | 'left' | 'right';
  tailOffset?: number;
  visible?: boolean;
  condition?: unknown; // JSON Logic condition
  toggleable?: boolean;
  style?: 'speech' | 'thought' | 'shout';
}

/**
 * Speech Bubbles Component
 * Displays localized text bubbles with SVG tails
 */
@Component({
  selector: 'pw-speech-bubbles',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './speech-bubbles.component.html',
  styleUrls: ['./speech-bubbles.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpeechBubblesComponent {
  /**
   * Array of speech bubbles to render
   */
  @Input() bubbles: SpeechBubble[] = [];

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Bubble clicked
   */
  @Output() bubbleClick = new EventEmitter<SpeechBubble>();

  /**
   * Bubble toggled
   */
  @Output() bubbleToggle = new EventEmitter<{ bubble: SpeechBubble; visible: boolean }>();

  /**
   * Get localized text for bubble
   */
  getBubbleText(bubble: SpeechBubble): string {
    if (!bubble.text || typeof bubble.text !== 'object') {
      return '';
    }

    // Try exact locale match
    if (bubble.text[this.locale]) {
      return bubble.text[this.locale];
    }

    // Try base language
    const baseLocale = this.locale.split('-')[0];
    const baseMatch = Object.keys(bubble.text).find(
      (key) => key.startsWith(baseLocale)
    );
    
    if (baseMatch && bubble.text[baseMatch]) {
      return bubble.text[baseMatch];
    }

    // Return first available
    const firstKey = Object.keys(bubble.text)[0];
    return firstKey ? bubble.text[firstKey] : '';
  }

  /**
   * Check if bubble should be visible
   */
  isBubbleVisible(bubble: SpeechBubble): boolean {
    // Explicit visibility setting
    if (bubble.visible !== undefined) {
      return bubble.visible;
    }

    // Default to visible
    return true;
  }

  /**
   * Get bubble width
   */
  getBubbleWidth(bubble: SpeechBubble): number {
    return bubble.width || 200;
  }

  /**
   * Get bubble height
   */
  getBubbleHeight(bubble: SpeechBubble): number {
    return bubble.height || 100;
  }

  /**
   * Get tail SVG path
   */
  getTailPath(bubble: SpeechBubble): string {
    const width = this.getBubbleWidth(bubble);
    const height = this.getBubbleHeight(bubble);
    const tailPos = bubble.tailPosition || 'bottom';
    const offset = bubble.tailOffset || 0;

    switch (tailPos) {
      case 'top':
        return `M ${width / 2 + offset} 0 L ${width / 2 + offset - 10} -15 L ${width / 2 + offset + 10} -15 Z`;
      
      case 'bottom':
        return `M ${width / 2 + offset} ${height} L ${width / 2 + offset - 10} ${height + 15} L ${width / 2 + offset + 10} ${height + 15} Z`;
      
      case 'left':
        return `M 0 ${height / 2 + offset} L -15 ${height / 2 + offset - 10} L -15 ${height / 2 + offset + 10} Z`;
      
      case 'right':
        return `M ${width} ${height / 2 + offset} L ${width + 15} ${height / 2 + offset - 10} L ${width + 15} ${height / 2 + offset + 10} Z`;
      
      default:
        return '';
    }
  }

  /**
   * Get bubble style class
   */
  getBubbleStyleClass(bubble: SpeechBubble): string {
    const style = bubble.style || 'speech';
    return `bubble-${style}`;
  }

  /**
   * Handle bubble click
   */
  onBubbleClick(bubble: SpeechBubble, event: MouseEvent): void {
    event.stopPropagation();
    
    this.bubbleClick.emit(bubble);

    // Toggle visibility if toggleable
    if (bubble.toggleable) {
      const newVisible = !this.isBubbleVisible(bubble);
      this.bubbleToggle.emit({ bubble, visible: newVisible });
    }
  }

  /**
   * Get bubble transform
   */
  getBubbleTransform(bubble: SpeechBubble): string {
    return `translate(${bubble.x}px, ${bubble.y}px)`;
  }
}
