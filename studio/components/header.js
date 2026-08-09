export const HeaderHTML = /* html */ `
<header>
  <div id="current-path">
    <span id="db-name">database</span>
    <span id="slash">/</span>
    <div id="current-table">
      <span class="material-symbols-outlined" id="table-icon"> table </span>
      <span id="table-name">users</span>
    </div>
  </div>
  
  
  <div class="header-actions" style="position: relative;">
    <button id="import-btn" class="secondary" title="Import">
      <span id="import-icon" class="material-symbols-outlined">upload</span>
      Import
    </button>
    <button id="export-btn" class="primary" title="Export">
      <span id="export-icon" class="material-symbols-outlined">download</span>
      Export
      <span id="export-arrow-icon" class="material-symbols-outlined">arrow_drop_down</span>
    </button>
    <ul id="export-dropdown" class="dropdown-menu hidden">
      <li class="dropdown-submenu">
        <a class="dropdown-item">
          <span class="material-symbols-outlined">table</span> Data
          <span class="caret material-symbols-outlined">chevron_right</span>
        </a>
        <ul class="dropdown-menu sub-menu">
          <li><button id="export-data-csv-btn" class="dropdown-item">Export as CSV</button></li>
          <li><button id="export-data-json-btn" class="dropdown-item">Export as JSON</button></li>
          <li class="data-tab-only" style="display: none;"><button id="export-data-filtered-csv-btn" class="dropdown-item" style="color: var(--color-primary);">Export as CSV with Queries</button></li>
          <li class="data-tab-only" style="display: none;"><button id="export-data-filtered-json-btn" class="dropdown-item" style="color: var(--color-primary);">Export as JSON with Queries</button></li>
        </ul>
      </li>

      <li class="dropdown-submenu">
        <a class="dropdown-item">
          <span class="material-symbols-outlined">schema</span> Schema
          <span class="caret material-symbols-outlined">chevron_right</span>
        </a>
        <ul class="dropdown-menu sub-menu">
          <li><button id="export-schema-dict-btn" class="dropdown-item">Data Dictionary (.md)</button></li>
          <li><button id="export-schema-sql-btn" class="dropdown-item">Schema Only (.sql)</button></li>
        </ul>
      </li>

      <li class="dropdown-submenu console-tab-only" style="display: none;">
        <a class="dropdown-item">
          <span class="material-symbols-outlined">terminal</span> SQL Console
          <span class="caret material-symbols-outlined">chevron_right</span>
        </a>
        <ul class="dropdown-menu sub-menu">
          <li><button id="export-console-csv-btn" class="dropdown-item">Export Result (CSV)</button></li>
          <li><button id="export-console-json-btn" class="dropdown-item">Export Result (JSON)</button></li>
        </ul>
      </li>

      <li class="dropdown-submenu">
        <a class="dropdown-item">
          <span class="material-symbols-outlined">account_tree</span> ERD
          <span class="caret material-symbols-outlined">chevron_right</span>
        </a>
        <ul class="dropdown-menu sub-menu">
          <li><button id="export-erd-json-btn" class="dropdown-item">Export Layout (JSON)</button></li>
        </ul>
      </li>

      <li class="dropdown-divider"></li>

      <li>
        <button id="export-db-sql-btn" class="dropdown-item">
          <span class="material-symbols-outlined">storage</span> Database Backup (.sql)
        </button>
      </li>
    </ul>
  </div>
</header>
`;
