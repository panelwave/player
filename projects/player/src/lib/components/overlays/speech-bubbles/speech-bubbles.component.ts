/**
 * Speech Bubbles Component
 * Renders speech bubbles using the ComicBalloon SVG renderer.
 * Supports all balloon types (normal, thought, shout, whisper, connector, cut-top variants),
 * configurable tails, hide-border effects, and per-character/per-bubble style overrides.
 * Works in both panel view and page view with normalized coordinate positioning.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  OnDestroy,
  inject,
} from '@angular/core';

import type {
  LocaleCode,
  SpeechBubble,
  BalloonConfig,
  BalloonConfigOverride,
  Character,
} from '../../../types';
import { ComicBalloon } from '../../../utils/comic-balloon';
import type { TailOptions } from '../../../utils/comic-balloon';
import { DEFAULT_BALLOON_CONFIG, mergeBalloonConfig, balloonConfigToRenderOptions, balloonConfigToTailOptions } from '../../../utils/balloon-config';
import { ManifestService } from '../../../services/manifest.service';

/**
 * Speech Bubbles Component
 * Renders speech bubbles with SVG balloon shapes, tails, and localized text.
 * Positions bubbles using normalized coordinates relative to the container.
 */
@Component({
    selector: 'pw-speech-bubbles',
    imports: [],
    templateUrl: './speech-bubbles.component.html',
    styleUrls: ['./speech-bubbles.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SpeechBubblesComponent implements OnChanges, AfterViewInit, OnDestroy {
  /**
   * Array of speech bubbles from the manifest (schema format)
   */
  @Input() bubbles: SpeechBubble[] = [];

  /**
   * Current locale for text resolution
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Container width in pixels (for converting normalized coords)
   */
  @Input() containerWidth = 0;

  /**
   * Container height in pixels (for converting normalized coords)
   */
  @Input() containerHeight = 0;

  /**
   * Per-screen lettering scale (player viewport height relative to the DIN A4
   * authoring frame). Balloon text keeps the same comfortable reading size on
   * every screen — it does NOT grow proportionally with the panel; only small
   * screens (phones) get smaller lettering.
   */
  @Input() readingScale = 1;

  /**
   * Work-level balloon config defaults (from settings.typography.balloon_config)
   */
  @Input() workBalloonConfig: BalloonConfig | null = null;

  /**
   * Characters array for resolving character-level balloon overrides
   */
  @Input() characters: Character[] = [];

  /**
   * Bubble clicked
   */
  @Output() bubbleClick = new EventEmitter<SpeechBubble>();

  /**
   * Bubble audio play requested
   */
  @Output() bubbleAudioPlay = new EventEmitter<{ bubble: SpeechBubble; audioAssetId: string }>();

  /** Rendered balloon containers, keyed by bubble ID */
  private renderedBalloons = new Map<string, HTMLElement>();

  /** ResizeObserver for container size tracking */
  private resizeObserver: ResizeObserver | null = null;

  private initialized = false;

  private elementRef = inject(ElementRef<HTMLElement>);

  private manifestService = inject(ManifestService);

  ngAfterViewInit(): void {
    this.initialized = true;
    // First paint without blocking on fonts (font-display: swap shows a
    // fallback), small delay to ensure container dimensions are available.
    setTimeout(() => this.renderAllBalloons(), 50);
    // Re-render once the comic fonts are loaded so text measurement is exact
    // even when the balloon fonts arrive late.
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        if (this.initialized) {
          this.renderAllBalloons();
        }
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.initialized) return;

    const needsRerender =
      changes['bubbles'] ||
      changes['locale'] ||
      changes['containerWidth'] ||
      changes['containerHeight'] ||
      changes['readingScale'] ||
      changes['workBalloonConfig'] ||
      changes['characters'];

    if (needsRerender) {
      this.renderAllBalloons();
    }
  }

  ngOnDestroy(): void {
    this.initialized = false;
    this.resizeObserver?.disconnect();
    this.renderedBalloons.clear();
  }

  /**
   * Resolve the effective BalloonConfig for a bubble.
   * Merges: work defaults -> character overrides -> styleRef preset -> bubble overrides
   */
  resolveEffectiveConfig(bubble: SpeechBubble): BalloonConfig {
    const manifest = this.manifestService.getManifest();

    // Start with work-level defaults (input, else manifest) layered onto the
    // library defaults, so partial work configs keep sane values for the rest
    const workConfig = this.workBalloonConfig
      ?? manifest?.settings?.typography?.balloon_config
      ?? null;
    const baseConfig = workConfig
      ? mergeBalloonConfig(DEFAULT_BALLOON_CONFIG, workConfig as BalloonConfigOverride)
      : { ...DEFAULT_BALLOON_CONFIG };

    // Apply character-level overrides if characterId is set
    let config = baseConfig;
    if (bubble.characterId) {
      const characters = this.characters.length > 0
        ? this.characters
        : manifest?.meta?.characters ?? [];
      const character = characters.find(c => c.id === bubble.characterId);
      if (character?.balloonConfig) {
        config = mergeBalloonConfig(config, character.balloonConfig);
      }
    }

    // Apply the named preset from settings.typography.balloonPresets (schema 1.3+).
    // Unknown styleRefs are ignored.
    if (bubble.styleRef) {
      const preset = manifest?.settings?.typography?.balloonPresets?.[bubble.styleRef];
      if (preset) {
        config = mergeBalloonConfig(config, preset);
      }
    }

    // Apply bubble-level overrides
    if (bubble.balloonConfig) {
      return mergeBalloonConfig(config, bubble.balloonConfig as BalloonConfigOverride);
    }

    return config;
  }

  /**
   * Get localized text for a bubble
   */
  getLocalizedText(bubble: SpeechBubble): string {
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
   * Compute the pixel position of a bubble from its normalized bounding box
   */
  computeBubblePosition(bubble: SpeechBubble): { left: number; top: number; width: number; height: number } {
    const cw = this.containerWidth || 1;
    const ch = this.containerHeight || 1;
    const shape = bubble.shape;

    if (!shape) {
      return { left: 0, top: 0, width: 120, height: 80 };
    }

    return {
      left: shape.x * cw + (shape.w * cw) / 2,
      top: shape.y * ch + (shape.h * ch) / 2,
      width: shape.w * cw,
      height: shape.h * ch,
    };
  }

  /**
   * Render all speech balloons into the DOM
   */
  renderAllBalloons(): void {
    const container = this.elementRef.nativeElement.querySelector('.speech-bubbles-container');
    if (!container) return;

    // Clear existing rendered balloons
    container.innerHTML = '';
    this.renderedBalloons.clear();

    if (!this.bubbles || this.bubbles.length === 0) return;
    if (this.containerWidth <= 0 || this.containerHeight <= 0) return;

    for (const bubble of this.bubbles) {
      const text = this.getLocalizedText(bubble);
      if (!text) continue;

      const config = this.resolveEffectiveConfig(bubble);
      const pos = this.computeBubblePosition(bubble);

      // Create wrapper div for positioning
      const wrapper = document.createElement('div');
      wrapper.classList.add('speech-bubble-wrapper');
      wrapper.setAttribute('data-bubble-id', bubble.id);
      wrapper.style.position = 'absolute';

      // Create balloon container
      const balloonContainer = document.createElement('div');
      balloonContainer.classList.add('balloon-container');

      // Build ComicBalloon render options from config
      const renderOpts = balloonConfigToRenderOptions(config);
      const tailOpts = balloonConfigToTailOptions(config);

      try {
        const balloonInstance = new ComicBalloon(balloonContainer, renderOpts);
        const result = balloonInstance.render(text, tailOpts as TailOptions | null);

        // The SVG is self-sized (natural, text-fitting balloon size)
        const svgWidth = result.svg?.style.width ? parseFloat(result.svg.style.width) : config.maxWidth;
        const svgHeight = result.svg?.style.height ? parseFloat(result.svg.style.height) : config.maxHeight;

        // Per-screen lettering: the natural-size balloon is scaled by the
        // reading scale — the same comfortable text size on every screen —
        // NOT proportionally with the authored shape box (which would blow
        // text up on large screens). Capped so a balloon never exceeds its
        // panel container, and clamped against broken measurements.
        let scale = Math.min(4, Math.max(0.25, this.readingScale || 1));
        if (svgWidth > 0 && svgHeight > 0) {
          scale = Math.max(0.25, Math.min(scale, this.containerWidth / svgWidth, this.containerHeight / svgHeight));
        }
        const visualW = svgWidth * scale;
        const visualH = svgHeight * scale;

        // Anchor at the shape box's center — but edges the authored box
        // touches stay glued to the panel border (narrator / Panel-Top
        // caption boxes keep sitting exactly on the border even though the
        // visual size no longer equals the stored box).
        const boxLeft = (bubble.shape?.x ?? 0) * this.containerWidth;
        const boxTop = (bubble.shape?.y ?? 0) * this.containerHeight;
        const boxRight = boxLeft + (bubble.shape?.w ?? 0) * this.containerWidth;
        const boxBottom = boxTop + (bubble.shape?.h ?? 0) * this.containerHeight;
        const eps = Math.max(4, 0.02 * Math.min(this.containerWidth, this.containerHeight));
        let centerX = pos.left;
        let centerY = pos.top;
        if (boxLeft <= eps) centerX = visualW / 2;
        else if (boxRight >= this.containerWidth - eps) centerX = this.containerWidth - visualW / 2;
        if (boxTop <= eps) centerY = visualH / 2;
        else if (boxBottom >= this.containerHeight - eps) centerY = this.containerHeight - visualH / 2;

        // The wrapper is scaled about its center, so its visual center lands
        // exactly on (centerX, centerY).
        wrapper.style.left = `${centerX - svgWidth / 2}px`;
        wrapper.style.top = `${centerY - svgHeight / 2}px`;
        if (Math.abs(scale - 1) > 0.01) {
          wrapper.style.transform = `scale(${scale})`;
          wrapper.style.transformOrigin = 'center center';
        }

        // Click handler
        wrapper.addEventListener('click', (event: MouseEvent) => {
          event.stopPropagation();
          this.bubbleClick.emit(bubble);

          // Emit audio play if bubble has an audio asset
          if (bubble.audioAssetId) {
            this.bubbleAudioPlay.emit({ bubble, audioAssetId: bubble.audioAssetId as string });
          }
        });

        // Accessibility
        wrapper.setAttribute('role', 'img');
        wrapper.setAttribute('aria-label', text);
        wrapper.setAttribute('tabindex', '0');

        // Keyboard support
        wrapper.addEventListener('keydown', (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.bubbleClick.emit(bubble);
          }
        });

        wrapper.appendChild(balloonContainer);
        container.appendChild(wrapper);
        this.renderedBalloons.set(bubble.id, wrapper);
      } catch (e) {
        console.warn(`[pw-speech-bubbles] Failed to render balloon "${bubble.id}":`, e);
      }
    }
  }

  /**
   * Handle bubble click (called from template for any fallback interaction)
   */
  onBubbleClick(bubble: SpeechBubble, event: MouseEvent): void {
    event.stopPropagation();
    this.bubbleClick.emit(bubble);
  }
}
