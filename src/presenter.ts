import * as vscode from 'vscode';
import { ConflictGroup, KeybindingInfo, QuickPickConflictItem, ResolutionAction } from './types';

/**
 * Presents keybinding conflicts to the user via QuickPick interface
 */
export class ConflictPresenter {
  /**
   * Shows conflict selection UI and returns selected action
   */
  public async showConflicts(
    conflicts: ConflictGroup[],
    allBindings: KeybindingInfo[]
  ): Promise<ResolutionAction | undefined> {
    if (conflicts.length === 0) {
      vscode.window.showInformationMessage('Keybinding Conflict Scanner: No conflicts found! 🎉');
      return undefined;
    }

    // Build QuickPick items
    const items = this.buildQuickPickItems(conflicts);

    // Show multi-select QuickPick
    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: `Found ${conflicts.length} conflict(s). Select keybindings to resolve (multiple selection allowed)`,
      title: 'Keybinding Conflicts'
    });

    if (!selected || selected.length === 0) {
      return undefined;
    }

    // Extract binding info from selected items
    const selectedBindings = selected.map(item => item.binding).filter(b => b !== undefined);

    if (selectedBindings.length === 0) {
      return undefined;
    }

    // Ask user what to do with selected bindings
    const action = await vscode.window.showQuickPick(
      [
        {
          label: '$(trash) Disable',
          description: 'Disable selected keybindings',
          action: 'disable' as const
        },
        {
          label: '$(edit) Reassign (Direct Input)',
          description: 'Enter a new key combination',
          action: 'reassign' as const
        },
        {
          label: '$(gear) Open in Keyboard Shortcuts',
          description: 'Modify in VS Code Keyboard Shortcuts editor',
          action: 'openSettings' as const
        }
      ],
      {
        placeHolder: 'How would you like to resolve this?'
      }
    );

    if (!action) {
      return undefined;
    }

    // Handle opening Keyboard Shortcuts
    if (action.action === 'openSettings') {
      // For multiple selections, open with general search
      if (selectedBindings.length > 1) {
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
        vscode.window.showInformationMessage(
          `Search for the selected ${selectedBindings.length} command(s) in Keyboard Shortcuts editor to modify them.`
        );
      } else {
        // For single selection, search for the specific command
        const command = selectedBindings[0].command;
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', command);
        vscode.window.showInformationMessage(
          `Navigated to search results for "${command}". Click the keybinding to modify it.`
        );
      }
      return undefined;
    }

    if (action.action === 'reassign' && selectedBindings.length > 1) {
      vscode.window.showWarningMessage('Key reassignment can only be done one at a time. Please select only one keybinding.');
      return undefined;
    }

    // If reassign, ask for new key
    if (action.action === 'reassign') {
      const currentBinding = selectedBindings[0];

      const newKey = await vscode.window.showInputBox({
        prompt: 'Enter new key combination',
        placeHolder: 'e.g., ctrl+shift+k, ctrl+k v, f12',
        value: currentBinding.key,  // Pre-fill with current value
        validateInput: (value) => {
          return this.validateKeybinding(value, currentBinding, allBindings);
        }
      });

      if (!newKey) {
        return undefined;
      }

      return {
        type: 'reassign',
        bindings: selectedBindings,
        newKey: newKey.trim(),
        allBindings
      };
    }

    return {
      type: 'disable',
      bindings: selectedBindings
    };
  }

  /**
   * Validates keybinding input
   */
  private validateKeybinding(
    value: string | undefined,
    currentBinding: KeybindingInfo,
    allBindings: KeybindingInfo[]
  ): string | undefined {
    if (!value?.trim()) {
      return 'Please enter a key combination';
    }

    const normalized = value.toLowerCase().trim();

    // Check for valid characters (alphanumeric, +, space, f-keys)
    if (!normalized.match(/^[a-z0-9+\s]+$/)) {
      return 'Invalid characters detected';
    }

    // Check for valid modifier keys
    const validModifiers = ['ctrl', 'alt', 'shift', 'cmd', 'meta', 'win'];
    const parts = normalized.split(/[\s+]/);

    for (const part of parts) {
      if (!part) {
        continue;
      }

      // Check if it's a modifier or valid key
      const isModifier = validModifiers.includes(part);
      const isValidKey = part.match(/^([a-z]|f\d+|\d+|[`\-=\[\]\\;',./])$/);

      if (!isModifier && !isValidKey) {
        return `"${part}" is not a valid key`;
      }
    }

    // Check for proper format (modifiers should be connected with +, chords with space)
    const chords = normalized.split(' ');
    for (const chord of chords) {
      const keys = chord.split('+');

      // Each chord should have at least one key
      if (keys.length === 0 || keys.some(k => !k.trim())) {
        return 'Invalid key combination format (e.g., ctrl+shift+k)';
      }

      // Modifiers should come before the main key
      const hasModifier = keys.some(k => validModifiers.includes(k));
      if (hasModifier && keys.length === 1) {
        return 'Cannot create a keybinding with only modifiers';
      }
    }

    // Check for conflicts with existing bindings
    const conflict = allBindings.find(b =>
      b.key === normalized &&
      b.command !== currentBinding.command
    );

    if (conflict) {
      return `⚠️ Conflicts with "${conflict.command}" from "${conflict.extensionName}"`;
    }

    return undefined;
  }

  /**
   * Builds QuickPick items from conflict groups
   */
  private buildQuickPickItems(conflicts: ConflictGroup[]): QuickPickConflictItem[] {
    const items: QuickPickConflictItem[] = [];

    for (const conflict of conflicts) {
      // Add separator for each key group
      items.push({
        label: `$(keyboard) ${conflict.key}`,
        description: `${conflict.bindings.length} conflict(s)`,
        detail: '',
        kind: vscode.QuickPickItemKind.Separator
      } as any);

      // Add each conflicting binding
      for (const binding of conflict.bindings) {
        items.push({
          label: `  ${binding.command}`,
          description: binding.extensionName,
          detail: binding.when ? `when: ${binding.when}` : '',
          binding
        });
      }
    }

    return items;
  }

  /**
   * Shows summary after conflicts are resolved
   */
  public showResolutionSummary(resolvedCount: number): void {
    vscode.window.showInformationMessage(
      `Keybinding Conflict Scanner: Disabled ${resolvedCount} keybinding(s).`
    );
  }

  /**
   * Shows error message
   */
  public showError(message: string): void {
    vscode.window.showErrorMessage(`Keybinding Conflict Scanner: ${message}`);
  }
}
