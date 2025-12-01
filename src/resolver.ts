import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { KeybindingInfo } from './types';

/**
 * Resolves keybinding conflicts by modifying user's keybindings.json
 */
export class ConflictResolver {
  /**
   * Disables selected keybindings by setting key to empty string
   */
  public async disableKeybindings(bindings: KeybindingInfo[]): Promise<void> {
    if (bindings.length === 0) {
      return;
    }

    try {
      const keybindingsPath = this.getKeybindingsPath();
      const currentKeybindings = this.readKeybindingsFile(keybindingsPath);

      // Add disable entries for each selected binding
      for (const binding of bindings) {
        // Check if this command already has a user override
        // Match by command and when clause (treating undefined and missing as same)
        const existingIndex = currentKeybindings.findIndex((kb: any) => {
          if (kb.command !== binding.command) {
            return false;
          }
          // Treat undefined, null, and missing 'when' as equivalent
          const kbWhen = kb.when || undefined;
          const bindingWhen = binding.when || undefined;
          return kbWhen === bindingWhen;
        });

        if (existingIndex >= 0) {
          // Update existing entry to disable it
          currentKeybindings[existingIndex].key = '';
        } else {
          // Add new disable entry
          const disableEntry: any = {
            key: '',
            command: binding.command
          };

          // Add 'when' clause if it exists
          if (binding.when) {
            disableEntry.when = binding.when;
          }

          currentKeybindings.push(disableEntry);
        }
      }

      // Write back to file
      this.writeKeybindingsFile(keybindingsPath, currentKeybindings);

    } catch (error) {
      throw new Error(`keybindings.json 업데이트 실패: ${error}`);
    }
  }

  /**
   * Reassigns keybinding to a new key combination
   */
  public async reassignKeybinding(
    binding: KeybindingInfo,
    newKey: string,
    allBindings: KeybindingInfo[]
  ): Promise<void> {
    try {
      const keybindingsPath = this.getKeybindingsPath();
      const currentKeybindings = this.readKeybindingsFile(keybindingsPath);

      // Check if new key conflicts with existing bindings
      const normalizedNewKey = newKey.toLowerCase().trim();
      const conflict = allBindings.find(b =>
        b.key === normalizedNewKey && b.command !== binding.command
      );

      if (conflict) {
        throw new Error(
          `새 키 조합 "${newKey}"는 이미 "${conflict.extensionName}"의 "${conflict.command}"에 할당되어 있습니다.`
        );
      }

      // First, disable the original binding
      const disableEntry: any = {
        key: binding.key,
        command: `-${binding.command}`
      };

      if (binding.when) {
        disableEntry.when = binding.when;
      }

      // Then, add the new binding
      const newEntry: any = {
        key: normalizedNewKey,
        command: binding.command
      };

      if (binding.when) {
        newEntry.when = binding.when;
      }

      // Add both entries
      currentKeybindings.push(disableEntry);
      currentKeybindings.push(newEntry);

      // Write back to file
      this.writeKeybindingsFile(keybindingsPath, currentKeybindings);

    } catch (error) {
      throw error;
    }
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
   * Reads keybindings.json file (legacy method for reassignment)
   */
  private readKeybindingsFile(filePath: string): any[] {
    try {
      // Create file if it doesn't exist
      if (!fs.existsSync(filePath)) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, '[]', 'utf8');
        return [];
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // Handle empty file
      if (!content.trim()) {
        return [];
      }

      // Parse JSON, handle comments by using a simple regex
      const jsonContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      return JSON.parse(jsonContent);
    } catch (error) {
      // If parse fails, return empty array
      console.error('Failed to parse keybindings.json:', error);
      return [];
    }
  }

  /**
   * Writes keybindings to file
   */
  private writeKeybindingsFile(filePath: string, keybindings: any[]): void {
    const content = JSON.stringify(keybindings, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}
