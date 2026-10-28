/**
 * Download layer (schema 1.10+ `kind: "download"`): a file card with a
 * file-type icon, the (localized) file name, an optional description and the
 * file size. Activating it downloads the catalog `file` asset.
 *
 * Browsers ignore the `download` attribute for cross-origin URLs, so for
 * published works the server makes the file URL download itself
 * (`Content-Disposition: attachment`); the attribute still names same-origin
 * downloads (self-hosted packages, local demos).
 */
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { NgStyle } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import type { AssetCatalogItemFile, DownloadLayer, FileVariant } from '../../../../types';
import { ManifestService } from '../../../../services/manifest.service';
import { AssetUrlService } from '../../../../services/asset-url.service';
import { WidgetPlaybackService } from '../../../../services/widget-playback.service';
import { fileTypeInfo, formatBytes, isPrintRender, type FileTypeInfo } from '../../../../utils/widget-utils';
import { PwIconComponent } from '../../../icon/pw-icon.component';
import { PrintContextService } from '../../../../services/print-context.service';
import { PrintQrComponent } from '../print-qr/print-qr.component';
import { localized, widgetRootStyles, widgetText } from '../widget-shared';

@Component({
  selector: 'pw-download-layer',
  standalone: true,
  imports: [NgStyle, PwIconComponent, PrintQrComponent],
  templateUrl: './download-layer.component.html',
  styleUrls: ['../widget-card.css', './download-layer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DownloadLayerComponent {
  private readonly manifest = inject(ManifestService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly playback = inject(WidgetPlaybackService, { optional: true });
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly printContext = inject(PrintContextService);

  @Input({ required: true }) layer!: DownloadLayer;
  @Input() locale = 'en-US';
  @Input() panelId = '';

  readonly print = isPrintRender();

  /** Print card: QR code to this panel in the online reader (null: none). */
  get printLink(): string | null {
    return this.print ? this.printContext.linkFor(this.panelId) : null;
  }

  /** Print: the file is appended to the PDF from this page on (null: not appended). */
  get attachedPage(): number | null {
    return this.print ? this.printContext.attachmentPage(this.layer?.assetId) : null;
  }

  get attachedText(): string {
    return widgetText(this.translate, 'print_attached_page', { page: this.attachedPage });
  }

  get variant(): FileVariant | null {
    const asset = this.manifest.getAsset(this.layer?.assetId ?? '') as AssetCatalogItemFile | null;
    if (!asset || asset.category !== 'file' || !asset.variants?.length) return null;
    return asset.variants.find((v) => v.locale === this.locale) ?? asset.variants.find((v) => !v.locale) ?? asset.variants[0];
  }

  get href(): string {
    const v = this.variant;
    return v ? this.assetUrl.resolve(v.src, 'file') : '';
  }

  /** Display + download name: the layer's localized name, else the file's. */
  get fileName(): string {
    const fromLayer = localized(this.layer?.fileName, this.locale).trim();
    if (fromLayer) return fromLayer;
    const v = this.variant;
    if (v?.fileName) return v.fileName;
    const src = v?.src ?? '';
    return decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '') || widgetText(this.translate, 'download');
  }

  get description(): string {
    return localized(this.layer?.description, this.locale);
  }

  get title(): string {
    return localized(this.layer?.title, this.locale);
  }

  get size(): string {
    return this.layer?.showSize === false ? '' : formatBytes(this.variant?.sizeBytes, this.locale);
  }

  get type(): FileTypeInfo {
    const v = this.variant;
    return fileTypeInfo(v?.mime, v?.fileName || this.fileName || v?.src);
  }

  get showIcon(): boolean {
    return this.layer?.showIcon !== false;
  }

  get plain(): boolean {
    return this.layer?.appearance === 'plain';
  }

  get rootStyles(): Record<string, string> {
    return widgetRootStyles(this.layer);
  }

  get ariaLabel(): string {
    const parts = [widgetText(this.translate, 'download_file', { name: this.fileName })];
    if (this.size) parts.push(this.size);
    return parts.join(', ');
  }

  text(key: string): string {
    return widgetText(this.translate, key);
  }

  onActivate(): void {
    if (!this.href || this.print) return;
    this.playback?.emit({
      type: 'download',
      layerId: this.layer.id,
      kind: 'download',
      panelId: this.panelId || undefined,
      assetId: typeof this.layer.assetId === 'string' ? this.layer.assetId : undefined,
    });
  }
}
