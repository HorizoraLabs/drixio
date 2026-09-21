export const HeaderHTML = /* html */ `
<header>
  <div class="header-left">
    <div class="header-brand">
      <img src="/icon.svg" id="drixio-logo" />
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
    </div>
  </div>
  
  <div class="header-center">
    <!-- Quick Search Pill (Supabase Style) -->
    <div id="header-search-pill" class="header-search-pill" title="Quick search tables (Ctrl+K)">
      <span class="material-symbols-outlined search-icon">search</span>
      <span class="search-placeholder">Search...</span>
      <kbd class="search-kbd">Ctrl K</kbd>
    </div>
  </div>

  <div class="header-right">
    <div class="header-actions">
      <!-- Data Migration Group (Pure Icons) -->
      <button id="import-btn" class="header-icon-btn" title="Import Data / Restore Database" aria-label="Import Data" type="button">
        <span id="import-icon" class="material-symbols-outlined">upload</span>
      </button>

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
            <li class="dropdown-divider" style="height: 1px; background: var(--color-border); margin: 4px 0;"></li>
            <li>
              <button id="export-data-masked-csv-btn" class="dropdown-item" style="color: #10b981;">
                <span class="material-symbols-outlined" style="color: #10b981;">enhanced_encryption</span>
                <span class="dropdown-item-label">Masked (PII Shield)</span>
                <span class="dropdown-badge" style="color: #10b981; border-color: rgba(16, 185, 129, 0.3);">CSV</span>
              </button>
            </li>
            <li>
              <button id="export-data-masked-json-btn" class="dropdown-item" style="color: #10b981;">
                <span class="material-symbols-outlined" style="color: #10b981;">enhanced_encryption</span>
                <span class="dropdown-item-label">Masked (PII Shield)</span>
                <span class="dropdown-badge" style="color: #10b981; border-color: rgba(16, 185, 129, 0.3);">JSON</span>
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
            <li class="dropdown-divider" style="height: 1px; background: var(--color-border); margin: 4px 0;"></li>
            <li>
              <button id="export-console-masked-csv-btn" class="dropdown-item" style="color: #10b981;">
                <span class="material-symbols-outlined" style="color: #10b981;">enhanced_encryption</span>
                <span class="dropdown-item-label">Masked Query Result</span>
                <span class="dropdown-badge" style="color: #10b981; border-color: rgba(16, 185, 129, 0.3);">CSV</span>
              </button>
            </li>
            <li>
              <button id="export-console-masked-json-btn" class="dropdown-item" style="color: #10b981;">
                <span class="material-symbols-outlined" style="color: #10b981;">enhanced_encryption</span>
                <span class="dropdown-item-label">Masked Query Result</span>
                <span class="dropdown-badge" style="color: #10b981; border-color: rgba(16, 185, 129, 0.3);">JSON</span>
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

      <div class="header-divider"></div>

      <!-- System Connection & Security Shield (Pure Icons) -->
      <button id="header-connect-btn" class="header-icon-btn" title="Database Connection Status & Switcher" aria-label="Database Connection" type="button">
        <span class="material-symbols-outlined connect-icon">settings_ethernet</span>
      </button>

      <button id="header-readonly-btn" class="header-icon-btn" title="Toggle Read-Only Protection Mode" aria-label="Toggle Read-Only Protection" type="button">
        <span class="material-symbols-outlined readonly-icon" id="readonly-icon">lock_open</span>
      </button>

      <div class="header-divider"></div>

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
