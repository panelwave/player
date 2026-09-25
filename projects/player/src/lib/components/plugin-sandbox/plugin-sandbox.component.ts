/**
 * Plugin Sandbox Component
 * Provides a secure container for plugin iframes
 */

import { inject,
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';

import { PluginHostService } from '../../services/plugin-host.service';
import type { PluginManifest } from '../../types/plugin.types';

@Component({
    selector: 'pw-plugin-sandbox',
    imports: [],
    template: `
    <div class="plugin-sandbox" [class.loading]="loading">
      @if (loading) {
        <div class="plugin-loading">
          <div class="spinner"></div>
          <p>Loading plugin: {{ manifest?.name }}</p>
        </div>
      }
      <div #container class="plugin-container" [class.hidden]="loading"></div>
      @if (error) {
        <div class="plugin-error">
          <p>Failed to load plugin: {{ error }}</p>
        </div>
      }
    </div>
  `,
    styles: [`
    .plugin-sandbox {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .plugin-container {
      width: 100%;
      height: 100%;
    }

    .plugin-container.hidden {
      opacity: 0;
    }

    .plugin-loading,
    .plugin-error {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }

    .spinner {
      border: 3px solid rgba(0, 0, 0, 0.1);
      border-top-color: #3498db;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .plugin-error {
      color: #e74c3c;
    }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PluginSandboxComponent implements OnInit, OnDestroy {
  @Input() manifest!: PluginManifest;
  @Output() loaded = new EventEmitter<void>();
  @Output() failed = new EventEmitter<Error>();

  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  loading = true;
  error: string | null = null;

  private readonly pluginHost = inject(PluginHostService);

  async ngOnInit() {
    try {
      await this.pluginHost.loadPlugin(this.manifest);
      await this.pluginHost.mountPlugin(
        this.manifest.id,
        this.container.nativeElement
      );
      this.loading = false;
      this.loaded.emit();
    } catch (err) {
      this.loading = false;
      this.error = (err as Error).message;
      this.failed.emit(err as Error);
    }
  }

  async ngOnDestroy() {
    try {
      await this.pluginHost.disposePlugin(this.manifest.id);
    } catch (err) {
      console.error('Failed to dispose plugin:', err);
    }
  }
}
