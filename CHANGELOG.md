# Change Log

All notable changes to the "Keybinding Conflict Scanner" extension will be documented in this file.

## [0.1.0] - 2025-12-01

### Initial Release

#### Features
- 🔍 **Automatic Conflict Detection**: Detects keybinding conflicts when new extensions are installed
- 🎯 **Smart Filtering**: Only shows conflicts involving newly installed extensions
- ⚡ **Quick Resolution**: Three resolution options for conflicting keybindings
  - Disable: Set keybinding to empty string
  - Reassign: Direct input with real-time validation
  - Keyboard Shortcuts: Open VS Code's native editor with command pre-searched
- ✅ **Input Validation**: Real-time conflict checking and format validation when reassigning keys
- 🎼 **Chord Key Support**: Correctly handles chord keys (e.g., `ctrl+k ctrl+s`)
- 🔧 **Same Extension Smart Filter**: Ignores multiple keybindings from the same extension with different `when` clauses

#### Settings
- `keybindingConflictScanner.autoDetect`: Automatically detect conflicts when extensions are installed (default: true)
- `keybindingConflictScanner.showNotifications`: Show notifications when conflicts are detected (default: true)

#### Commands
- `Keybinding Conflict Scanner: Scan Conflicts` - Manually scan for keybinding conflicts

#### Technical Highlights
- Platform-specific key handling (Windows/Mac/Linux)
- Key normalization with proper modifier order
- User-disabled command filtering (reads from keybindings.json)
- Multi-select QuickPick interface for conflict resolution
- Automatic conflict detection on extension installation
