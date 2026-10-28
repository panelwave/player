/**
 * Video player layer (schema 1.10+ `kind: "videoPlayer"`): on the panel the
 * poster with a play badge, the title and the duration (`trigger: "poster"`,
 * default) or a themed button (`trigger: "button"`). Activating it asks the
 * shell to open the video modal (`pw-video-modal`), which plays the video
 * with its own controls. Unlike `kind: "video"` it is not part of the
 * artwork and never plays on the panel itself.
 */
import { ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
import { NgStyle } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import type { AssetCatalogItemVideo, VideoPlayerLayer } from '../../../../types';
import { ManifestService } from '../../../../services/manifest.service';
import { AssetUrlService } from '../../../../services/asset-url.service';
import { WidgetPlaybackService } from '../../../../services/widget-playback.service';
import { formatMediaTime, isPrintRender } from '../../../../utils/widget-utils';
import { PwIconComponent } from '../../../icon/pw-icon.component';
import { PrintContextService } from '../../../../services/print-context.service';
import { PrintQrComponent } from '../print-qr/print-qr.component';
import { localized, widgetRootStyles, widgetText } from '../widget-shared';

@Component({
  selector: 'pw-video-player-layer',
  standalone: true,
  imports: [NgStyle, PwIconComponent, PrintQrComponent],
  templateUrl: './video-player-layer.component.html',
  styleUrls: ['../widget-card.css', './video-player-layer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayerLayerComponent {
  private readonly manifest = inject(ManifestService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly playback = inject(WidgetPlaybackService, { optional: true });
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly printContext = inject(PrintContextService);

  @Input({ required: true }) layer!: VideoPlayerLayer;
  @Input() locale = 'en-US';
  @Input() panelId = '';

  @ViewChild('trigger') triggerRef?: ElementRef<HTMLElement>;

  readonly print = isPrintRender();

  /** Print card: QR code to this panel in the online reader (null: none). */
  get printLink(): string | null {
    return this.print ? this.printContext.linkFor(this.panelId) : null;
  }

  get printLabel(): string {
    return widgetText(this.translate, 'print_scan_watch');
  }

  get asset(): AssetCatalogItemVideo | null {
    const a = this.manifest.getAsset(this.layer?.assetId ?? '') as AssetCatalogItemVideo | null;
    return a && a.category === 'video' ? a : null;
  }

  get poster(): string {
    const src = this.asset?.poster?.src;
    return src ? this.assetUrl.resolve(src, 'image') : '';
  }

  get title(): string {
    return localized(this.layer?.title, this.locale);
  }

  get duration(): string {
    if (this.layer?.showDuration === false) return '';
    const ms = this.asset?.durationMs ?? 0;
    return ms > 0 ? formatMediaTime(ms / 1000) : '';
  }

  get usePoster(): boolean {
    return (this.layer?.trigger ?? 'poster') === 'poster';
  }

  get plain(): boolean {
    return this.layer?.appearance === 'plain';
  }

  get rootStyles(): Record<string, string> {
    return widgetRootStyles(this.layer);
  }

  get available(): boolean {
    return !!this.asset?.variants?.length;
  }

  get ariaLabel(): string {
    const label = this.title
      ? widgetText(this.translate, 'watch_video', { title: this.title })
      : widgetText(this.translate, 'video');
    return this.duration ? `${label} (${this.duration})` : label;
  }

  open(): void {
    if (this.print || !this.available || !this.playback) return;
    this.playback.openVideo({
      layer: this.layer,
      panelId: this.panelId,
      returnFocus: this.triggerRef?.nativeElement ?? null,
    });
  }
}
