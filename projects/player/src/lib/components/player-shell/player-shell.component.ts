/**
 * Player Shell Component
 * Main container component that orchestrates the entire PanelWave player
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';

import type {
  PanelWaveManifest,
  Panel,
  Chapter,
  LocaleCode,
} from '../../types';

import { PlayerStateService } from '../../services/player-state.service';
import { ManifestService } from '../../services/manifest.service';
import { VariableStoreService } from '../../services/variable-store.service';
import { FlowEngineService } from '../../services/flow-engine.service';

import { ViewportComponent } from '../viewport/viewport.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { TocOverlayComponent } from '../modals/toc-overlay/toc-overlay.component';
import { SettingsModalComponent } from '../modals/settings-modal/settings-modal.component';
import { CharacterRosterComponent } from '../modals/character-roster/character-roster.component';
import { CharacterSheetComponent } from '../modals/character-sheet/character-sheet.component';
import { ExtrasViewerComponent } from '../modals/extras-viewer/extras-viewer.component';
import { ShareModalComponent } from '../modals/share-modal/share-modal.component';
import { CommentsDrawerComponent } from '../modals/comments-drawer/comments-drawer.component';

/**
 * Entitlement adapter interface
 * Provides entitlement and paywall functionality
 */
export interface EntitlementAdapter {
  /**
   * Check if user has access to a specific panel
   */
  hasAccess(panelId: string): Promise<boolean>;

  /**
   * Get entitlement context
   */
  getContext(): Promise<Record<string, unknown>>;

  /**
   * Handle purchase flow
   */
  purchase?(productId: string): Promise<boolean>;
}

/**
 * Player Shell Component
 * Main orchestrator for the PanelWave player
 */
@Component({
  selector: 'pw-player-shell',
  standalone: true,
  imports: [
    CommonModule,
    ViewportComponent,
    ToolbarComponent,
    TocOverlayComponent,
    SettingsModalComponent,
    CharacterRosterComponent,
    CharacterSheetComponent,
    ExtrasViewerComponent,
    ShareModalComponent,
    CommentsDrawerComponent,
  ],
  templateUrl: './player-shell.component.html',
  styleUrls: ['./player-shell.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerShellComponent implements OnInit, OnDestroy {
  /**
   * Manifest to load
   */
  @Input() manifest?: PanelWaveManifest;

  /**
   * Manifest URL (alternative to providing manifest directly)
   */
  @Input() manifestUrl?: string;

  /**
   * Entitlement adapter for paywall integration
   */
  @Input() entitlementAdapter?: EntitlementAdapter;

  /**
   * Initial locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Initial chapter ID
   */
  @Input() initialChapterId?: string;

  /**
   * Initial panel ID
   */
  @Input() initialPanelId?: string;

  /**
   * Enable autoplay
   */
  @Input() autoplay = false;

  /**
   * Seconds per panel in autoplay mode
   */
  @Input() secondsPerPanel = 5;

  /**
   * Enable reduced motion
   */
  @Input() reducedMotion = false;

  /**
   * Show toolbar by default
   */
  @Input() showToolbar = false;

  /**
   * Player ready
   */
  @Output() ready = new EventEmitter<void>();

  /**
   * Panel changed
   */
  @Output() panelChange = new EventEmitter<{ panel: Panel; chapter: Chapter }>();

  /**
   * Chapter changed
   */
  @Output() chapterChange = new EventEmitter<Chapter>();

  /**
   * Error occurred
   */
  @Output() error = new EventEmitter<Error>();

  /**
   * Locale changed
   */
  @Output() localeChange = new EventEmitter<LocaleCode>();

  /**
   * Variable changed
   */
  @Output() variableChange = new EventEmitter<{ key: string; value: unknown }>();

  /**
   * Navigation attempted
   */
  @Output() navigationAttempt = new EventEmitter<{ direction: 'next' | 'previous' | 'panel'; target?: string }>();

  /**
   * Destroy subject
   */
  private destroy$ = new Subject<void>();

  /**
   * Loading state
   */
  loading = true;

  /**
   * Error state
   */
  hasError = false;

  /**
   * Error message
   */
  errorMessage = '';

  /**
   * Current panel
   */
  currentPanel?: Panel;

  /**
   * Current chapter
   */
  currentChapter?: Chapter;

  /**
   * Toolbar visibility
   */
  toolbarVisible = false;

  /**
   * Modal visibility states
   */
  tocVisible = false;
  settingsVisible = false;
  charactersVisible = false;
  characterSheetVisible = false;
  extrasVisible = false;
  shareVisible = false;
  commentsVisible = false;

  /**
   * Selected character for detail view
   */
  selectedCharacterId?: string;

  /**
   * View mode
   */
  viewMode: 'page' | 'panel' = 'panel';

  /**
   * Autoplay timer
   */
  private autoplayTimer?: ReturnType<typeof setTimeout>;

  /**
   * Autoplay enabled state
   */
  autoplayEnabled = false;

  constructor(
    private playerState: PlayerStateService,
    private manifestService: ManifestService,
    private variableStore: VariableStoreService,
    private flowEngine: FlowEngineService
  ) {}

  /**
   * Initialize component
   */
  ngOnInit(): void {
    this.toolbarVisible = this.showToolbar;
    this.initializePlayer();
  }

  /**
   * Cleanup on destroy
   */
  ngOnDestroy(): void {
    this.stopAutoplay();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize player
   */
  private async initializePlayer(): Promise<void> {
    try {
      this.loading = true;

      // Load manifest
      if (this.manifestUrl) {
        await this.loadManifestFromUrl(this.manifestUrl);
      } else if (this.manifest) {
        await this.manifestService.loadManifestFromObject(this.manifest).toPromise();
      } else {
        throw new Error('No manifest or manifestUrl provided');
      }

      // Initialize entitlement context
      if (this.entitlementAdapter) {
        const context = await this.entitlementAdapter.getContext();
        Object.entries(context).forEach(([key, value]) => {
          this.variableStore.set(key, value, 'global');
        });
      }

      // Set initial locale
      this.playerState.setLocale(this.locale);

      // Navigate to initial position
      if (this.initialChapterId && this.initialPanelId) {
        await this.navigateToPanel(this.initialChapterId, this.initialPanelId);
      } else if (this.initialChapterId) {
        await this.navigateToChapter(this.initialChapterId);
      } else {
        await this.navigateToStart();
      }

      // Subscribe to state changes
      this.subscribeToStateChanges();

      this.loading = false;
      this.ready.emit();
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Load manifest from URL
   */
  private async loadManifestFromUrl(url: string): Promise<void> {
    // In a real implementation, this would fetch the manifest
    // For now, we'll throw an error to indicate it's not implemented
    throw new Error('Manifest URL loading not yet implemented');
  }

  /**
   * Subscribe to state changes
   */
  private subscribeToStateChanges(): void {
    // Listen to panel changes
    this.playerState.currentPanel$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panel) => {
        if (panel && this.currentChapter) {
          this.currentPanel = panel;
          this.panelChange.emit({ panel, chapter: this.currentChapter });
        }
      });

    // Listen to locale changes
    this.playerState.locale$
      .pipe(takeUntil(this.destroy$))
      .subscribe((locale) => {
        this.localeChange.emit(locale);
      });
  }

  /**
   * Navigate to start
   */
  private async navigateToStart(): Promise<void> {
    const manifest = this.manifestService.getManifest();
    if (!manifest) {
      throw new Error('No manifest loaded');
    }

    // Get first chapter
    const firstChapter = manifest.chapters[0];
    if (!firstChapter) {
      throw new Error('No chapters in manifest');
    }

    await this.navigateToChapter(firstChapter.id);
  }

  /**
   * Navigate to chapter
   */
  async navigateToChapter(chapterId: string): Promise<void> {
    try {
      const chapter = this.manifestService.getChapter(chapterId);
      if (!chapter) {
        throw new Error(`Chapter not found: ${chapterId}`);
      }

      this.currentChapter = chapter;
      this.chapterChange.emit(chapter);

      // Get first panel in chapter from graph entry
      const entry = this.flowEngine.getEntry(chapter.graph);
      const firstPanelId = typeof entry === 'string' ? entry : entry[0];
      if (firstPanelId) {
        const panelData = this.manifestService.getPanel(firstPanelId);
        if (panelData) {
          this.playerState.setCurrentPanel(panelData.panel);
          this.currentPanel = panelData.panel;
        }
      }
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Navigate to panel
   */
  async navigateToPanel(chapterId: string, panelId: string): Promise<void> {
    try {
      // Check entitlement
      if (this.entitlementAdapter) {
        const hasAccess = await this.entitlementAdapter.hasAccess(panelId);
        if (!hasAccess) {
          throw new Error(`Access denied to panel: ${panelId}`);
        }
      }

      const chapter = this.manifestService.getChapter(chapterId);
      if (!chapter) {
        throw new Error(`Chapter not found: ${chapterId}`);
      }

      const panelData = this.manifestService.getPanel(panelId);
      if (!panelData) {
        throw new Error(`Panel not found: ${panelId}`);
      }

      this.currentChapter = chapter;
      this.currentPanel = panelData.panel;
      this.playerState.setCurrentPanel(panelData.panel);

      this.panelChange.emit({ panel: panelData.panel, chapter });
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Navigate to next panel
   */
  async navigateNext(): Promise<void> {
    if (!this.currentChapter || !this.currentPanel) {
      return;
    }

    this.navigationAttempt.emit({ direction: 'next' });

    try {
      const context = this.variableStore.createContext(this.currentChapter.id);
      const currentPanelId = this.getCurrentPanelId();
      if (!currentPanelId) return;

      const result = this.flowEngine.getNextPanel(
        this.currentChapter.graph,
        currentPanelId,
        context
      );

      if (result.nextPanelId) {
        await this.navigateToPanel(this.currentChapter.id, result.nextPanelId);
      }
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Navigate to previous panel
   */
  async navigatePrevious(): Promise<void> {
    if (!this.currentChapter || !this.currentPanel) {
      return;
    }

    this.navigationAttempt.emit({ direction: 'previous' });

    try {
      const currentPanelId = this.getCurrentPanelId();
      if (!currentPanelId) return;

      const previousPanels = this.flowEngine.getPreviousPanels(
        this.currentChapter.graph,
        currentPanelId
      );

      if (previousPanels.length > 0) {
        // Navigate to the first previous panel
        await this.navigateToPanel(this.currentChapter.id, previousPanels[0]);
      }
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Toggle toolbar visibility
   */
  toggleToolbar(): void {
    this.toolbarVisible = !this.toolbarVisible;
  }

  /**
   * Show toolbar
   */
  showToolbarTemporarily(): void {
    this.toolbarVisible = true;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (this.toolbarVisible) {
        this.toolbarVisible = false;
      }
    }, 5000);
  }

  /**
   * Change locale
   */
  changeLocale(locale: LocaleCode): void {
    this.playerState.setLocale(locale);
  }

  /**
   * Set variable
   */
  setVariable(key: string, value: unknown, scope: 'global' | 'chapter' | 'page' | 'session' | 'persistent' = 'session'): void {
    this.variableStore.set(key, value, scope);
    this.variableChange.emit({ key, value });
  }

  /**
   * Get variable
   */
  getVariable(key: string, scope: 'global' | 'chapter' | 'page' | 'session' | 'persistent' = 'session', scopeId?: string): unknown {
    return this.variableStore.get(key, scope, scopeId);
  }

  /**
   * Get current panel ID
   */
  private getCurrentPanelId(): string | null {
    if (!this.currentPanel || !this.currentChapter) return null;
    
    // Find the panel ID by searching in the chapter's panels
    for (const [panelId, panel] of Object.entries(this.currentChapter.panels)) {
      if (panel === this.currentPanel) {
        return panelId;
      }
    }
    
    return null;
  }

  /**
   * Handle error
   */
  private handleError(err: Error): void {
    console.error('Player error:', err);
    this.hasError = true;
    this.errorMessage = err.message;
    this.loading = false;
    this.error.emit(err);
  }

  /**
   * Toolbar event handlers
   */
  onToggleView(): void {
    this.viewMode = this.viewMode === 'panel' ? 'page' : 'panel';
    console.log('View mode:', this.viewMode);
  }

  onLocaleChange(locale: LocaleCode): void {
    this.playerState.setLocale(locale);
    console.log('Locale changed to:', locale);
  }

  onToggleSpeech(): void {
    console.log('Toggle speech bubbles - not yet implemented');
  }

  onToggleAudio(): void {
    console.log('Toggle audio - not yet implemented');
  }

  onToggleSfx(): void {
    console.log('Toggle SFX - not yet implemented');
  }

  onToggleAutoplay(): void {
    this.autoplayEnabled = !this.autoplayEnabled;
    
    if (this.autoplayEnabled) {
      this.startAutoplay();
    } else {
      this.stopAutoplay();
    }
  }

  onSecondsPerPanelChange(seconds: number): void {
    this.secondsPerPanel = seconds;
    
    // Restart autoplay if active to apply new timing
    if (this.autoplayEnabled) {
      this.stopAutoplay();
      this.startAutoplay();
    }
  }

  onToggleThumbnails(): void {
    console.log('Toggle thumbnails - not yet implemented');
  }

  onOpenToc(): void {
    this.tocVisible = true;
  }

  onOpenSettings(): void {
    this.settingsVisible = true;
  }

  onOpenCharacters(): void {
    this.charactersVisible = true;
  }

  onCycleAlternative(): void {
    console.log('Cycle alternative panels - not yet implemented');
  }

  onShowBranches(): void {
    console.log('Show branch choices - not yet implemented');
  }

  onOpenExtras(): void {
    this.extrasVisible = true;
  }

  onLike(): void {
    console.log('Like action - not yet implemented');
  }

  onBookmark(): void {
    console.log('Bookmark action - not yet implemented');
  }

  onShare(): void {
    this.shareVisible = true;
  }

  onOpenComments(): void {
    this.commentsVisible = true;
  }

  /**
   * Modal close handlers
   */
  onTocClose(): void {
    this.tocVisible = false;
  }

  onSettingsClose(): void {
    this.settingsVisible = false;
  }

  onCharactersClose(): void {
    this.charactersVisible = false;
    this.selectedCharacterId = undefined;
  }

  onCharacterSheetClose(): void {
    this.characterSheetVisible = false;
    this.selectedCharacterId = undefined;
  }

  onExtrasClose(): void {
    this.extrasVisible = false;
  }

  onShareClose(): void {
    this.shareVisible = false;
  }

  onCommentsClose(): void {
    this.commentsVisible = false;
  }

  /**
   * Handle character selection
   */
  onCharacterSelect(character: { id: string }): void {
    this.selectedCharacterId = character.id;
    this.charactersVisible = false;
    this.characterSheetVisible = true;
  }

  /**
   * Handle ToC navigation
   */
  onTocNavigate(target: { chapterId: string; panelId?: string }): void {
    this.tocVisible = false;
    if (target.panelId) {
      this.navigateToPanel(target.chapterId, target.panelId);
    } else {
      this.navigateToChapter(target.chapterId);
    }
  }

  /**
   * Keyboard shortcut handler
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    // Don't handle if user is typing in an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.navigateNext();
        break;

      case 'ArrowLeft':
        event.preventDefault();
        this.navigatePrevious();
        break;

      case 't':
      case 'T':
        event.preventDefault();
        this.toggleToolbar();
        break;

      case 'Escape':
        event.preventDefault();
        if (this.toolbarVisible) {
          this.toolbarVisible = false;
        }
        break;
    }
  }

  /**
   * Handle viewport click
   */
  onViewportClick(): void {
    this.showToolbarTemporarily();
  }

  /**
   * Start autoplay
   */
  private startAutoplay(): void {
    this.stopAutoplay(); // Clear any existing timer
    
    this.autoplayTimer = setTimeout(() => {
      this.navigateNext();
      
      // Continue autoplay if still enabled
      if (this.autoplayEnabled) {
        this.startAutoplay();
      }
    }, this.secondsPerPanel * 1000);
  }

  /**
   * Stop autoplay
   */
  private stopAutoplay(): void {
    if (this.autoplayTimer) {
      clearTimeout(this.autoplayTimer);
      this.autoplayTimer = undefined;
    }
  }
}
