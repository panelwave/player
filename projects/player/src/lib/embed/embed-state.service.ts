import { Injectable, inject } from '@angular/core';
import { FlowEngineService } from '../services/flow-engine.service';
import { ManifestService } from '../services/manifest.service';
import { PlayerStateService } from '../services/player-state.service';
import { PreloadService } from '../services/preload.service';
import { VariableStoreService } from '../services/variable-store.service';
import type { Chapter } from '../types';
import type { PlayerShellComponent } from '../components/player-shell/player-shell.component';
import { EMBED_HISTORY_LIMIT, pickLocalized, type EmbedStateSnapshot } from './embed-protocol';

/** The parts of the shell the state snapshot reads (a fake in tests). */
export type EmbedStateShell = Pick<
  PlayerShellComponent,
  'currentChapter' | 'currentPage' | 'getCurrentPanelId' | 'coverVisible' | 'viewMode' | 'visitedPanelIds' | 'paywallVisible' | 'paywallGate'
> &
  Partial<Pick<PlayerShellComponent, 'scopedChapterId' | 'chapterCompleted' | 'autoplayRunning'>>;

/** What the host app knows beyond the shell. */
export interface EmbedStateExtras {
  entitlements?: string[] | null;
  errors?: string[];
  loadTimeMs?: number | null;
}

/**
 * Builds the bridge's `pw:state` snapshot from a shell and the player's
 * services — shared by every app that speaks the embed protocol.
 */
@Injectable({ providedIn: 'root' })
export class EmbedStateService {
  private readonly playerState = inject(PlayerStateService);
  private readonly flowEngine = inject(FlowEngineService);
  private readonly manifestService = inject(ManifestService);
  private readonly variableStore = inject(VariableStoreService);
  private readonly preloadService = inject(PreloadService);

  build(shell: EmbedStateShell | null | undefined, extras: EmbedStateExtras = {}): EmbedStateSnapshot {
    const chapter: Chapter | undefined = shell?.currentChapter;
    const chapterId = chapter?.id ?? null;
    const pageId = shell?.currentPage?.id ?? null;
    const panelId = shell?.getCurrentPanelId() ?? null;
    const locale = this.playerState.getLocale();
    const nextPanels =
      chapter?.graph && panelId
        ? this.flowEngine.getPossibleNextPanels(chapter.graph, panelId).map((id) => {
            const title = pickLocalized(this.manifestService.getPanel(id)?.panel.title, locale);
            return title ? { panelId: id, title } : { panelId: id };
          })
        : [];
    return {
      chapterId,
      pageId,
      panelId,
      viewMode: shell ? (shell.coverVisible ? 'cover' : shell.viewMode) : null,
      locale,
      entitlements: extras.entitlements ?? null,
      variables: this.variableStore.createContext(chapterId ?? undefined, pageId ?? undefined),
      history: (shell?.visitedPanelIds ?? []).slice(-EMBED_HISTORY_LIMIT),
      nextPanels,
      paywallGate: shell?.paywallVisible ? shell.paywallGate : null,
      preloadStatus: shell ? this.preloadService.getQueueStatus() : null,
      errors: [...(extras.errors ?? [])],
      loadTimeMs: extras.loadTimeMs ?? null,
      chapterScope: shell?.scopedChapterId ?? null,
      chapterComplete: shell?.chapterCompleted === true,
      autoplayActive: shell?.autoplayRunning === true,
    };
  }
}
