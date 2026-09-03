export const HeaderHTML = /* html */ `
<header>
  <div id="current-path" aria-label="Breadcrumbs">
    <div class="breadcrumb-item db-crumb">
      <span class="material-symbols-outlined breadcrumb-icon">database</span>
      <span id="db-name">database</span>
    </div>
    <span id="slash" class="material-symbols-outlined breadcrumb-separator">chevron_right</span>
    <div id="current-table" class="breadcrumb-item table-crumb">
      <span class="material-symbols-outlined" id="table-icon">table_chart</span>
      <span id="table-name">users</span>
    </div>
  </div>
  
  <div class="header-actions">
    <!-- Import Dropdown -->
    <div class="header-dropdown-wrap" style="position: relative;">
      <button id="import-btn" class="header-btn secondary" title="Import data, ERD layout or database">
        <span id="import-icon" class="material-symbols-outlined">upload</span>
        <span>Import</span>
        <span id="import-arrow-icon" class="material-symbols-outlined">arrow_drop_down</span>
      </button>

      <ul id="import-dropdown" class="dropdown-menu hidden" role="menu">
        <li class="dropdown-submenu">
          <a class="dropdown-item">
            <span class="material-symbols-outlined">table_chart</span>
            <span class="dropdown-item-label">Data</span>
            <span class="caret material-symbols-outlined">chevron_right</span>
          </a>
          <ul class="dropdown-menu sub-menu">
            <li>
              <button id="import-data-csv-btn" class="dropdown-item">
                <span class="material-symbols-outlined">description</span>
                <span class="dropdown-item-label">Table Records</span>
                <span class="dropdown-badge">CSV</span>
              </button>
            </li>
            <li>
              <button id="import-data-json-btn" class="dropdown-item">
                <span class="material-symbols-outlined">data_object</span>
                <span class="dropdown-item-label">Table Records</span>
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
              <button id="import-erd-json-btn" class="dropdown-item">
                <span class="material-symbols-outlined">layers</span>
                <span class="dropdown-item-label">Canvas Layout</span>
                <span class="dropdown-badge">JSON</span>
              </button>
            </li>
          </ul>
        </li>

        <li class="dropdown-divider"></li>

        <li>
          <button id="import-db-sql-btn" class="dropdown-item danger">
            <span class="material-symbols-outlined">database</span>
            <span class="dropdown-item-label">Restore Database</span>
            <span class="dropdown-badge danger">SQL</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Export Dropdown -->
    <div class="header-dropdown-wrap" style="position: relative;">
      <button id="export-btn" class="header-btn primary" title="Export database or table data">
        <span id="export-icon" class="material-symbols-outlined">download</span>
        <span>Export</span>
        <span id="export-arrow-icon" class="material-symbols-outlined">arrow_drop_down</span>
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
  </div>
</header>
`;
