import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PlayerShellComponent } from 'player';
import type { PanelWaveManifest } from 'player';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, PlayerShellComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'PanelWave Player Demo';
  manifest: PanelWaveManifest | null = null;
  loading = true;
  error: string | null = null;

  /** Available demo manifests (the player is re-created on switch). */
  readonly demos = [
    { id: 'sample', label: 'Sample Comic', url: 'assets/sample-manifest.json' },
    {
      id: 'video-sequencing',
      label: 'Video Sequencing',
      url: 'assets/video-sequencing-manifest.json',
    },
    {
      id: 'canvas',
      label: 'Infinite Canvas',
      url: 'assets/canvas-manifest.json',
    },
  ];

  activeDemo = 'sample';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // Load an arbitrary manifest via ?manifest=<url> — e.g. a CMS preview link
    // (http://localhost:4200/api/preview/<token>/manifest). Falls back to the
    // bundled sample. The manifest endpoint sends Access-Control-Allow-Origin: *
    // so this works cross-origin (run the demo on a free port, e.g. --port 4300,
    // while the CMS frontend keeps :4200 for its /api proxy).
    const manifestUrl = new URLSearchParams(window.location.search).get('manifest');
    this.loadManifest(manifestUrl || 'assets/sample-manifest.json');
  }

  /** Switch to another demo manifest (destroys and re-creates the player). */
  selectDemo(demoId: string) {
    const demo = this.demos.find((d) => d.id === demoId);
    if (!demo || this.activeDemo === demoId) {
      return;
    }
    this.activeDemo = demoId;
    this.manifest = null;
    this.loadManifest(demo.url);
  }

  private loadManifest(url: string) {
    this.loading = true;
    this.error = null;
    this.http.get<PanelWaveManifest>(url)
      .subscribe({
        next: (manifest) => {
          this.manifest = manifest;
          this.loading = false;
          console.log('Loaded manifest:', manifest);
        },
        error: (err) => {
          this.error = `Failed to load manifest: ${err.message}`;
          this.loading = false;
          console.error('Error loading manifest:', err);
        }
      });
  }

  onPlayerReady() {
    console.log('Player is ready!');
  }

  onPanelChange(event: any) {
    console.log('Panel changed:', event);
  }

  onError(error: Error) {
    console.error('Player error:', error);
    this.error = error.message;
  }
}
