/**
 * Panel Audio Service
 *
 * Drives the AudioEngineService from the manifest: every panel's `audio[]`
 * tracks (schema `AudioTrack`) and `kind: "audio"` layers start when the
 * panel becomes current and stop when the reader leaves it. A looping track
 * that the next panel references too keeps playing (ambience continuity);
 * one-shot tracks restart on every panel enter.
 *
 * Browser autoplay policy: a track refused before the first user gesture is
 * remembered and retried (and the AudioContext resumed) on that gesture.
 */

import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { AudioEngineService } from './audio-engine.service';
import type { AudioRole } from './audio-engine.service';
import { ManifestService } from './manifest.service';
import { UserGestureService } from './user-gesture.service';
import { evaluateJsonLogic } from '../utils/json-logic-utils';
import { resolveAssetUrl, guessMimeType } from '../utils/asset-utils';
import type {
  AssetCatalogItemAudio,
  AudioVariant,
  Panel,
  PanelAudioRole,
  PanelAudioTrack,
  VariableContext,
} from '../types';

/**
 * A manifest track resolved to something the engine can play.
 */
export interface ResolvedPanelAudio {
  /** Engine track id (asset id, suffixed when a panel references it twice). */
  id: string;
  url: string;
  role: AudioRole;
  loop: boolean;
  /** Per-track gain 0-2. */
  gain: number;
  /** Delay after panel enter, ms. */
  startAtMs: number;
}

/** Fade applied when a looping track is stopped because the panel changed. */
export const PANEL_AUDIO_LEAVE_FADE_MS = 250;

/**
 * Map a manifest role onto an engine bus. `ui` sounds share the SFX bus so
 * the SFX toggle covers them; `none` (the schema default) goes to the music
 * bus, which only the master Audio toggle silences.
 */
export function busForRole(role: PanelAudioRole | undefined): AudioRole {
  switch (role) {
    case 'ambient':
    case 'music':
    case 'voiceover':
    case 'sfx':
      return role;
    case 'ui':
      return 'sfx';
    default:
      return 'music';
  }
}

@Injectable({
  providedIn: 'root',
})
export class PanelAudioService implements OnDestroy {
  private readonly engine = inject(AudioEngineService);
  private readonly manifestService = inject(ManifestService);
  private readonly gesture = inject(UserGestureService);

  /** Tracks wanted by the current panel, by engine id. */
  private desired = new Map<string, ResolvedPanelAudio>();

  /** Pending `startAtMs` timers. */
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Tracks refused by the autoplay policy, retried on the first gesture. */
  private blocked = new Set<string>();

  /** Assets already warned about (missing / not audio), to keep the console quiet. */
  private warned = new Set<string>();

  private currentPanelId?: string;

  private readonly gestureSub: Subscription;

  constructor() {
    this.gestureSub = this.gesture.userHasInteracted$.subscribe((interacted) => {
      if (interacted) {
        this.onUserGesture();
      }
    });
  }

  ngOnDestroy(): void {
    this.gestureSub.unsubscribe();
    this.stopAll();
  }

  /**
   * Make the engine's playing set match `panel`. Call whenever the current
   * panel (or the variable context its `visibleIf` conditions depend on)
   * changes. Idempotent for an unchanged panel.
   */
  syncPanel(
    panelId: string | undefined,
    panel: Panel | undefined,
    context: VariableContext | null | undefined
  ): void {
    const panelChanged = panelId !== this.currentPanelId;
    this.currentPanelId = panelId;

    const next = this.resolve(panel, context);

    // Tracks the new panel does not want any more.
    for (const [id, prev] of this.desired) {
      if (!next.has(id)) {
        this.release(id, prev.loop ? PANEL_AUDIO_LEAVE_FADE_MS : 0);
      }
    }

    for (const [id, track] of next) {
      const prev = this.desired.get(id);
      if (prev) {
        const pending = this.timers.has(id) || this.blocked.has(id);
        const active = this.engine.isActive(id);
        // Same panel re-evaluated (variables changed): never restart, only
        // follow a gain change. Across panels a looping track continues.
        if (!panelChanged || (track.loop && (active || pending))) {
          if (active && prev.gain !== track.gain) {
            this.engine.setTrackVolume(id, track.gain);
          }
          continue;
        }
      }
      this.schedule(track);
    }

    this.desired = next;
  }

  /**
   * Stop everything this service started (shell teardown).
   */
  stopAll(): void {
    for (const id of this.desired.keys()) {
      this.release(id, 0);
    }
    this.desired.clear();
    this.currentPanelId = undefined;
  }

  /**
   * Ids of the tracks the current panel wants (started, pending or blocked).
   */
  getDesiredTrackIds(): string[] {
    return Array.from(this.desired.keys());
  }

  // ---------------------------------------------------------------------------

  private schedule(track: ResolvedPanelAudio): void {
    this.release(track.id, 0);
    if (track.startAtMs > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(track.id);
        this.start(track);
      }, track.startAtMs);
      this.timers.set(track.id, timer);
      return;
    }
    this.start(track);
  }

  private start(track: ResolvedPanelAudio): void {
    this.blocked.delete(track.id);
    this.engine
      .play({
        id: track.id,
        url: track.url,
        role: track.role,
        loop: track.loop,
        volume: track.gain,
      })
      .catch((error: unknown) => {
        if (this.isAutoplayRefusal(error) && !this.gesture.hasInteracted()) {
          this.blocked.add(track.id);
        }
      });
  }

  private release(id: string, fadeMs: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.blocked.delete(id);
    if (this.engine.isActive(id)) {
      void this.engine.stop(id, fadeMs);
    }
  }

  /**
   * First user gesture: resume a suspended context (tracks that started
   * silently become audible) and retry the refused ones.
   */
  private onUserGesture(): void {
    void this.engine.resumeContext().catch(() => undefined);
    for (const id of Array.from(this.blocked)) {
      const track = this.desired.get(id);
      this.blocked.delete(id);
      if (track) {
        this.start(track);
      }
    }
  }

  private isAutoplayRefusal(error: unknown): boolean {
    const name = (error as { name?: string } | null)?.name;
    return name === 'NotAllowedError' || name === 'AbortError';
  }

  // ---------------------------------------------------------------------------
  // Manifest resolution
  // ---------------------------------------------------------------------------

  private resolve(
    panel: Panel | undefined,
    context: VariableContext | null | undefined
  ): Map<string, ResolvedPanelAudio> {
    const result = new Map<string, ResolvedPanelAudio>();
    if (!panel) {
      return result;
    }

    const entries: PanelAudioTrack[] = [...(panel.audio ?? [])];
    for (const layer of panel.layers ?? []) {
      if (layer.kind !== 'audio' || !layer.assetId) {
        continue;
      }
      const audioLayer = layer as unknown as {
        assetId: string;
        loop?: boolean;
        gain?: number;
        volume?: number;
        startAtMs?: number;
        visibleIf?: PanelAudioTrack['visibleIf'];
      };
      entries.push({
        assetId: audioLayer.assetId,
        loop: audioLayer.loop,
        gain: audioLayer.gain ?? audioLayer.volume,
        startAtMs: audioLayer.startAtMs,
        visibleIf: audioLayer.visibleIf ?? layer.visibleIf,
      });
    }

    for (const entry of entries) {
      if (!entry?.assetId) {
        continue;
      }
      if (
        entry.visibleIf !== undefined &&
        entry.visibleIf !== null &&
        !evaluateJsonLogic(entry.visibleIf, context ?? {})
      ) {
        continue;
      }
      const resolved = this.resolveTrack(entry);
      if (!resolved) {
        continue;
      }
      // A panel referencing the same asset twice gets distinct engine ids;
      // the first occurrence keeps the bare asset id so cross-panel
      // continuity matches.
      let id = resolved.id;
      let n = 2;
      while (result.has(id)) {
        id = `${resolved.id}#${n++}`;
      }
      result.set(id, { ...resolved, id });
    }
    return result;
  }

  private resolveTrack(entry: PanelAudioTrack): ResolvedPanelAudio | null {
    const asset = this.manifestService.getAsset(entry.assetId);
    if (!asset || asset.category !== 'audio') {
      this.warnOnce(entry.assetId, asset ? 'is not an audio asset' : 'is not in the asset catalog');
      return null;
    }
    const audioAsset = asset as AssetCatalogItemAudio;
    const variant = this.pickVariant(audioAsset.variants ?? []);
    if (!variant) {
      this.warnOnce(entry.assetId, 'has no audio variants');
      return null;
    }
    const base = this.manifestService.getManifest()?.assets?.base;
    const url = resolveAssetUrl(variant.src, base, 'audio');
    if (!url) {
      return null;
    }
    return {
      id: entry.assetId,
      url,
      role: busForRole(entry.role ?? audioAsset.role),
      loop: entry.loop ?? variant.loop ?? false,
      gain: this.clampGain(entry.gain),
      startAtMs: typeof entry.startAtMs === 'number' && entry.startAtMs > 0 ? entry.startAtMs : 0,
    };
  }

  /**
   * First variant the browser reports it can play; otherwise the first one
   * (the element will surface the real error).
   */
  private pickVariant(variants: AudioVariant[]): AudioVariant | undefined {
    if (variants.length <= 1) {
      return variants[0];
    }
    const probe = this.createProbe();
    if (!probe) {
      return variants[0];
    }
    const playable = variants.find((variant) => {
      const mime = variant.mime || guessMimeType(variant.src);
      return mime ? probe.canPlayType(mime) !== '' : false;
    });
    return playable ?? variants[0];
  }

  private createProbe(): HTMLAudioElement | null {
    if (typeof document === 'undefined') {
      return null;
    }
    try {
      const element = document.createElement('audio');
      return typeof element.canPlayType === 'function' ? element : null;
    } catch {
      return null;
    }
  }

  private clampGain(gain: number | undefined): number {
    if (typeof gain !== 'number' || !isFinite(gain)) {
      return 1;
    }
    return Math.max(0, Math.min(2, gain));
  }

  private warnOnce(assetId: string, reason: string): void {
    if (this.warned.has(assetId)) {
      return;
    }
    this.warned.add(assetId);
    console.warn(`[PanelAudioService] audio asset "${assetId}" ${reason}; track skipped.`);
  }
}
