import { bindConsoleEvents } from "./events.js";

export function loadSqlConsole(tableName, btnElement, container) {
  const allBtns = document.querySelectorAll(".table-btn");
  allBtns.forEach((b) => b.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");

  const headerTableName = document.getElementById("table-name");
  if (headerTableName) headerTableName.textContent = "SQL Console";

  container.innerHTML = /* html */ `
    <div class="sql-console-wrapper">
      <div id="console-history-pane">
        <div id="console-welcome-msg">
          <div id="console-welcome-title">
            <div id="icon-container">
              <span class="material-symbols-outlined" class="icon-36">database_search</span>
            </div>
            <span>Welcome to Drixio SQL Terminal.</span>
          </div>
          <span id="console-welcome-description">Type your query below and press <b>Ctrl+Enter</b> or end with <b>;</b> and press <b>Enter</b> to execute.</span>
          <span id="console-welcome-hint"><b>Hint:</b> Highlight specific lines to only run the selection.</span>
        </div>
      </div>
      <div id="console-input-pane">
         <div class="sql-editor-wrapper">
           <span class="sql-prompt">sql &gt;</span>
           <div class="sql-editor-layer-container">
             <!-- Syntax Highlight Layer (Background) -->
             <div id="sql-highlight-layer" class="sql-editor"></div>
             <!-- Real Textarea (Foreground) -->
             <textarea id="sql-editor" class="sql-editor"></textarea>
           </div>
         </div>
         <div class="hidden justify-end mt-2">
           <button id="run-sql-btn" class="primary" class="btn-primary flex items-center gap-6px text-13 transition-opacity">
             <span class="material-symbols-outlined" class="icon-16">play_arrow</span> Run (Ctrl+Enter)
           </button>
         </div>
      </div>
    </div>
  `;

  const editor = document.getElementById("sql-editor");
  const historyPane = document.getElementById("console-history-pane");

  if (window.AppState.lastQuery) {
    editor.value = window.AppState.lastQuery;
  }
  editor.focus();

  bindConsoleEvents(editor, historyPane);
}
