export const HeaderHTML = /* html */ `
<header>
  <div class="header-left">
    <div class="header-brand">
      <div class="header-brand-icon">
        <span class="material-symbols-outlined">database</span>
      </div>
      <div class="header-brand-info">
        <div class="header-brand-text">
          <span class="header-brand-title">DRIXIO</span>
          <span class="header-brand-badge">STUDIO</span>
        </div>
        <span class="header-brand-by">By Horizora</span>
      </div>
    </div>
    <span class="header-brand-divider">/</span>
    <div id="current-path" aria-label="Breadcrumbs">
      <div class="header-dropdown-wrap" style="position: relative;">
        <div class="breadcrumb-item db-crumb" id="breadcrumb-db-crumb" title="Switch Database" role="button" tabindex="0">
          <span class="material-symbols-outlined breadcrumb-icon">dns</span>
          <span id="db-name">database</span>
          <span class="material-symbols-outlined breadcrumb-caret" id="db-switcher-caret">unfold_more</span>
        </div>
        <div id="db-switcher-dropdown" class="db-switcher-dropdown hidden" role="menu"></div>
      </div>
      <span id="slash" class="material-symbols-outlined breadcrumb-separator">chevron_right</span>
      <div id="current-table" class="breadcrumb-item table-crumb" title="Current Table">
        <span class="material-symbols-outlined" id="table-icon">table_chart</span>
        <span id="table-name">users</span>
      </div>
      <div id="env-badge-wrap" class="breadcrumb-item">
        <span id="env-badge" class="env-badge local hidden">LOCAL</span>
      </div>
      <button id="header-connect-btn" class="header-connect-pill" title="Database Connection Status & Switcher" type="button">
        <span class="material-symbols-outlined connect-icon">settings_ethernet</span>
        <span class="connect-label">Connect</span>
      </button>
    </div>
  </div>
  
  <div class="header-right">
    <!-- Quick Search Pill (Supabase Style) -->
    <div id="header-search-pill" class="header-search-pill" title="Quick search tables (Ctrl+K)">
      <span class="material-symbols-outlined search-icon">search</span>
      <span class="search-placeholder">Search...</span>
      <kbd class="search-kbd">Ctrl K</kbd>
    </div>

    <div class="header-actions">
      <!-- Import Pure Icon Button (Opens Import Modal) -->
      <button id="import-btn" class="header-icon-btn" title="Import Data / Restore Database" aria-label="Import Data" type="button">
        <span id="import-icon" class="material-symbols-outlined">upload</span>
      </button>

      <!-- Export Pure Icon Button (Dropdown Popover) -->
      <div class="header-dropdown-wrap" style="position: relative;">
        <button id="export-btn" class="header-icon-btn" title="Export Data / Schema" aria-label="Export Data" type="button">
          <span id="export-icon" class="material-symbols-outlined">download</span>
        </button>

      <ul id="export-dropdown" class="dropdown-menu hidden" role="menu">
        <li class="dropdown-submenu">
          <a class="dropdown-item">
            <span class="material-symbols-outlined">table_chart</span>
            <span class="dropdown-item-label">Data</span>
            <span class="caret material-symbols-outlined">chevron_right</span>
          </a>
          <ul class="dropdown-menu sub-menu">
            <li>
              <button id="export-data-csv-btn" class="dropdown-item">
                <span class="material-symbols-outlined">description</span>
                <span class="dropdown-item-label">Table Records</span>
                <span class="dropdown-badge">CSV</span>
              </button>
            </li>
            <li>
              <button id="export-data-json-btn" class="dropdown-item">
                <span class="material-symbols-outlined">data_object</span>
                <span class="dropdown-item-label">Table Records</span>
                <span class="dropdown-badge">JSON</span>
              </button>
            </li>
            <li class="data-tab-only" style="display: none;">
              <button id="export-data-filtered-csv-btn" class="dropdown-item" style="color: var(--color-primary);">
                <span class="material-symbols-outlined" style="color: var(--color-primary);">filter_alt</span>
                <span class="dropdown-item-label">Filtered Records</span>
                <span class="dropdown-badge" style="color: var(--color-primary); border-color: rgba(59, 130, 246, 0.3);">CSV</span>
              </button>
            </li>
            <li class="data-tab-only" style="display: none;">
              <button id="export-data-filtered-json-btn" class="dropdown-item" style="color: var(--color-primary);">
                <span class="material-symbols-outlined" style="color: var(--color-primary);">filter_alt</span>
                <span class="dropdown-item-label">Filtered Records</span>
                <span class="dropdown-badge" style="color: var(--color-primary); border-color: rgba(59, 130, 246, 0.3);">JSON</span>
              </button>
            </li>
          </ul>
        </li>

        <li class="dropdown-submenu">
          <a class="dropdown-item">
            <span class="material-symbols-outlined">schema</span>
            <span class="dropdown-item-label">Schema</span>
            <span class="caret material-symbols-outlined">chevron_right</span>
          </a>
          <ul class="dropdown-menu sub-menu">
            <li>
              <button id="export-schema-dict-btn" class="dropdown-item">
                <span class="material-symbols-outlined">menu_book</span>
                <span class="dropdown-item-label">Data Dictionary</span>
                <span class="dropdown-badge">MD</span>
              </button>
            </li>
            <li>
              <button id="export-schema-sql-btn" class="dropdown-item">
                <span class="material-symbols-outlined">code</span>
                <span class="dropdown-item-label">DDL Schema Only</span>
                <span class="dropdown-badge">SQL</span>
              </button>
            </li>
            <li>
              <button id="export-schema-snapshot-btn" class="dropdown-item">
                <span class="material-symbols-outlined">data_object</span>
                <span class="dropdown-item-label">Schema Snapshot</span>
                <span class="dropdown-badge">JSON</span>
              </button>
            </li>
          </ul>
        </li>

        <li class="dropdown-submenu console-tab-only" style="display: none;">
          <a class="dropdown-item">
            <span class="material-symbols-outlined">terminal</span>
            <span class="dropdown-item-label">SQL Console</span>
            <span class="caret material-symbols-outlined">chevron_right</span>
          </a>
          <ul class="dropdown-menu sub-menu">
            <li>
              <button id="export-console-csv-btn" class="dropdown-item">
                <span class="material-symbols-outlined">description</span>
                <span class="dropdown-item-label">Query Result</span>
                <span class="dropdown-badge">CSV</span>
              </button>
            </li>
            <li>
              <button id="export-console-json-btn" class="dropdown-item">
                <span class="material-symbols-outlined">data_object</span>
                <span class="dropdown-item-label">Query Result</span>
                <span class="dropdown-badge">JSON</span>
              </button>
            </li>
          </ul>
        </li>

        <li class="dropdown-submenu">
          <a class="dropdown-item">
            <span class="material-symbols-outlined">account_tree</span>
            <span class="dropdown-item-label">ERD</span>
            <span class="caret material-symbols-outlined">chevron_right</span>
          </a>
          <ul class="dropdown-menu sub-menu">
            <li>
              <button id="export-erd-json-btn" class="dropdown-item">
                <span class="material-symbols-outlined">layers</span>
                <span class="dropdown-item-label">Canvas Layout</span>
                <span class="dropdown-badge">JSON</span>
              </button>
            </li>
          </ul>
        </li>

        <li class="dropdown-divider"></li>

        <li>
          <button id="export-db-sql-btn" class="dropdown-item">
            <span class="material-symbols-outlined">database</span>
            <span class="dropdown-item-label">Full Database</span>
            <span class="dropdown-badge">SQL</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Help / Shortcuts Icon Button -->
    <button id="header-help-btn" class="header-icon-btn" title="Shortcuts & Documentation" aria-label="Help" type="button">
      <span class="material-symbols-outlined">help</span>
    </button>

    <!-- GitHub Link Icon Button -->
    <a href="https://github.com/TerKSDev/drixio" target="_blank" rel="noopener noreferrer" class="header-icon-btn" title="GitHub Repository" aria-label="GitHub">
      <span class="material-symbols-outlined">code</span>
    </a>
  </div>
</div>
</header>
`;
