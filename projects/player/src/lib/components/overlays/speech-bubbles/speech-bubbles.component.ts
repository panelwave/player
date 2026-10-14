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
import { placeGrownBody, tailConfigToTip } from '../../../utils/balloon-geometry';
import { ManifestService } from '../../../services/manifest.service';

/** Smallest rendered lettering size in CSS px (balloons grow to keep text readable on small pages). */
export const MIN_LETTERING_PX = 9;

/** Centre coordinate that keeps a `size`-long balloon inside [0, extent] (centred when it cannot fit). */
export function clampCenter(center: number, size: number, extent: number): number {
  if (size >= extent) return extent / 2;
  return Math.min(extent - size / 2, Math.max(size / 2, center));
}

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
   * Page view: place a tailed balloon by its AUTHORED tail tip (the speaker
   * on the artwork) instead of centring its body on the stored box, and keep
   * the tail at its authored length when the MIN_LETTERING_PX floor boosts
   * the balloon — the CMS editor's page view rule (PanelRenderer), which the
   * lettered PDF must reproduce. Panel view keeps the centre placement.
   */
  @Input() anchorTailTip = false;

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

  /**
   * Font specs ("15px 'Ames Italic', sans-serif") whose loading this overlay
   * already requested. Web fonts load lazily on first use, so the first
   * render may have measured with a fallback face while document.fonts.ready
   * had long resolved (no font was in flight yet). Each new spec is loaded
   * explicitly and the balloons re-render once it arrives.
   */
  private fontsRequested = new Set<string>();

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
      changes['anchorTailTip'] ||
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

    const fontSpecs = new Set<string>();
    for (const bubble of this.bubbles) {
      const text = this.getLocalizedText(bubble);
      if (!text) continue;

      const config = this.resolveEffectiveConfig(bubble);
      fontSpecs.add(`${config.fontSize}px ${config.fontFamily}`);
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
        let result = new ComicBalloon(balloonContainer, renderOpts).render(text, tailOpts as TailOptions | null);

        // The SVG is self-sized (natural, text-fitting balloon size)
        let svgWidth = result.svg?.style.width ? parseFloat(result.svg.style.width) : config.maxWidth;
        let svgHeight = result.svg?.style.height ? parseFloat(result.svg.style.height) : config.maxHeight;

        // Per-screen lettering: the natural-size balloon is scaled by the
        // reading scale — the same comfortable text size on every screen —
        // NOT proportionally with the authored shape box (which would blow
        // text up on large screens). Capped so a balloon never exceeds its
        // panel container, and clamped against broken measurements.
        const baseScale = Math.min(4, Math.max(0.25, this.readingScale || 1));
        let scale = baseScale;
        // Never letter below MIN_LETTERING_PX: on a page shown small the balloon
        // grows just enough (still anchored and kept inside the panel below).
        if (config.fontSize > 0) {
          scale = Math.max(scale, MIN_LETTERING_PX / config.fontSize);
        }
        // Too wide for its panel at that size: re-wrap the text to the panel
        // width (more lines, natural height) rather than shrink the lettering.
        // The SVG can run a little wider than maxWidth (stroke, tail), so narrow
        // by the remaining overshoot for up to three passes.
        let maxWidth = Number(renderOpts['maxWidth']) || svgWidth;
        let usedOpts: Record<string, unknown> = renderOpts;
        for (let pass = 0; pass < 3 && svgWidth > 0 && this.containerWidth > 0 && svgWidth * scale > this.containerWidth + 0.5; pass++) {
          const narrower = Math.max(40, Math.floor(maxWidth * (this.containerWidth / (svgWidth * scale)) * 0.99));
          if (narrower >= maxWidth) break;
          maxWidth = narrower;
          usedOpts = { ...renderOpts, maxWidth, maxHeight: 0 };
          result = new ComicBalloon(balloonContainer, usedOpts).render(text, tailOpts as TailOptions | null);
          svgWidth = result.svg?.style.width ? parseFloat(result.svg.style.width) : maxWidth;
          svgHeight = result.svg?.style.height ? parseFloat(result.svg.style.height) : svgHeight;
        }
        if (svgWidth > 0 && svgHeight > 0) {
          scale = Math.max(0.25, Math.min(scale, this.containerWidth / svgWidth, this.containerHeight / svgHeight));
        }

        // Page view (anchorTailTip): the tail tip stays on the AUTHORED tip
        // and a readability boost above the base scale grows only the body —
        // the tail is rendered at length / boost so its visible length stays
        // authored (the editor's tail counter-scaling). Connectors keep the
        // centre rule: the editor glues them onto their target balloon.
        const tailLength = Number(tailOpts?.length) || 50;
        const cornerRadius = Number(renderOpts['cornerRadius'] ?? 0.45) || 0;
        const tipAnchored = this.anchorTailTip && !!tailOpts && tailOpts.position !== undefined
          && config.balloonType !== 'connector';
        let renderedTailLength = tailLength;
        if (tipAnchored && scale > baseScale * 1.001) {
          renderedTailLength = tailLength * baseScale / scale;
          result = new ComicBalloon(balloonContainer, usedOpts)
            .render(text, { ...tailOpts, length: renderedTailLength } as TailOptions);
          svgWidth = result.svg?.style.width ? parseFloat(result.svg.style.width) : svgWidth;
          svgHeight = result.svg?.style.height ? parseFloat(result.svg.style.height) : svgHeight;
        }
        const visualW = svgWidth * scale;
        const visualH = svgHeight * scale;

        // Auto-grow (schema 1.8 textFit): when the text needed more room than
        // the authored size, the engine grew the body. Place the grown body
        // so the tail tip stays on the speaker (the body moves away from it)
        // — the same rule the CMS editor applies; glued caption edges and the
        // panel clamp below still win. Offsets are in balloon px, scaled.
        let grownOffsetX = 0;
        let grownOffsetY = 0;
        if (result.grown) {
          const authoredRect = {
            x: -result.authoredWidth / 2, y: -result.authoredHeight / 2,
            width: result.authoredWidth, height: result.authoredHeight,
          };
          const tail = tailOpts && tailOpts.position !== undefined
            ? { position: tailOpts.position, length: tailOpts.length }
            : null;
          const placed = placeGrownBody(
            authoredRect, { width: result.width, height: result.height },
            tail, Number(renderOpts['cornerRadius']) || 0, null,
          );
          grownOffsetX = (placed.x + placed.width / 2) * scale;
          grownOffsetY = (placed.y + placed.height / 2) * scale;
          wrapper.setAttribute('data-grown', 'true');
        }

        // The stored box is the balloon BODY (the editor stores the body, not
        // the tail). The SVG's viewBox also holds the tail and the stroke
        // padding, so its centre is not the body's: offset of the body centre
        // from the SVG centre, in balloon px (the body starts at viewBox 0,0).
        const vb = (result.svg?.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
        const hasViewBox = vb.length === 4 && vb.every((v) => Number.isFinite(v));
        const bodyOffsetX = hasViewBox ? (-vb[0] + result.width / 2) - svgWidth / 2 : 0;
        const bodyOffsetY = hasViewBox ? (-vb[1] + result.height / 2) - svgHeight / 2 : 0;

        // Anchor the body at the shape box's center (shifted for a grown
        // body) — but edges the authored box touches stay glued to the panel
        // border (narrator / Panel-Top caption boxes keep sitting exactly on
        // the border even though the visual size no longer equals the stored
        // box). centerX/centerY are where the SVG's centre goes.
        const boxLeft = (bubble.shape?.x ?? 0) * this.containerWidth;
        const boxTop = (bubble.shape?.y ?? 0) * this.containerHeight;
        const boxRight = boxLeft + (bubble.shape?.w ?? 0) * this.containerWidth;
        const boxBottom = boxTop + (bubble.shape?.h ?? 0) * this.containerHeight;
        const eps = Math.max(4, 0.02 * Math.min(this.containerWidth, this.containerHeight));
        let centerX = pos.left + grownOffsetX - bodyOffsetX * scale;
        let centerY = pos.top + grownOffsetY - bodyOffsetY * scale;
        if (tipAnchored) {
          // Authored tip: the stored box with the tail at the base scale
          // (the editor's tip before its re-measure and boost). The rendered
          // balloon's own tip, relative to its body centre, lands on it — a
          // grown or boosted body moves away from the speaker, the tip stays.
          const authoredW = boxRight - boxLeft > 1 ? boxRight - boxLeft : config.maxWidth * baseScale;
          const authoredH = boxBottom - boxTop > 1 ? boxBottom - boxTop : config.maxHeight * baseScale;
          const tip = tailConfigToTip(
            { cx: (boxLeft + boxRight) / 2, cy: (boxTop + boxBottom) / 2, width: authoredW, height: authoredH },
            { position: Number(tailOpts!.position), length: tailLength * baseScale },
            cornerRadius,
          );
          const localTip = tailConfigToTip(
            { cx: 0, cy: 0, width: result.width, height: result.height },
            { position: Number(tailOpts!.position), length: renderedTailLength },
            cornerRadius,
          );
          centerX = tip.x - (localTip.x + bodyOffsetX) * scale;
          centerY = tip.y - (localTip.y + bodyOffsetY) * scale;
        } else {
          if (boxLeft <= eps) centerX = visualW / 2;
          else if (boxRight >= this.containerWidth - eps) centerX = this.containerWidth - visualW / 2;
          if (boxTop <= eps) centerY = visualH / 2;
          else if (boxBottom >= this.containerHeight - eps) centerY = this.containerHeight - visualH / 2;
        }
        // A balloon bigger than its authored box (small screens) must not be
        // pushed across the panel border and clipped: keep it inside the panel.
        centerX = clampCenter(centerX, visualW, this.containerWidth);
        centerY = clampCenter(centerY, visualH, this.containerHeight);

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
    this.ensureFontsLoaded(fontSpecs);
  }

  /**
   * Request every font spec the balloons use that was not requested before;
   * re-render once a face that was not yet available arrives, so balloons
   * measured with a fallback face are laid out again with the real one.
   */
  private ensureFontsLoaded(specs: Set<string>): void {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const pending: Promise<unknown>[] = [];
    for (const spec of specs) {
      if (this.fontsRequested.has(spec)) continue;
      this.fontsRequested.add(spec);
      let available = false;
      try {
        available = document.fonts.check(spec);
      } catch {
        available = false;
      }
      if (available) continue;
      try {
        pending.push(document.fonts.load(spec));
      } catch {
        // Unparseable spec (custom family string): nothing to wait for.
      }
    }
    if (pending.length === 0) return;
    Promise.allSettled(pending).then((results) => {
      const loadedAny = results.some((r) => r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length > 0);
      if (loadedAny && this.initialized) {
        this.renderAllBalloons();
      }
    });
  }

  /**
   * Handle bubble click (called from template for any fallback interaction)
   */
  onBubbleClick(bubble: SpeechBubble, event: MouseEvent): void {
    event.stopPropagation();
    this.bubbleClick.emit(bubble);
  }
}
