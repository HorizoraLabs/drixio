import { bindConsoleEvents } from './events.js';

export function loadSqlConsole(tableName, btnElement, container) {
   const allBtns = document.querySelectorAll('.table-btn');
   allBtns.forEach((b) => b.classList.remove('active'));
   if (btnElement) btnElement.classList.add('active');

   const headerTableName = document.getElementById('table-name');
   if (headerTableName) headerTableName.textContent = 'SQL Editor';

   container.innerHTML = /* html */ `
    <div class="sql-console-wrapper">
      <!-- 1. Left Query SideNav (Matching Table Editor SideNav Layout) -->
      <aside id="console-sidebar" class="console-sidebar">
        <!-- Sidebar Header -->
        <div class="console-sidebar-header" id="console-sidebar-header">
          <div class="sidebar-header-title">
            <span class="sidebar-header-text">SQL Editor</span>
          </div>
        </div>

        <!-- Sidebar Content (Search & + New Query Row) -->
        <div class="console-sidebar-content">
          <!-- Search Row with + New Query Button -->
          <div class="console-sidebar-search-row" id="console-sidebar-search-row">
            <div class="console-search-bar" id="console-search-bar" role="search">
              <span class="material-symbols-outlined search-icon">search</span>
              <input type="text" placeholder="Search queries..." id="console-sidebar-search-input" aria-label="Search queries" autocomplete="off" spellcheck="false" />
              <button type="button" id="console-search-clear-btn" class="search-clear-btn hidden" title="Clear filter" aria-label="Clear filter">✕</button>
            </div>
            <button type="button" id="console-new-query-btn" class="console-sidebar-add-btn" title="New Query (Ctrl+Alt+N)" aria-label="New Query">
              <span class="material-symbols-outlined">add</span>
            </button>
          </div>

          <!-- Tree Navigation / Query List (Matching #table-nav) -->
          <div class="console-query-nav" id="console-sidebar-tree">
            <!-- Section: SAVED QUERIES -->
            <div class="console-tree-section">
              <div class="console-tree-section-header" data-section="saved">
                <div class="tree-header-left">
                  <span class="material-symbols-outlined tree-arrow">expand_more</span>
                  <span class="tree-section-label">SAVED QUERIES</span>
                </div>
                <span class="table-btn-badge" id="saved-queries-count">0</span>
              </div>
              <div class="console-tree-section-items" id="console-saved-queries-list">
                <!-- Dynamically populated -->
              </div>
            </div>

            <!-- Section: TEMPLATES -->
            <div class="console-tree-section">
              <div class="console-tree-section-header" data-section="templates">
                <div class="tree-header-left">
                  <span class="material-symbols-outlined tree-arrow">expand_more</span>
                  <span class="tree-section-label">TEMPLATES</span>
                </div>
                <span class="table-btn-badge" id="templates-count">7</span>
              </div>
              <div class="console-tree-section-items" id="console-templates-list">
                <!-- Predefined templates -->
              </div>
            </div>

            <!-- Section: RECENT -->
            <div class="console-tree-section">
              <div class="console-tree-section-header" data-section="history">
                <div class="tree-header-left">
                  <span class="material-symbols-outlined tree-arrow">expand_more</span>
                  <span class="tree-section-label">RECENT</span>
                </div>
                <button type="button" id="console-clear-history-btn" class="tree-header-clear-btn hidden" title="Clear all recent history">
                  <span class="material-symbols-outlined" style="font-size: 14px;">delete_sweep</span>
                </button>
              </div>
              <div class="console-tree-section-items" id="console-recent-history-list">
                <!-- Recent execution history -->
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar Footer (Matching #sidebar-footer) -->
        <div class="console-sidebar-footer" id="console-sidebar-footer">
          <div class="sidebar-db-status" title="Database Connection Status">
            <span class="status-indicator-dot status-connected" id="console-db-status-dot"></span>
            <span id="console-db-type">CONNECTED</span>
          </div>
          <button type="button" id="console-clear-results-btn" class="console-sidebar-clear-btn" title="Clear current results">
            <span class="material-symbols-outlined" style="font-size: 14px;">cleaning_services</span>
            <span>Clear</span>
          </button>
        </div>
      </aside>

      <!-- 2. Main Workstation Area -->
      <div class="console-workstation">
        <!-- Top Tabs & Action Bar -->
        <div class="console-top-bar">
          <div class="console-top-left">
            <button type="button" id="console-toggle-sidebar-btn" class="console-icon-btn" title="Toggle Sidebar">
              <span class="material-symbols-outlined">dock_to_left</span>
            </button>
            <!-- Tabs Container -->
            <div class="console-tabs-container" id="console-tabs-container">
              <!-- Dynamically rendered tabs -->
            </div>
            <button type="button" id="console-add-tab-btn" class="console-add-tab-btn" title="New Query Tab">
              <span class="material-symbols-outlined">add</span>
            </button>
          </div>

          <div class="console-top-right">
            <!-- Safe Mode Compact Shield Toggle (Plan A) -->
            <button type="button" id="console-safe-toggle-btn" class="console-safe-shield-btn active" title="Safe Mode: Protection ON (Destructive queries will prompt for confirmation)">
              <span class="material-symbols-outlined safe-shield-icon">security</span>
              <span class="safe-indicator-dot"></span>
            </button>

            <!-- Ask AI Button (Option C) -->
            <button type="button" id="console-ai-btn" class="console-action-btn secondary console-ai-trigger-btn" title="Ask AI to write SQL (Ctrl+I)">
              <span class="material-symbols-outlined icon" style="color: var(--primary, #2563eb);">auto_awesome</span>
              <span>Ask AI</span>
              <kbd class="console-kbd-hint">Ctrl I</kbd>
            </button>

            <!-- Save Button -->
            <button type="button" id="console-save-snippet-btn" class="console-action-btn secondary" title="Save Query (Ctrl+S)">
              <span class="material-symbols-outlined icon">bookmark_add</span>
              <span>Save</span>
              <kbd class="console-kbd-hint">Ctrl S</kbd>
            </button>

            <!-- Drixio Brand Primary Blue Run Button -->
            <button type="button" id="run-sql-btn" class="console-run-btn" title="Run SQL Query (Ctrl+Enter)">
              <span class="material-symbols-outlined" style="font-size: 16px;">play_arrow</span>
              <span id="run-sql-btn-text">Run</span>
              <kbd class="console-run-kbd">Ctrl ↵</kbd>
            </button>
          </div>
        </div>

        <!-- Upper Editor Pane -->
        <div id="console-editor-pane" class="console-editor-pane">
          <div class="sql-editor-wrapper">
            <div class="sql-editor-layer-container">
              <!-- Autocomplete Floating Popup (VS Code style) -->
              <div id="console-autocomplete-popup" class="console-autocomplete-popup hidden"></div>
              <!-- Line Numbers Gutter -->
              <div id="sql-line-numbers" class="sql-line-numbers">1</div>
              <!-- Syntax Highlight Layer (Background) -->
              <div id="sql-highlight-layer" class="sql-editor"></div>
              <!-- Real Textarea (Foreground) -->
              <textarea id="sql-editor" class="sql-editor" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" placeholder="Write your SQL query here (e.g. SELECT * FROM users)..."></textarea>
            </div>
          </div>

          <!-- Editor Status Bar (Plan A: 下沉式状态栏) -->
          <div class="console-editor-status-bar" id="console-editor-status-bar">
            <div class="status-bar-left">
              <span class="status-bar-item" id="console-cursor-pos" title="Cursor Line and Column">Ln 1, Col 1</span>
              <span class="status-bar-separator hidden" id="console-sel-separator">&middot;</span>
              <span class="status-bar-item hidden" id="console-selection-info" title="Current Selection">0 selected</span>
              <span class="status-bar-separator">&middot;</span>
              <span class="status-bar-item font-mono" id="console-status-dialect">SQLITE</span>
            </div>
            <div class="status-bar-right">
              <button type="button" id="console-format-sql-btn" class="status-bar-btn" title="Format SQL Query (Shift+Alt+F)">
                <span class="material-symbols-outlined" style="font-size: 13px;">auto_fix_high</span>
                <span>Format</span>
                <kbd class="status-bar-kbd">Shift Alt F</kbd>
              </button>
              <button type="button" id="explain-sql-btn" class="status-bar-btn" title="Analyze Query Execution Plan (EXPLAIN)">
                <span class="material-symbols-outlined" style="font-size: 13px;">psychology</span>
                <span>Explain</span>
              </button>
              <button type="button" id="console-ai-explain-btn" class="status-bar-btn" title="AI Explain & Optimize Query">
                <span class="material-symbols-outlined" style="font-size: 13px; color: var(--primary, #2563eb);">auto_awesome</span>
                <span>AI Optimize</span>
              </button>
              <button type="button" id="console-expand-editor-btn" class="status-bar-btn" title="Toggle Fullscreen Editor (Esc to exit)">
                <span class="material-symbols-outlined" id="console-expand-btn-icon" style="font-size: 13px;">open_in_full</span>
              </button>
              <button type="button" id="console-shortcuts-btn" class="status-bar-btn" title="Keyboard Shortcuts (?)">
                <span class="material-symbols-outlined" style="font-size: 14px;">help_outline</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Draggable Horizontal Resizer -->
        <div id="console-resizer" class="console-h-resizer">
          <div class="console-resizer-handle" title="Drag to adjust editor/results ratio">
            <div class="console-resizer-pill"></div>
          </div>
        </div>

        <!-- Lower Results Pane -->
        <div id="console-results-pane" class="console-results-pane">
          <!-- Results Sub-header -->
          <div class="console-results-header">
            <div class="console-results-tabs">
              <button type="button" class="results-tab-btn active" data-tab="results">Results</button>
              <button type="button" class="results-tab-btn" data-tab="messages">Messages</button>
            </div>
            <div class="console-results-meta" id="console-results-meta">
              <span class="results-meta-text" id="results-meta-count">Ready to run query</span>
              <div class="results-export-wrapper" id="results-export-wrapper" style="display: none;">
                <button type="button" id="console-export-btn" class="console-export-btn" title="Export Results">
                  <span class="material-symbols-outlined" style="font-size: 14px;">download</span>
                  <span>Export</span>
                  <span class="material-symbols-outlined" style="font-size: 14px;">expand_more</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Results Body (Table) -->
          <div class="console-results-body" id="console-results-body">
            <div class="console-welcome-msg" id="console-welcome-msg">
              <div class="console-welcome-icon-box">
                <span class="material-symbols-outlined">terminal</span>
              </div>
              <h2 class="console-welcome-heading">Drixio SQL Workstation</h2>
              <p class="console-welcome-sub">Write and execute queries with multi-tab support, syntax highlighting, and instant tabular results.</p>
              
              <div class="console-shortcuts-hint">
                <span class="shortcut-pill"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> Run</span>
                <span class="shortcut-pill"><kbd>Ctrl</kbd> + <kbd>S</kbd> Save</span>
                <span class="shortcut-pill"><kbd>Tab</kbd> Indent</span>
              </div>
            </div>
          </div>

          <!-- Messages Body (Execution Logs) -->
          <div class="console-messages-body hidden" id="console-messages-body">
            <div class="console-messages-toolbar">
              <span class="messages-toolbar-title">Console Output & Execution Logs</span>
              <button type="button" id="console-clear-messages-btn" class="console-clear-messages-btn" title="Clear log messages">
                <span class="material-symbols-outlined" style="font-size: 14px;">delete_sweep</span>
                <span>Clear Logs</span>
              </button>
            </div>
            <div class="console-messages-content" id="console-messages-content">
              <div class="messages-log-entry info">
                <div class="messages-log-header">
                  <span class="messages-badge badge-info">INFO</span>
                  <span class="messages-time">[System]</span>
                  <span class="messages-title">SQL Workstation ready</span>
                </div>
                <div class="messages-detail">Query execution statistics, server notices, and execution plans will appear here.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
   `;

   const editor = document.getElementById('sql-editor');
   const resultsBody = document.getElementById('console-results-body');

   const savedEditorHeight =
      localStorage.getItem('drixio_console_editor_height') ||
      localStorage.getItem('drixio_console_pane_height');
   const editorPane = container.querySelector('#console-editor-pane');
   if (savedEditorHeight && editorPane) {
      const parsedH = parseInt(savedEditorHeight, 10);
      if (!isNaN(parsedH) && parsedH >= 120 && parsedH <= 800) {
         editorPane.style.height = `${parsedH}px`;
      }
   }

   const mainEl = document.querySelector('main');
   if (mainEl) mainEl.scrollTop = 0;
   window.scrollTo(0, 0);

   bindConsoleEvents(editor, resultsBody);
}
