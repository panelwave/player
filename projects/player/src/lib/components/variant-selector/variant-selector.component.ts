/**
 * Variant Selector Component
 * UI for manually cycling through variants during development/testing
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
} from '@angular/core';

import { VariantService } from '../../services/variant.service';
import type {
  VariantGroup,
  PanelVariant,
  LayerVariant,
  VariantContext,
} from '../../types/variant.types';
import { Subject, takeUntil } from 'rxjs';
import { PwIconComponent } from '../icon/pw-icon.component';

@Component({
    selector: 'pw-variant-selector',
    imports: [PwIconComponent],
    template: `
    <div class="variant-selector" [class.visible]="visible">
      <div class="selector-header">
        <h3>Variant Selector</h3>
        <button class="close-btn" (click)="onClose()" aria-label="Close"><pw-icon name="lucideX" /></button>
      </div>

      <div class="selector-content">
        @if (variantGroup) {
          <div class="group-info">
            <h4>{{ variantGroup.name }}</h4>
            @if (variantGroup.description) {
              <p class="description">{{ variantGroup.description }}</p>
            }
            <span class="mode-badge">Mode: {{ variantGroup.mode }}</span>
          </div>

          <div class="variants-list">
            @for (variant of variantGroup.variants; track variant.id) {
              <div 
                class="variant-item"
                [class.selected]="selectedVariantId === variant.id"
                [class.matched]="isVariantMatched(variant)"
                (click)="selectVariant(variant)">
                <div class="variant-header">
                  <span class="variant-name">{{ variant.name }}</span>
                  <span class="variant-priority">P{{ variant.priority }}</span>
                </div>
                <div class="variant-condition">
                  {{ getConditionSummary(variant.condition) }}
                </div>
                @if (isVariantMatched(variant)) {
                  <span class="match-indicator"><pw-icon name="lucideCheck" /> Matches</span>
                }
              </div>
            }
          </div>

          <div class="context-info">
            <h5>Current Context</h5>
            <dl>
              @if (context.userAge !== undefined) {
                <dt>Age:</dt>
                <dd>{{ context.userAge }}</dd>
              }
              <dt>Choices:</dt>
              <dd>{{ context.choiceHistory.length }} made</dd>
              <dt>Playthrough:</dt>
              <dd>{{ context.playthroughCount }}</dd>
              <dt>Achievements:</dt>
              <dd>{{ context.achievements.length }}</dd>
            </dl>
          </div>

          <div class="selector-actions">
            <button class="action-btn" (click)="autoSelect()">
              Auto Select
            </button>
            <button class="action-btn secondary" (click)="clearSelection()">
              Clear
            </button>
          </div>
        } @else {
          <div class="no-group">
            <p>No variant group provided</p>
          </div>
        }
      </div>
    </div>
  `,
    styles: [`
    .variant-selector {
      position: fixed;
      right: 20px;
      top: 20px;
      width: 350px;
      max-height: 80vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      z-index: 1000;
      transform: translateX(400px);
      transition: transform 0.3s ease;
    }

    .variant-selector.visible {
      transform: translateX(0);
    }

    .selector-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .selector-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .close-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .selector-content {
      padding: 16px;
      max-height: calc(80vh - 60px);
      overflow-y: auto;
    }

    .group-info {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e0e0e0;
    }

    .group-info h4 {
      margin: 0 0 8px;
      font-size: 16px;
      color: #333;
    }

    .description {
      margin: 0 0 8px;
      font-size: 14px;
      color: #666;
    }

    .mode-badge {
      display: inline-block;
      background: #f0f0f0;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      color: #666;
    }

    .variants-list {
      margin-bottom: 16px;
    }

    .variant-item {
      padding: 12px;
      margin-bottom: 8px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .variant-item:hover {
      border-color: #667eea;
      background: #f8f9ff;
    }

    .variant-item.selected {
      border-color: #667eea;
      background: #f0f3ff;
    }

    .variant-item.matched {
      border-color: #4caf50;
    }

    .variant-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .variant-name {
      font-weight: 600;
      color: #333;
    }

    .variant-priority {
      background: #667eea;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .variant-condition {
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
    }

    .match-indicator {
      display: inline-block;
      background: #4caf50;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .context-info {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .context-info h5 {
      margin: 0 0 8px;
      font-size: 14px;
      color: #333;
    }

    .context-info dl {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 4px;
      margin: 0;
      font-size: 13px;
    }

    .context-info dt {
      font-weight: 600;
      color: #666;
    }

    .context-info dd {
      margin: 0;
      color: #333;
    }

    .selector-actions {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 6px;
      background: #667eea;
      color: white;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .action-btn:hover {
      opacity: 0.9;
    }

    .action-btn.secondary {
      background: #ccc;
      color: #333;
    }

    .no-group {
      padding: 40px 20px;
      text-align: center;
      color: #999;
    }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VariantSelectorComponent implements OnInit, OnDestroy {
  @Input() visible = false;
  @Input() variantGroup?: VariantGroup;
  @Output() variantSelected = new EventEmitter<PanelVariant | LayerVariant>();
  @Output() close = new EventEmitter<void>();

  selectedVariantId?: string;
  context: VariantContext = {
    choiceHistory: [],
    variables: {},
    playthroughCount: 0,
    achievements: [],
  };

  private destroy$ = new Subject<void>();
  private matchedVariants = new Set<string>();

  constructor(private variantService: VariantService) {}

  ngOnInit() {
    // Subscribe to context updates
    this.variantService
      .getContext$()
      .pipe(takeUntil(this.destroy$))
      .subscribe((context) => {
        this.context = context;
        this.updateMatchedVariants();
      });

    this.updateMatchedVariants();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectVariant(variant: PanelVariant | LayerVariant) {
    this.selectedVariantId = variant.id;
    this.variantSelected.emit(variant);
  }

  autoSelect() {
    if (!this.variantGroup) {
      return;
    }

    const result = this.variantService.selectVariant(this.variantGroup);
    if (result.selectedVariant) {
      this.selectVariant(result.selectedVariant);
    }
  }

  clearSelection() {
    this.selectedVariantId = undefined;
    this.variantSelected.emit(undefined);
  }

  onClose() {
    this.close.emit();
  }

  isVariantMatched(variant: PanelVariant | LayerVariant): boolean {
    return this.matchedVariants.has(variant.id);
  }

  getConditionSummary(condition: any): string {
    const parts: string[] = [];

    if (condition.type === 'always') {
      return 'Always applies';
    }

    if (condition.type === 'age') {
      if (condition.minAge) parts.push(`Age ≥ ${condition.minAge}`);
      if (condition.maxAge) parts.push(`Age ≤ ${condition.maxAge}`);
    }

    if (condition.type === 'choice') {
      if (condition.requiredChoices?.length) {
        parts.push(`Requires: ${condition.requiredChoices.join(', ')}`);
      }
      if (condition.excludedChoices?.length) {
        parts.push(`Excludes: ${condition.excludedChoices.join(', ')}`);
      }
    }

    if (condition.type === 'variable') {
      parts.push(`${condition.variableKey} ${condition.variableOperator || 'eq'} ${condition.variableValue}`);
    }

    if (condition.type === 'random') {
      parts.push(`Random (${(condition.probability || 0.5) * 100}%)`);
    }

    if (condition.type === 'playthrough') {
      if (condition.playthroughMin) parts.push(`Playthrough ≥ ${condition.playthroughMin}`);
      if (condition.playthroughMax) parts.push(`Playthrough ≤ ${condition.playthroughMax}`);
    }

    if (condition.type === 'achievement') {
      if (condition.requiredAchievements?.length) {
        parts.push(`Achievements: ${condition.requiredAchievements.join(', ')}`);
      }
    }

    if (condition.and) {
      parts.push(`AND(${condition.and.length} conditions)`);
    }

    if (condition.or) {
      parts.push(`OR(${condition.or.length} conditions)`);
    }

    return parts.join(' • ') || `Type: ${condition.type}`;
  }

  private updateMatchedVariants() {
    this.matchedVariants.clear();

    if (!this.variantGroup) {
      return;
    }

    for (const variant of this.variantGroup.variants) {
      const result = this.variantService.evaluateVariant(variant, this.context);
      if (result.matched) {
        this.matchedVariants.add(variant.id);
      }
    }
  }
}
