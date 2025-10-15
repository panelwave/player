/**
 * Variant Service
 * Manages variant selection and application based on conditions
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type {
  VariantCondition,
  VariantContext,
  VariantEvaluationResult,
  VariantSelectionResult,
  PanelVariant,
  LayerVariant,
  VariantGroup,
  VariantConfig,
  VariantHistoryEntry,
  VariantOverride,
} from '../types/variant.types';
import type { Panel, Layer } from '../types';

/**
 * Variant Service
 * Handles variant selection and conditional content
 */
@Injectable({
  providedIn: 'root',
})
export class VariantService {
  /**
   * Service configuration
   */
  private config: VariantConfig = {
    enabled: true,
    allowManualOverride: false,
    debugMode: false,
    logSelections: false,
  };

  /**
   * Current variant context
   */
  private context$ = new BehaviorSubject<VariantContext>({
    choiceHistory: [],
    variables: {},
    playthroughCount: 0,
    achievements: [],
  });

  /**
   * Variant history
   */
  private history: VariantHistoryEntry[] = [];

  /**
   * Manual overrides
   */
  private manualOverrides = new Map<string, string>(); // panelId -> variantId

  /**
   * Applied overrides
   */
  private appliedOverrides: VariantOverride[] = [];

  /**
   * Configure variant system
   */
  configure(config: Partial<VariantConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): VariantConfig {
    return { ...this.config };
  }

  /**
   * Update variant context
   */
  updateContext(updates: Partial<VariantContext>): void {
    const current = this.context$.value;
    this.context$.next({ ...current, ...updates });
  }

  /**
   * Get variant context
   */
  getContext(): VariantContext {
    return { ...this.context$.value };
  }

  /**
   * Get variant context observable
   */
  getContext$(): Observable<VariantContext> {
    return this.context$.asObservable();
  }

  /**
   * Select variant from group
   */
  selectVariant(
    group: VariantGroup,
    context?: Partial<VariantContext>
  ): VariantSelectionResult {
    if (!this.config.enabled) {
      return {
        matchedVariants: [],
        appliedOverrides: null,
      };
    }

    const evalContext = context
      ? { ...this.context$.value, ...context }
      : this.context$.value;

    // Evaluate all variants
    const evaluations: VariantEvaluationResult[] = group.variants.map(
      (variant) => this.evaluateVariant(variant, evalContext)
    );

    // Filter matched variants
    const matched = evaluations.filter((e) => e.matched);

    if (matched.length === 0) {
      // No matches, use default if available
      if (group.defaultVariant) {
        const defaultVar = group.variants.find((v) => v.id === group.defaultVariant);
        if (defaultVar) {
          return {
            selectedVariant: defaultVar,
            matchedVariants: evaluations,
            appliedOverrides: this.getVariantOverrides(defaultVar),
          };
        }
      }
      return {
        matchedVariants: evaluations,
        appliedOverrides: null,
      };
    }

    // Select based on mode
    let selected: VariantEvaluationResult | undefined;

    switch (group.mode) {
      case 'first-match':
        selected = matched[0];
        break;

      case 'highest-priority':
        selected = matched.reduce((highest, current) =>
          current.priority > highest.priority ? current : highest
        );
        break;

      case 'random-match':
        selected = matched[Math.floor(Math.random() * matched.length)];
        break;
    }

    if (!selected) {
      return {
        matchedVariants: evaluations,
        appliedOverrides: null,
      };
    }

    const selectedVariant = group.variants.find((v) => v.id === selected!.variantId);

    if (this.config.logSelections && selectedVariant) {
      this.logSelection(selectedVariant, evalContext);
    }

    return {
      selectedVariant,
      matchedVariants: evaluations,
      appliedOverrides: selectedVariant
        ? this.getVariantOverrides(selectedVariant)
        : null,
    };
  }

  /**
   * Evaluate single variant condition
   */
  evaluateVariant(
    variant: PanelVariant | LayerVariant,
    context: VariantContext
  ): VariantEvaluationResult {
    const matched = this.evaluateCondition(variant.condition, context);

    return {
      matched,
      variantId: variant.id,
      priority: variant.priority,
      reason: matched ? 'Condition satisfied' : 'Condition not satisfied',
    };
  }

  /**
   * Evaluate condition
   */
  evaluateCondition(
    condition: VariantCondition,
    context: VariantContext
  ): boolean {
    // Handle logical operators
    if (condition.and) {
      return condition.and.every((c) => this.evaluateCondition(c, context));
    }

    if (condition.or) {
      return condition.or.some((c) => this.evaluateCondition(c, context));
    }

    if (condition.not) {
      return !this.evaluateCondition(condition.not, context);
    }

    // Evaluate specific condition type
    switch (condition.type) {
      case 'always':
        return true;

      case 'age':
        return this.evaluateAgeCondition(condition, context);

      case 'choice':
        return this.evaluateChoiceCondition(condition, context);

      case 'variable':
        return this.evaluateVariableCondition(condition, context);

      case 'random':
        return this.evaluateRandomCondition(condition, context);

      case 'time':
        return this.evaluateTimeCondition(condition, context);

      case 'playthrough':
        return this.evaluatePlaythroughCondition(condition, context);

      case 'achievement':
        return this.evaluateAchievementCondition(condition, context);

      default:
        return false;
    }
  }

  /**
   * Evaluate age condition
   */
  private evaluateAgeCondition(
    condition: VariantCondition,
    context: VariantContext
  ): boolean {
    if (context.userAge === undefined) {
      return false;
    }

    if (condition.minAge !== undefined && context.userAge < condition.minAge) {
      return false;
    }

    if (condition.maxAge !== undefined && context.userAge > condition.maxAge) {
      return false;
    }

    return true;
  }

  /**
   * Evaluate choice condition
   */
  private evaluateChoiceCondition(
    condition: VariantCondition,
    context: VariantContext
  ): boolean {
    // Check required choices
    if (condition.requiredChoices) {
      const hasAllRequired = condition.requiredChoices.every((choiceId) =>
        context.choiceHistory.includes(choiceId)
      );
      if (!hasAllRequired) {
        return false;
      }
    }

    // Check excluded choices
    if (condition.excludedChoices) {
      const hasExcluded = condition.excludedChoices.some((choiceId) =>
        context.choiceHistory.includes(choiceId)
      );
      if (hasExcluded) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate variable condition
   */
  private evaluateVariableCondition(
    condition: VariantCondition,
    context: VariantContext
  ): boolean {
    if (!condition.variableKey) {
      return false;
    }

    const value = context.variables[condition.variableKey];
    const compareValue = condition.variableValue;
    const operator = condition.variableOperator || 'eq';

    switch (operator) {
      case 'eq':
        return value === compareValue;
      case 'ne':
        return value !== compareValue;
      case 'gt':
        return Number(value) > Number(compareValue);
      case 'gte':
        return Number(value) >= Number(compareValue);
      case 'lt':
        return Number(value) < Number(compareValue);
      case 'lte':
        return Number(value) <= Number(compareValue);
      case 'contains':
        return String(value).includes(String(compareValue));
      default:
        return false;
    }
  }

  /**
   * Evaluate random condition
   */
  private evaluateRandomCondition(
    condition: VariantCondition,
    context: VariantContext
  ): boolean {
    const probability = condition.probability ?? 0.5;
    
    // Use seed for deterministic random if provided
    if (context.randomSeed !== undefined) {
      const seededRandom = this.seededRandom(context.randomSeed);
      return seededRandom < probability;
    }
    
    return Math.random() < probability;
  }

  /**
   * Evaluate time condition
   */
  private evaluateTimeCondition(
    condition: VariantCondition,
    context: VariantContext
  ): boolean {
    const now = context.currentTime || new Date();

    // Check time range (HH:MM)
    if (condition.timeRange) {
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [startHour, startMin] = condition.timeRange.start.split(':').map(Number);
      const [endHour, endMin] = condition.timeRange.end.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }

    // Check date range
    if (condition.dateRange) {
      const startDate = new Date(condition.dateRange.start);
      const endDate = new Date(condition.dateRange.end);

      if (now < startDate || now > endDate) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate playthrough condition
   */
  private evaluatePlaythroughCondition(
    condition: VariantCondition,
    context: VariantContext
  ): boolean {
    const count = context.playthroughCount;

    if (condition.playthroughMin !== undefined && count < condition.playthroughMin) {
      return false;
    }

    if (condition.playthroughMax !== undefined && count > condition.playthroughMax) {
      return false;
    }

    return true;
  }

  /**
   * Evaluate achievement condition
   */
  private evaluateAchievementCondition(
    condition: VariantCondition,
    context: VariantContext
  ): boolean {
    if (!condition.requiredAchievements) {
      return true;
    }

    return condition.requiredAchievements.every((achId) =>
      context.achievements.includes(achId)
    );
  }

  /**
   * Apply variant to panel
   */
  applyVariantToPanel(panel: Panel, variant: PanelVariant): Panel {
    const applied: any = { ...panel };

    // Apply variant overrides
    if (variant.layers) {
      applied.layers = variant.layers;
    }

    if (variant.duration !== undefined) {
      applied.duration = variant.duration;
    }

    if (variant.transition) {
      applied.transition = variant.transition;
    }

    if (variant.audio) {
      applied.audio = variant.audio;
    }

    // Record override
    this.recordOverride({
      targetType: 'panel',
      targetId: variant.id, // Use variant id since Panel doesn't have id
      variantId: variant.id,
      overrides: { layers: variant.layers, duration: variant.duration },
      appliedAt: new Date(),
    });

    return applied as Panel;
  }

  /**
   * Apply variant to layer
   */
  applyVariantToLayer(layer: Layer, variant: LayerVariant): Layer {
    let applied: Layer;

    if (variant.layerReplacement) {
      applied = { ...variant.layerReplacement };
    } else {
      applied = { ...layer, ...variant.layerOverrides };
    }

    // Record override
    this.recordOverride({
      targetType: 'layer',
      targetId: layer.id,
      variantId: variant.id,
      overrides: variant.layerOverrides,
      appliedAt: new Date(),
    });

    return applied;
  }

  /**
   * Set manual override for panel
   */
  setManualOverride(panelId: string, variantId: string): void {
    if (!this.config.allowManualOverride) {
      console.warn('Manual overrides are disabled');
      return;
    }

    this.manualOverrides.set(panelId, variantId);
  }

  /**
   * Clear manual override
   */
  clearManualOverride(panelId: string): void {
    this.manualOverrides.delete(panelId);
  }

  /**
   * Get manual override
   */
  getManualOverride(panelId: string): string | undefined {
    return this.manualOverrides.get(panelId);
  }

  /**
   * Get variant history
   */
  getHistory(): VariantHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get applied overrides
   */
  getAppliedOverrides(): VariantOverride[] {
    return [...this.appliedOverrides];
  }

  /**
   * Clear applied overrides
   */
  clearAppliedOverrides(): void {
    this.appliedOverrides = [];
  }

  /**
   * Get variant overrides
   */
  private getVariantOverrides(variant: PanelVariant | LayerVariant): unknown {
    if ('layers' in variant) {
      // Panel variant
      return {
        layers: variant.layers,
        duration: variant.duration,
        transition: variant.transition,
        audio: variant.audio,
      };
    } else {
      // Layer variant
      const layerVariant = variant as LayerVariant;
      return layerVariant.layerOverrides;
    }
  }

  /**
   * Log variant selection
   */
  private logSelection(
    variant: PanelVariant | LayerVariant,
    context: VariantContext
  ): void {
    const entry: VariantHistoryEntry = {
      timestamp: new Date(),
      panelId: 'id' in variant ? variant.id : 'unknown',
      variantId: variant.id,
      condition: variant.condition,
      context: { ...context },
    };

    this.history.push(entry);

    if (this.config.debugMode) {
      console.log('[Variant] Selection:', entry);
    }
  }

  /**
   * Record override application
   */
  private recordOverride(override: VariantOverride): void {
    this.appliedOverrides.push(override);
  }

  /**
   * Seeded random number generator
   */
  private seededRandom(seed: number): number {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }
}
