import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { KeybindingInfo, ConflictGroup } from './types';

/**
 * Scans all installed extensions for keybinding conflicts
 */
export class KeybindingScanner {
  private allBindings: KeybindingInfo[] = [];
  private outputChannel?: vscode.OutputChannel;

  constructor(outputChannel?: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(message);
    }
  }

  /**
   * Scans all extensions and returns conflicting keybindings
   */
  public async scanConflicts(): Promise<ConflictGroup[]> {
    this.allBindings = this.collectAllKeybindings();
    const userDisabledCommands = this.getUserDisabledCommands();

    const conflicts = this.findConflicts(this.allBindings, userDisabledCommands);

    // Log summary
    this.log(`[Scanner] Scanned ${this.allBindings.length} keybindings, found ${conflicts.length} conflicts`);

    return conflicts;
  }

  /**
   * Gets all keybindings (for reassignment duplicate checking)
   */
  public getAllBindings(): KeybindingInfo[] {
    return this.allBindings;
  }

  /**
   * Collects keybindings from all installed extensions
   */
  private collectAllKeybindings(): KeybindingInfo[] {
    const bindings: KeybindingInfo[] = [];

    for (const extension of vscode.extensions.all) {
      const packageJSON = extension.packageJSON;

      // Skip extensions without keybindings
      if (!packageJSON?.contributes?.keybindings) {
        continue;
      }

      const extensionId = extension.id;
      const extensionName = packageJSON.displayName || packageJSON.name || extensionId;

      const keybindings = packageJSON.contributes.keybindings;

      // Process each keybinding from this extension
      for (const kb of keybindings) {
        const keysToProcess: string[] = [];

        // Determine which keys to use based on platform
        // Priority: platform-specific > general key
        if (process.platform === 'darwin' && kb.mac) {
          // macOS - use mac-specific keys
          const macKeys = Array.isArray(kb.mac) ? kb.mac : [kb.mac];
          keysToProcess.push(...macKeys.filter((k: any) => k));
        } else if (process.platform === 'linux' && kb.linux) {
          // Linux - use linux-specific keys
          const linuxKeys = Array.isArray(kb.linux) ? kb.linux : [kb.linux];
          keysToProcess.push(...linuxKeys.filter((k: any) => k));
        } else if (process.platform === 'win32' && kb.win) {
          // Windows - use windows-specific keys
          const winKeys = Array.isArray(kb.win) ? kb.win : [kb.win];
          keysToProcess.push(...winKeys.filter((k: any) => k));
        } else if (kb.key) {
          // Fallback to general key if no platform-specific key
          const keys = Array.isArray(kb.key) ? kb.key : [kb.key];
          keysToProcess.push(...keys.filter((k: any) => k));
        }

        // Add all determined keys for this binding
        for (const key of keysToProcess) {
          bindings.push({
            key: this.normalizeKey(key),
            command: kb.command,
            when: kb.when,
            extensionId,
            extensionName: extensionName
          });
        }
      }
    }

    return bindings;
  }

  /**
   * Normalizes key notation for consistent comparison
   * Handles modifier key order: ctrl+shift+v and shift+ctrl+v become the same
   * Handles chord keys: "ctrl+k ctrl+n" is different from "ctrl+n"
   */
  private normalizeKey(key: string): string {
    const normalized = key.toLowerCase().trim();

    // Handle chord keys (space-separated) FIRST before splitting by +
    // Examples: "ctrl+k ctrl+s", "ctrl+k v"
    if (normalized.includes(' ')) {
      return normalized
        .split(' ')
        .map(chord => this.normalizeSingleKey(chord))
        .join(' ');
    }

    return this.normalizeSingleKey(normalized);
  }

  /**
   * Normalizes a single key combination (not a chord)
   */
  private normalizeSingleKey(key: string): string {
    const normalized = key.toLowerCase().trim();

    // Split by + to get individual keys
    const parts = normalized.split('+').map(p => p.trim());

    // If only one part, return as-is
    if (parts.length === 1) {
      return normalized;
    }

    // Separate modifiers and main key
    const modifiers: string[] = [];
    let mainKey = '';

    for (const part of parts) {
      if (this.isModifierKey(part)) {
        modifiers.push(part);
      } else {
        mainKey = part;
      }
    }

    // Sort modifiers in a consistent order
    const modifierOrder = ['ctrl', 'cmd', 'alt', 'shift', 'meta', 'win'];
    modifiers.sort((a, b) => {
      const indexA = modifierOrder.indexOf(a);
      const indexB = modifierOrder.indexOf(b);
      return indexA - indexB;
    });

    // Reconstruct key combination
    if (mainKey) {
      return [...modifiers, mainKey].join('+');
    } else {
      return modifiers.join('+');
    }
  }

  /**
   * Checks if a key is a modifier key
   */
  private isModifierKey(key: string): boolean {
    const modifiers = ['ctrl', 'cmd', 'alt', 'shift', 'meta', 'win', 'command', 'option', 'control'];
    return modifiers.includes(key.toLowerCase());
  }

  /**
   * Gets user-disabled commands from keybindings.json
   */
  private getUserDisabledCommands(): Set<string> {
    const disabledCommands = new Set<string>();

    try {
      const keybindingsPath = this.getKeybindingsPath();

      if (!fs.existsSync(keybindingsPath)) {
        return disabledCommands;
      }

      const content = fs.readFileSync(keybindingsPath, 'utf8');
      if (!content.trim()) {
        return disabledCommands;
      }

      // Parse JSON, removing comments
      const jsonContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const userKeybindings = JSON.parse(jsonContent);

      // Find disabled commands (command starts with '-' or key is empty)
      for (const kb of userKeybindings) {
        if (kb.command && kb.command.startsWith('-')) {
          // Remove the '-' prefix to get the actual command
          const actualCommand = kb.command.substring(1);
          disabledCommands.add(actualCommand);
        } else if (kb.command && (!kb.key || kb.key === '')) {
          // Empty key also means disabled
          disabledCommands.add(kb.command);
        }
      }
    } catch (error) {
      console.error('Failed to read user keybindings:', error);
    }

    return disabledCommands;
  }

  /**
   * Gets the path to user's keybindings.json
   */
  private getKeybindingsPath(): string {
    const platform = process.platform;
    const homeDir = os.homedir();

    let configPath: string;

    if (platform === 'win32') {
      configPath = path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User', 'keybindings.json');
    } else if (platform === 'darwin') {
      configPath = path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'keybindings.json');
    } else {
      configPath = path.join(homeDir, '.config', 'Code', 'User', 'keybindings.json');
    }

    return configPath;
  }

  /**
   * Groups keybindings by key and filters for conflicts
   * Only considers it a conflict if different extensions use the same key
   * Same extension with different 'when' clauses is NOT a conflict
   */
  private findConflicts(bindings: KeybindingInfo[], userDisabledCommands: Set<string>): ConflictGroup[] {
    // Group by key
    const groupedByKey = new Map<string, KeybindingInfo[]>();

    for (const binding of bindings) {
      // Skip if user has disabled this command
      if (userDisabledCommands.has(binding.command)) {
        continue;
      }

      const key = binding.key;
      if (!groupedByKey.has(key)) {
        groupedByKey.set(key, []);
      }
      groupedByKey.get(key)!.push(binding);
    }

    // Filter groups with actual conflicts
    const conflicts: ConflictGroup[] = [];

    for (const [key, bindingsForKey] of groupedByKey.entries()) {
      if (bindingsForKey.length > 1) {
        // Check if there are multiple different extensions
        const extensionIds = new Set(bindingsForKey.map(b => b.extensionId));

        // Only report as conflict if multiple extensions are involved
        if (extensionIds.size > 1) {
          conflicts.push({
            key,
            bindings: bindingsForKey
          });
        } else {
          // Same extension, different 'when' clauses - not a conflict
          this.log(`[Scanner] Skipping same-extension bindings for key "${key}" (${bindingsForKey[0].extensionName}, ${bindingsForKey.length} variants with different 'when' clauses)`);
        }
      }
    }

    // Sort by key for consistent display
    conflicts.sort((a, b) => a.key.localeCompare(b.key));

    return conflicts;
  }
}
