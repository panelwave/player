/**
 * Plugin Layer Component
 * Renders plugin content in an iframe sandbox
 */

import { inject,
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { AssetUrlService } from '../../../services/asset-url.service';

import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/**
 * Plugin message interface
 */
export interface PluginMessage {
  type: string;
  data?: unknown;
}

/**
 * Plugin Layer Component
 * Embeds external content in a sandboxed iframe
 */
@Component({
    selector: 'pw-plugin-layer',
    imports: [],
    templateUrl: './plugin-layer.component.html',
    styleUrls: ['./plugin-layer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PluginLayerComponent implements OnInit, OnDestroy {
  /**
   * Plugin source URL
   */
  @Input() src = '';

  /**
   * Sandbox permissions
   */
  @Input() sandbox = 'allow-scripts';

  /**
   * Allow fullscreen
   */
  @Input() allowFullscreen = false;

  /**
   * Plugin ready
   */
  @Output() pluginReady = new EventEmitter<void>();

  /**
   * Plugin message received
   */
  @Output() pluginMessage = new EventEmitter<PluginMessage>();

  /**
   * Plugin error
   */
  @Output() pluginError = new EventEmitter<ErrorEvent>();

  /**
   * Reference to iframe element
   */
  @ViewChild('iframeElement') iframeElement?: ElementRef<HTMLIFrameElement>;

  /**
   * Sanitized source URL
   */
  safeUrl?: SafeResourceUrl;

  /**
   * Message event listener
   */
  private messageListener?: (event: MessageEvent) => void;

  private readonly sanitizer = inject(DomSanitizer);
  private readonly assetUrl = inject(AssetUrlService);

  ngOnInit(): void {
    // Setup message listener
    this.messageListener = (event: MessageEvent) => this.onMessage(event);
    window.addEventListener('message', this.messageListener);
    
    // Sanitize URL
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.getPluginUrl());
  }

  ngOnDestroy(): void {
    // Cleanup message listener
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
    }
  }

  /**
   * Full plugin URL: absolute src as-is, relative src resolved against the
   * manifest's assets.base / manifest URL (AssetUrlService).
   */
  getPluginUrl(): string {
    return this.assetUrl.resolve(this.src, 'pluginPayload');
  }

  /**
   * Handle iframe load
   */
  onLoad(): void {
    this.pluginReady.emit();
  }

  /**
   * Handle iframe error
   */
  onError(event: Event): void {
    this.pluginError.emit(event as ErrorEvent);
  }

  /**
   * Handle postMessage from plugin
   */
  private onMessage(event: MessageEvent): void {
    // Verify message origin
    const pluginUrl = this.getPluginUrl();
    if (!pluginUrl) return;

    try {
      const pluginOrigin = new URL(pluginUrl).origin;
      if (event.origin !== pluginOrigin) {
        return; // Ignore messages from other origins
      }
    } catch {
      return; // Invalid URL
    }

    // Emit plugin message
    if (event.data && typeof event.data === 'object') {
      this.pluginMessage.emit(event.data as PluginMessage);
    }
  }

  /**
   * Send message to plugin
   */
  sendMessage(message: PluginMessage): void {
    const iframe = this.iframeElement?.nativeElement;
    if (!iframe || !iframe.contentWindow) {
      console.warn('[PluginLayer] Cannot send message: iframe not ready');
      return;
    }

    const pluginUrl = this.getPluginUrl();
    if (!pluginUrl) {
      console.warn('[PluginLayer] Cannot send message: no plugin URL');
      return;
    }

    try {
      const pluginOrigin = new URL(pluginUrl).origin;
      iframe.contentWindow.postMessage(message, pluginOrigin);
    } catch (error) {
      console.error('[PluginLayer] Failed to send message:', error);
    }
  }
}
