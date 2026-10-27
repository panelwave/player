/**
 * Layer Renderer Component
 * Renders individual layers based on their type
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  Layer,
  LocaleCode,
  VideoLayer,
  VideoPlayMode,
  VideoStartMode,
  AssetCatalogItemVideo,
  VideoVariant,
  ImageVariant,
} from '../../types';
import { ManifestService } from '../../services/manifest.service';
import { AssetUrlService } from '../../services/asset-url.service';
import { VideoLayerComponent, type LayerViewMode } from '../layers/video-layer/video-layer.component';
import {
  resolvePlayMode,
  resolveStartMode,
  resolveMuted,
} from '../../utils/video-config-utils';
import { selectImageVariantForWidth } from '../../utils/image-variant-utils';
import { layerBoxPercent, layerReferenceOf, type LayerReference } from '../../utils/layer-reference';
import { isWidgetLayer } from '../../types/panel.types';
import type { VariableContext } from '../../types/variable.types';
import { isLayerVisible } from '../../utils/widget-utils';

/**
 * Base text size of content widgets (schema 1.10+) in reference px: the
 * widget scales with the panel, clamped so it stays readable on a phone and
 * does not balloon on a 4K screen. Everything inside a widget is sized in em.
 */
export const WIDGET_BASE_FONT_REF = 18;
export const WIDGET_FONT_MIN_PX = 11;
export const WIDGET_FONT_MAX_PX = 20;

/**
 * Layer Renderer Component
 * Dynamically renders layers based on their kind
 */
@Component({
    selector: 'pw-layer-renderer',
    imports: [CommonModule, VideoLayerComponent],
    templateUrl: './layer-renderer.component.html',
    styleUrls: ['./layer-renderer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayerRendererComponent {
  private manifestService = inject(ManifestService);
  private readonly assetUrl = inject(AssetUrlService);

  /**
   * Layer to render
   */
  @Input() layer!: Layer;

  /**
   * All layers of the owning panel. When set, the layer is placed in the
   * panel's 1024 px reference space (utils/layer-reference): the background
   * fills the panel, other layers sit at their x/y/width/height in percent of
   * the panel box. Without it, x/y are raw px offsets (legacy hosts).
   */
  @Input() panelLayers: readonly Layer[] | null | undefined = null;
  private referenceCache: { layers: readonly Layer[]; reference: LayerReference } | null = null;

  /**
   * Current locale for localized content
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Required display width in physical pixels for image variant selection
   * (canvas view variant-by-zoom). 0 keeps the legacy first-variant pick.
   */
  @Input() targetWidth = 0;

  /**
   * Alt text for image layers (localized)
   */
  @Input() altText = '';

  /**
   * View mode of the surrounding viewport (`on-hover` only applies to page view).
   */
  @Input() viewMode: LayerViewMode = 'panel';

  /**
   * Whether the owning panel is currently visible / current. Drives `on-view`
   * playback for video layers (sequencer surface), and makes the panel's
   * images load eagerly at high fetch priority — the current panel's art is
   * the page's largest paint, and `loading="lazy"` delayed it (Lighthouse
   * LCP 5.4 s on the demo). Every other panel stays lazy.
   */
  @Input() viewActive = false;

  /**
   * Reduced-motion preference (degrades video `on-view` to `on-click`).
   */
  @Input() reducedMotion = false;

  /**
   * Panel id the current layer belongs to (for video tracking + sequencing).
   */
  @Input() panelId = '';

  /**
   * Placement id used for page-view visibility observation (video sequencing).
   */
  @Input() placementId = '';

  /**
   * Index of the owning panel in `Page.readingOrder` (or -1). Drives video
   * sequencing order in page view.
   */
  @Input() readingOrderIndex = -1;

  /** Placement z-index (video sequencer fallback ordering). */
  @Input() placementZ = 0;

  /** Placement y position 0-1 (video sequencer fallback ordering). */
  @Input() placementY = 0;

  /** Placement x position 0-1 (video sequencer fallback ordering). */
  @Input() placementX = 0;

  /**
   * Story variables for `visibleIf` (content widget layers, schema 1.10+).
   * Without a context every layer is shown.
   */
  @Input() variableContext: VariableContext | null = null;

  /**
   * Layer clicked
   */
  @Output() layerClick = new EventEmitter<{ layerId: string; x: number; y: number }>();

  /**
   * Get layer position and size styles
   */
  getLayerStyles(): Record<string, string> {
    const styles: Record<string, string> = {
      position: 'absolute',
    };

    const layer = this.layer as Record<string, unknown>;
    const reference = this.layerReference();

    if (reference) {
      const box = layerBoxPercent(this.layer, reference);
      styles['left'] = `${box.left}%`;
      styles['top'] = `${box.top}%`;
      styles['width'] = `${box.width}%`;
      styles['height'] = `${box.height}%`;
      // Text sizes are reference px too: the box is their size container.
      if (this.layer.kind === 'text') {
        styles['container-type'] = 'size';
      }
      if (this.isWidget()) {
        // Widgets: the box is a size container named pw-widget (compact
        // variants query its width); the base font scales with the box.
        styles['container-type'] = 'size';
        styles['container-name'] = 'pw-widget';
        const boxHeightRef = (box.height / 100) * reference.height;
        styles['--pw-widget-font'] = this.widgetFontSize(boxHeightRef);
      }
    } else {
      // Legacy hosts (no panelLayers): raw px offsets, full-panel size.
      styles['left'] = layer['x'] !== undefined ? `${layer['x']}px` : '0';
      styles['top'] = layer['y'] !== undefined ? `${layer['y']}px` : '0';
      styles['width'] = layer['w'] !== undefined ? `${layer['w']}px` : '100%';
      styles['height'] = layer['h'] !== undefined ? `${layer['h']}px` : '100%';
    }

    // Z-index
    if (this.layer.z !== undefined) {
      styles['z-index'] = `${this.layer.z}`;
    }

    // Opacity
    if (this.layer.opacity !== undefined) {
      styles['opacity'] = `${this.layer.opacity}`;
    }

    return styles;
  }

  /** Whether the layer is a content widget (schema 1.10+). */
  isWidget(): boolean {
    return isWidgetLayer(this.layer);
  }

  /**
   * Whether the layer is shown. Content widgets honour `visibleIf`; the
   * older kinds keep their behaviour (always rendered).
   */
  isVisible(): boolean {
    return !this.isWidget() || isLayerVisible(this.layer, this.variableContext);
  }

  /**
   * CSS font-size of a widget box `boxHeightRef` reference px tall:
   * WIDGET_BASE_FONT_REF reference px, i.e. `base × 100cqh / boxHeightRef`,
   * clamped to WIDGET_FONT_MIN_PX … WIDGET_FONT_MAX_PX. Resolved by the
   * widget's own element (the wrapper is its size container).
   */
  widgetFontSize(boxHeightRef: number): string {
    if (!(boxHeightRef > 0)) return `${WIDGET_FONT_MIN_PX + 3}px`;
    const scaled = `calc(${WIDGET_BASE_FONT_REF} * 100cqh / ${Math.round(boxHeightRef * 100) / 100})`;
    return `clamp(${WIDGET_FONT_MIN_PX}px, ${scaled}, ${WIDGET_FONT_MAX_PX}px)`;
  }

  /** Reference space of the owning panel (cached per layers array), or null. */
  private layerReference(): LayerReference | null {
    const layers = this.panelLayers;
    if (!layers || layers.length === 0) return null;
    if (this.referenceCache?.layers !== layers) {
      this.referenceCache = {
        layers,
        reference: layerReferenceOf(layers, (id) => this.manifestService.getAsset(id)),
      };
    }
    return this.referenceCache.reference;
  }

  /**
   * Get transform style
   */
  getTransformStyle(): string {
    if (!this.layer.transform) {
      return '';
    }

    const t = this.layer.transform as Record<string, unknown>;
    const transforms: string[] = [];

    if (t['translateX'] || t['translateY']) {
      transforms.push(`translate(${t['translateX'] || 0}px, ${t['translateY'] || 0}px)`);
    }

    if (t['rotate']) {
      transforms.push(`rotate(${t['rotate']}deg)`);
    }

    if (t['scale']) {
      transforms.push(`scale(${t['scale']})`);
    }

    return transforms.join(' ');
  }

  /**
   * Image source URL, resolved against the manifest's assets.base / manifest
   * URL (the <img> is rendered by this component).
   */
  getImageSrc(): string {
    if (this.layer.kind !== 'image') return '';

    // Try to get assetId first (from manifest reference)
    const assetId = (this.layer as Record<string, unknown>)['assetId'];
    if (assetId && typeof assetId === 'string') {
      const asset = this.manifestService.getAsset(assetId);
      if (asset && asset.variants && asset.variants.length > 0) {
        // Variant-by-zoom (canvas view): the smallest variant covering the
        // required display width; targetWidth 0 keeps the legacy first pick.
        const variant = selectImageVariantForWidth(
          asset.variants as ImageVariant[],
          this.targetWidth
        );
        return this.assetUrl.resolve(variant?.src ?? asset.variants[0].src, 'image');
      }
    }

    // Fall back to direct src if provided.
    const src = (this.layer as Record<string, unknown>)['src'];
    return typeof src === 'string' ? this.assetUrl.resolve(src, 'image') : '';
  }

  /**
   * Get the video catalog item for the current layer (if any).
   */
  private getVideoAsset(): AssetCatalogItemVideo | null {
    if (this.layer.kind !== 'video') return null;
    const assetId = (this.layer as Record<string, unknown>)['assetId'];
    if (assetId && typeof assetId === 'string') {
      const asset = this.manifestService.getAsset(assetId);
      if (asset && (asset as AssetCatalogItemVideo).category === 'video') {
        return asset as AssetCatalogItemVideo;
      }
    }
    return null;
  }

  /**
   * The forward (non-reverse) video variant, falling back to the first
   * variant. Single source of truth for forward-variant selection (used by
   * both {@link getVideoSrc} and {@link getVideoStreaming}).
   */
  private forwardVideoVariant(
    asset: AssetCatalogItemVideo | null
  ): VideoVariant | undefined {
    return (
      asset?.variants?.find((v) => v.direction !== 'reverse') ??
      asset?.variants?.[0]
    );
  }

  /** The reverse video variant for pingpong, if any. */
  private reverseVideoVariant(
    asset: AssetCatalogItemVideo | null
  ): VideoVariant | undefined {
    return asset?.variants?.find((v) => v.direction === 'reverse');
  }

  /**
   * Get the forward (default) video source URL. Catalog and direct-src paths
   * both return the RAW src — URL resolution (assets.base / manifest URL, and
   * skipping already-absolute URLs) is owned downstream by `pw-video-layer`
   * via AssetUrlService, so resolving here would double-apply it.
   */
  getVideoSrc(): string {
    if (this.layer.kind !== 'video') return '';

    const forward = this.forwardVideoVariant(this.getVideoAsset());
    if (forward) {
      return forward.src;
    }

    // Fall back to direct src if provided.
    const src = (this.layer as Record<string, unknown>)['src'];
    return typeof src === 'string' ? src : '';
  }

  /**
   * Get the reverse-variant URL for pingpong (empty string if none). Raw src;
   * resolved downstream by `pw-video-layer`, same as {@link getVideoSrc}.
   */
  getVideoReverseSrc(): string {
    return this.reverseVideoVariant(this.getVideoAsset())?.src ?? '';
  }

  /**
   * Get the poster URL for the video (empty string if none). Sourced from
   * the catalog asset's `poster.src` (schema 1.1+); resolved downstream by
   * `pw-video-layer` via AssetUrlService, same as `getVideoSrc()`.
   */
  getVideoPoster(): string {
    const asset = this.getVideoAsset();
    return asset?.poster?.src ?? '';
  }

  /**
   * Whether the active (forward) video variant is streaming/HLS.
   */
  getVideoStreaming(): boolean {
    return this.forwardVideoVariant(this.getVideoAsset())?.streaming === true;
  }

  /**
   * Effective video play mode (layer → settings.ui default → built-in).
   */
  getVideoPlayMode(): VideoPlayMode {
    return resolvePlayMode(this.layer as Partial<VideoLayer>, this.uiDefaults());
  }

  /**
   * Effective video start mode (layer → settings.ui default → built-in).
   */
  getVideoStartMode(): VideoStartMode {
    return resolveStartMode(this.layer as Partial<VideoLayer>, this.uiDefaults());
  }

  /**
   * Effective video muted state (layer → settings.ui default → built-in true).
   */
  getVideoMuted(): boolean {
    return resolveMuted(this.layer as Partial<VideoLayer>, this.uiDefaults());
  }

  /**
   * Effective startAtMs offset.
   */
  getVideoStartAtMs(): number {
    const value = (this.layer as Record<string, unknown>)['startAtMs'];
    return typeof value === 'number' ? value : 0;
  }

  /**
   * loopFromMs (only meaningful for playMode 'loop-from').
   */
  getVideoLoopFromMs(): number | undefined {
    const value = (this.layer as Record<string, unknown>)['loopFromMs'];
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Work-level UI defaults from the loaded manifest, if any.
   */
  private uiDefaults() {
    return this.manifestService.getManifest()?.settings?.ui;
  }

  /**
   * Get image alt text
   */
  getAltText(): string {
    // Use provided altText input first, then check layer property
    if (this.altText) {
      return this.altText;
    }
    const alt = (this.layer as Record<string, unknown>)['alt'];
    return alt ? String(alt) : '';
  }

  /**
   * Catalog asset id of the current video layer (empty string if none).
   */
  getVideoAssetId(): string {
    const assetId = (this.layer as Record<string, unknown>)['assetId'];
    return typeof assetId === 'string' ? assetId : '';
  }

  /**
   * Get video controls setting (defaults to false; native controls hidden
   * unless the layer explicitly enables them).
   */
  getVideoControls(): boolean {
    const controls = (this.layer as Record<string, unknown>)['controls'];
    return controls === true;
  }

  /**
   * Get SVG content
   */
  getSvgContent(): string {
    const svg = (this.layer as Record<string, unknown>)['svg'];
    return svg ? String(svg) : '';
  }

  /**
   * Get shape type
   */
  getShapeType(): string {
    const shape = (this.layer as Record<string, unknown>)['shape'];
    return shape ? String(shape) : '';
  }

  /**
   * Get localized text content
   */
  getTextContent(): string {
    if (this.layer.kind !== 'text') return '';
    
    const text = (this.layer as Record<string, unknown>)['text'];
    if (!text || typeof text !== 'object') return '';

    const textObj = text as Record<string, string>;

    // Try exact locale match
    if (textObj[this.locale]) {
      return textObj[this.locale];
    }

    // Try base language (e.g., 'en' from 'en-US')
    const baseLocale = this.locale.split('-')[0];
    const baseMatch = Object.keys(textObj).find(
      (key) => key.startsWith(baseLocale)
    );
    if (baseMatch) {
      return textObj[baseMatch];
    }

    // Return first available
    const firstKey = Object.keys(textObj)[0];
    return firstKey ? textObj[firstKey] : '';
  }

  /**
   * Effective TextStyle for a text layer: styleRef preset from
   * settings.typography.textStyles (schema 1.3+) merged with the layer's
   * inline `style` object (inline fields win). Unknown styleRefs are ignored.
   */
  private resolveTextStyle(): Record<string, unknown> {
    const layer = this.layer as Record<string, unknown>;
    const styleRef = layer['styleRef'];
    const preset = typeof styleRef === 'string'
      ? this.manifestService.getManifest()?.settings?.typography?.textStyles?.[styleRef]
      : undefined;
    const inline = layer['style'];
    return {
      ...(preset ?? {}),
      ...(inline && typeof inline === 'object' ? inline as Record<string, unknown> : {}),
    };
  }

  /**
   * Get text styles
   */
  getTextStyles(): Record<string, string> {
    if (this.layer.kind !== 'text') return {};

    const styles: Record<string, string> = {};
    const layer = this.layer as Record<string, unknown>;

    // Schema TextStyle (styleRef preset + inline style object) first; flat
    // editor props below keep their historical precedence and win over it.
    const textStyle = this.resolveTextStyle();
    if (textStyle['font']) {
      styles['font-family'] = textStyle['font'] as string;
    }
    if (textStyle['sizePt']) {
      styles['font-size'] = `${textStyle['sizePt']}pt`;
    }
    if (textStyle['color']) {
      styles['color'] = textStyle['color'] as string;
    }
    if (textStyle['weight']) {
      styles['font-weight'] = `${textStyle['weight']}`;
    }
    if (textStyle['align']) {
      styles['text-align'] = textStyle['align'] as string;
    }
    if (textStyle['strokeColor'] && textStyle['strokeWidth']) {
      styles['-webkit-text-stroke'] = `${textStyle['strokeWidth']}px ${textStyle['strokeColor']}`;
      styles['paint-order'] = 'stroke fill';
    }

    if (layer['fontSize']) {
      const reference = this.layerReference();
      if (reference) {
        // fontSize is reference px; the layer box (100cqh) is this many of them.
        const boxHeightRef = (layerBoxPercent(this.layer, reference).height / 100) * reference.height;
        styles['font-size'] = `calc(${layer['fontSize']} * 100cqh / ${boxHeightRef})`;
      } else {
        styles['font-size'] = `${layer['fontSize']}px`;
      }
    }

    if (layer['fontFamily']) {
      styles['font-family'] = layer['fontFamily'] as string;
    }

    if (layer['fontWeight']) {
      styles['font-weight'] = `${layer['fontWeight']}`;
    }

    if (layer['color']) {
      styles['color'] = layer['color'] as string;
    }

    if (layer['textAlign']) {
      styles['text-align'] = layer['textAlign'] as string;
    }

    if (layer['lineHeight']) {
      styles['line-height'] = `${layer['lineHeight']}`;
    }

    return styles;
  }

  /**
   * Handle layer click
   */
  onLayerClick(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.layerClick.emit({
      layerId: this.layer.id,
      x,
      y,
    });
  }

  /**
   * Wrapper click: a click inside a content widget belongs to the widget —
   * it must not reach the panel (tap-to-advance, toolbar toggle). Other
   * interactive layers emit `layerClick` as before.
   */
  onWrapperClick(event: MouseEvent): void {
    if (this.isWidget()) {
      event.stopPropagation();
      return;
    }
    if (this.isInteractive()) {
      this.onLayerClick(event);
    }
  }

  /**
   * Presses and touches inside a widget stay in the widget: the viewport
   * would otherwise start a pan/swipe (and its touchmove preventDefault
   * would stop a scroll box from scrolling), the canvas would capture the
   * pointer.
   */
  onWidgetGesture(event: Event): void {
    if (this.isWidget()) {
      event.stopPropagation();
    }
  }

  /** Wheel inside a widget scrolls the widget; Ctrl/Cmd + wheel still zooms. */
  onWidgetWheel(event: WheelEvent): void {
    if (this.isWidget() && !event.ctrlKey && !event.metaKey) {
      event.stopPropagation();
    }
  }

  /**
   * Check if layer is interactive
   */
  isInteractive(): boolean {
    // Note: 'hotspot' and 'button' are not in the current LayerKind type
    // This method is kept for future compatibility
    const kind = this.layer.kind as string;
    return kind === 'hotspot' || kind === 'button' || this.isWidget();
  }
}
