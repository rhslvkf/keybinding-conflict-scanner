import * as vscode from 'vscode';
import { KeybindingScanner } from './scanner';
import { ConflictPresenter } from './presenter';
import { ConflictResolver } from './resolver';
import { KeybindingInfo } from './types';

let lastKnownExtensions: string[] = [];
let outputChannel: vscode.OutputChannel;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('Keybinding Conflict Scanner');
  context.subscriptions.push(outputChannel);

  // Register scan command
  const scanCommand = vscode.commands.registerCommand(
    'keybinding-conflict-scanner.scan',
    async () => {
      await scanKeybindingConflicts(false);
    }
  );

  context.subscriptions.push(scanCommand);

  // Initialize extension list
  lastKnownExtensions = vscode.extensions.all.map(ext => ext.id);

  // Watch for extension installation only
  const extensionChangeListener = vscode.extensions.onDidChange(async () => {
    const config = vscode.workspace.getConfiguration('keybindingConflictScanner');
    const autoDetect = config.get<boolean>('autoDetect', true);

    if (!autoDetect) {
      return;
    }

    const currentExtensions = vscode.extensions.all.map(ext => ext.id);

    // Find newly installed extensions
    const newExtensions = currentExtensions.filter(id => !lastKnownExtensions.includes(id));

    if (newExtensions.length > 0) {
      lastKnownExtensions = currentExtensions;

      // Wait a bit for extension to fully load
      setTimeout(async () => {
        await scanNewExtensionConflicts(newExtensions);
      }, 2000);
    } else {
      // Just update the list (for uninstall case)
      lastKnownExtensions = currentExtensions;
    }
  });

  context.subscriptions.push(extensionChangeListener);
}

/**
 * Scans only the newly installed extensions for conflicts
 */
async function scanNewExtensionConflicts(newExtensionIds: string[]): Promise<void> {
  const scanner = new KeybindingScanner(outputChannel);
  const presenter = new ConflictPresenter();
  const resolver = new ConflictResolver();

  try {
    // Get all bindings
    const allConflicts = await scanner.scanConflicts();
    const allBindings = scanner.getAllBindings();

    // Filter conflicts that involve the new extensions
    const newExtensionConflicts = allConflicts.filter(conflict =>
      conflict.bindings.some(binding => newExtensionIds.includes(binding.extensionId))
    );

    if (newExtensionConflicts.length === 0) {
      return; // No conflicts from new extensions
    }

    // Show notification
    const config = vscode.workspace.getConfiguration('keybindingConflictScanner');
    const showNotifications = config.get<boolean>('showNotifications', true);

    if (showNotifications) {
      const newExtensionNames = new Set(
        newExtensionConflicts.flatMap(c =>
          c.bindings
            .filter(b => newExtensionIds.includes(b.extensionId))
            .map(b => b.extensionName)
        )
      );

      const extensionList = Array.from(newExtensionNames).join(', ');

      const action = await vscode.window.showWarningMessage(
        `Found ${newExtensionConflicts.length} keybinding conflict(s) from newly installed extension(s): ${extensionList}`,
        'Resolve Now',
        'Ignore'
      );

      if (action === 'Resolve Now') {
        await processConflictResolution(newExtensionConflicts, allBindings, presenter, resolver);
      }
    }
  } catch (error) {
    presenter.showError(
      error instanceof Error ? error.message : 'An unknown error occurred'
    );
  }
}

/**
 * Main command handler: Scan and resolve keybinding conflicts
 */
async function scanKeybindingConflicts(isAutomatic: boolean): Promise<void> {
  const scanner = new KeybindingScanner(outputChannel);
  const presenter = new ConflictPresenter();
  const resolver = new ConflictResolver();

  try {
    let conflicts: any[] = [];
    let allBindings: KeybindingInfo[] = [];

    // Scan for conflicts (without progress for automatic scans)
    if (isAutomatic) {
      conflicts = await scanner.scanConflicts();
      allBindings = scanner.getAllBindings();

      // Only show notification if conflicts found and notifications enabled
      if (conflicts.length > 0) {
        const config = vscode.workspace.getConfiguration('keybindingConflictScanner');
        const showNotifications = config.get<boolean>('showNotifications', true);

        if (showNotifications) {
          const action = await vscode.window.showWarningMessage(
            `Keybinding Conflict Scanner: Found ${conflicts.length} conflict(s).`,
            'Resolve Now',
            'Ignore'
          );

          if (action === 'Resolve Now') {
            await processConflictResolution(conflicts, allBindings, presenter, resolver);
          }
        }
      }
    } else {
      // Manual scan - show progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Scanning keybinding conflicts...',
          cancellable: false
        },
        async (progress) => {
          progress.report({ message: 'Analyzing extensions...' });
          conflicts = await scanner.scanConflicts();
          allBindings = scanner.getAllBindings();
          progress.report({ message: 'Complete' });
        }
      );

      // Process resolution
      await processConflictResolution(conflicts, allBindings, presenter, resolver);
    }

  } catch (error) {
    presenter.showError(
      error instanceof Error ? error.message : 'An unknown error occurred'
    );
  }
}

/**
 * Process conflict resolution based on user selection
 */
async function processConflictResolution(
  conflicts: any[],
  allBindings: KeybindingInfo[],
  presenter: ConflictPresenter,
  resolver: ConflictResolver
): Promise<void> {
  const action = await presenter.showConflicts(conflicts, allBindings);

  if (!action) {
    return;
  }

  try {
    if (action.type === 'disable') {
      await resolver.disableKeybindings(action.bindings);
      presenter.showResolutionSummary(action.bindings.length);
    } else if (action.type === 'reassign') {
      await resolver.reassignKeybinding(
        action.bindings[0],
        action.newKey,
        action.allBindings
      );
      vscode.window.showInformationMessage(
        `Keybinding Conflict Scanner: Keybinding changed to "${action.newKey}".`
      );
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Cleanup if needed
}
