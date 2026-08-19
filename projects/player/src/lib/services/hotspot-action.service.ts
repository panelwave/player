/**
 * Hotspot Action Service
 * Executes a hotspot's action. Pure side effects (variable mutations, plugin
 * events) happen here; UI side effects (navigation, modals) are returned as
 * an effect for the shell to apply — keeps this fully unit-testable.
 */

import { Injectable, inject } from '@angular/core';

import type { HotspotAction, LocalizedString, Transition } from '../types';
import { VariableStoreService } from './variable-store.service';
import { PluginHostService } from './plugin-host.service';

/**
 * UI side effect the shell must apply after executing a hotspot action
 */
export type HotspotUiEffect =
  | { kind: 'navigate'; to: string; transition?: Transition }
  | { kind: 'openExtras'; extrasId: string }
  | { kind: 'openModal'; title: LocalizedString; content: LocalizedString }
  | { kind: 'none' };

@Injectable({ providedIn: 'root' })
export class HotspotActionService {
  private readonly variableStore = inject(VariableStoreService);
  private readonly pluginHost = inject(PluginHostService);

  /**
   * Execute a hotspot action
   * @param action - The hotspot's action (manifest shape)
   * @param ids - Scope identifiers for chapter/page-scoped mutations
   * @returns The UI effect for the caller to apply
   */
  execute(action: HotspotAction, ids: { chapterId?: string; pageId?: string }): HotspotUiEffect {
    switch (action.type) {
      case 'goTo':
        if (action.mutations?.length) {
          this.variableStore.applyMutations(action.mutations, {
            chapterId: ids.chapterId,
            pageId: ids.pageId,
          });
        }
        return { kind: 'navigate', to: action.to, transition: action.transition };

      case 'setVariables':
        this.variableStore.applyMutations(action.mutations, {
          chapterId: ids.chapterId,
          pageId: ids.pageId,
        });
        return { kind: 'none' };

      case 'openExtras':
        return { kind: 'openExtras', extrasId: action.extrasId };

      case 'openModal':
        return { kind: 'openModal', title: action.title, content: action.content };

      case 'pluginEvent':
        this.pluginHost.emitEventToPlugins(action.event, {
          pluginId: action.pluginId,
          payload: action.payload,
        });
        return { kind: 'none' };

      default:
        return { kind: 'none' };
    }
  }
}
