/**
 * Keybinding conflict scanner types
 */

export interface KeybindingInfo {
  key: string;
  command: string;
  when?: string;
  extensionId: string;
  extensionName: string;
}

export interface ConflictGroup {
  key: string;
  bindings: KeybindingInfo[];
}

export interface QuickPickConflictItem {
  label: string;
  description: string;
  detail: string;
  binding: KeybindingInfo;
}

export type ResolutionAction =
  | {
      type: 'disable';
      bindings: KeybindingInfo[];
    }
  | {
      type: 'reassign';
      bindings: KeybindingInfo[];
      newKey: string;
      allBindings: KeybindingInfo[];
    };
