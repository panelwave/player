import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PlayerShellComponent } from 'player';
import type { PanelWaveManifest } from 'player';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PlayerShellComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'PanelWave Player Demo';
  manifest: PanelWaveManifest | null = null;
  loading = true;
  error: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadManifest();
  }

  private loadManifest() {
    this.http.get<PanelWaveManifest>('assets/sample-manifest.json')
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
