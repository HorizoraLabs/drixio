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
            <button type="button" class="template-chip" data-sql="SELECT * FROM sqlite_master WHERE type='table';">Show Tables</button>
            <button type="button" class="template-chip" data-sql="SELECT 1 + 1 as ping;">Ping Database</button>
          </div>
        </div>
      </div>

      <div id="console-input-pane">
        <div class="console-editor-toolbar">
          <div class="editor-toolbar-left">
            <span class="editor-mode-tag">
              <span class="material-symbols-outlined" style="font-size: 14px;">code</span>
              SQL
            </span>
            <span class="editor-shortcut-info">Press <b>Ctrl+Enter</b> to run</span>
          </div>
          <div class="editor-toolbar-right">
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
            <textarea id="sql-editor" class="sql-editor" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>
          </div>
        </div>
      </div>
    </div>
  `;

   const editor = document.getElementById('sql-editor');
   const historyPane = document.getElementById('console-history-pane');

   if (window.AppState.lastQuery) {
      editor.value = window.AppState.lastQuery;
   }
   editor.focus();

   bindConsoleEvents(editor, historyPane);
}
