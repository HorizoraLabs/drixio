import { bindConsoleEvents } from './events.js';

export function loadSqlConsole(tableName, btnElement, container) {
   const allBtns = document.querySelectorAll('.table-btn');
   allBtns.forEach((b) => b.classList.remove('active'));
   if (btnElement) btnElement.classList.add('active');

   const headerTableName = document.getElementById('table-name');
   if (headerTableName) headerTableName.textContent = 'SQL Console';

   container.innerHTML = /* html */ `
    <div class="sql-console-wrapper">
      <div id="console-history-pane">
        <div id="console-welcome-msg">
          <div class="console-welcome-icon-box">
            <span class="material-symbols-outlined">terminal</span>
          </div>
          <h2 class="console-welcome-heading">Drixio SQL Terminal</h2>
          <p class="console-welcome-sub">Execute arbitrary queries with real-time profiling, syntax highlighting, and CSV export.</p>
          
          <div class="console-shortcuts-hint">
            <span class="shortcut-pill"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to execute</span>
            <span class="shortcut-pill"><kbd>&uarr;</kbd> <kbd>&darr;</kbd> history navigation</span>
            <span class="shortcut-pill">End with <kbd>;</kbd> + <kbd>Enter</kbd></span>
          </div>

          <div class="console-quick-templates">
            <span class="quick-template-label">Quick Queries:</span>
            <button type="button" class="template-chip" data-sql="CREATE DATABASE drixio.sqlite;">Create SQLite DB</button>
            <button type="button" class="template-chip" data-sql="CONNECT file:./drixio.sqlite;">Connect SQLite</button>
            <button type="button" class="template-chip" data-sql="SELECT * FROM sqlite_master WHERE type='table';">Show Tables</button>
            <button type="button" class="template-chip" data-sql="SELECT 1 + 1 as ping;">Ping Database</button>
          </div>
        </div>
      </div>

      <!-- Drag Resizer Bar -->
      <div id="console-resizer" class="console-resizer">
        <div class="console-resizer-handle" title="Drag to adjust editor height">
          <div class="console-resizer-pill"></div>
        </div>
      </div>

      <div id="console-input-pane">
        <div class="console-editor-toolbar">
          <div class="editor-toolbar-left">
            <span class="editor-mode-tag">
              <span class="material-symbols-outlined" style="font-size: 14px;">code</span>
              SQL
            </span>
            <button type="button" id="console-safe-toggle-btn" class="console-safe-toggle-btn active" title="Safe Mode: Destructive queries will prompt for confirmation">
              <span class="safe-indicator-dot"></span>
              <span id="console-safe-text">Safe Mode ON</span>
            </button>
            <span class="editor-shortcut-info">Press <b>Ctrl+Enter</b> to run</span>
          </div>
          <div class="editor-toolbar-right">
            <button type="button" id="console-snippets-toggle-btn" class="header-btn secondary" style="height: 28px; padding: 0 10px; font-size: 12px; gap: 5px;" title="Toggle Saved Queries & Snippets Library">
              <span class="material-symbols-outlined" style="font-size: 15px; color: #f59e0b;">bookmark</span>
              <span>Snippets</span>
            </button>
            <button type="button" id="console-save-snippet-btn" class="header-btn secondary" style="height: 28px; padding: 0 10px; font-size: 12px; gap: 5px;" title="Save current editor SQL as snippet">
              <span class="material-symbols-outlined" style="font-size: 15px; color: var(--color-primary);">bookmark_add</span>
              <span>Save</span>
            </button>
            <button type="button" id="console-clear-editor-btn" class="header-btn secondary" style="height: 28px; padding: 0 10px; font-size: 12px;" title="Clear Editor">
              <span class="material-symbols-outlined" style="font-size: 14px;">backspace</span>
              Clear
            </button>
            <button type="button" id="run-sql-btn" class="header-btn primary" style="height: 28px; padding: 0 12px; font-size: 12px;" title="Run SQL Query (Ctrl+Enter)">
              <span class="material-symbols-outlined" style="font-size: 15px;">play_arrow</span>
              Run
            </button>
          </div>
        </div>

        <div class="sql-editor-wrapper">
          <div class="sql-editor-layer-container">
            <!-- Autocomplete Floating Popup (VS Code style) -->
            <div id="console-autocomplete-popup" class="console-autocomplete-popup hidden"></div>
            <!-- Syntax Highlight Layer (Background) -->
            <div id="sql-highlight-layer" class="sql-editor"></div>
            <!-- Real Textarea (Foreground) -->
            <textarea id="sql-editor" class="sql-editor" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"></textarea>
            <!-- Right-Bottom Floating Expand Button -->
            <button type="button" id="console-expand-editor-btn" class="console-editor-expand-btn" title="Toggle Fullscreen Editor (Esc to exit)">
              <span class="material-symbols-outlined" id="console-expand-btn-icon" style="font-size: 14px;">open_in_full</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Collapsible Snippets Drawer -->
      <div id="console-snippets-drawer" class="console-snippets-drawer hidden">
        <div class="snippets-drawer-header">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined" style="font-size: 18px; color: #f59e0b;">bookmark</span>
            <span class="font-semibold text-13">Saved Queries</span>
          </div>
          <div class="flex items-center gap-1">
            <button type="button" id="snippets-drawer-new-btn" class="diff-mini-btn" title="Create New Snippet">
              <span class="material-symbols-outlined" style="font-size: 13px;">add</span>
              <span>New</span>
            </button>
            <button type="button" id="close-snippets-drawer-btn" class="modal-close-btn" style="padding: 2px;" title="Close Drawer">
              <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
            </button>
          </div>
        </div>

        <div class="snippets-drawer-search">
          <input type="text" id="snippets-search-input" class="diff-url-input" placeholder="Search snippets..." style="height: 28px; font-size: 11.5px;" />
        </div>

        <div id="snippets-list-container" class="snippets-list-container">
          <div class="p-3 text-12 text-center" style="color: var(--color-text-soft);">Loading snippets...</div>
        </div>
      </div>
    </div>
  `;

   const editor = document.getElementById('sql-editor');
   const historyPane = document.getElementById('console-history-pane');

   if (window.AppState.lastQuery) {
      editor.value = window.AppState.lastQuery;
   }

   const savedPaneHeight =
      localStorage.getItem('drixio_console_pane_height') ||
      localStorage.getItem('drixio_console_editor_height');
   const inputPane = container.querySelector('#console-input-pane');
   if (savedPaneHeight && inputPane) {
      const parsedH = parseInt(savedPaneHeight, 10);
      if (!isNaN(parsedH) && parsedH >= 140) {
         inputPane.style.height = `${parsedH}px`;
      }
   }

   const mainEl = document.querySelector('main');
   if (mainEl) mainEl.scrollTop = 0;
   window.scrollTo(0, 0);

   editor.focus({ preventScroll: true });

   bindConsoleEvents(editor, historyPane);
}
