export const SideBarHTML = /* html */ `
<aside id="sidebar-panel">
  <div id="sidebar-header">
    <div class="sidebar-header-title">
      <span class="sidebar-header-text">Table Editor</span>
    </div>
    <button id="sidebar-collapse-btn" class="sidebar-icon-btn" title="Toggle Sidebar" aria-label="Toggle Sidebar">
      <span class="material-symbols-outlined" id="sidebar-collapse-icon">menu_open</span>
    </button>
  </div>

  <div id="sidebar-content">
    <div id="schema-selector-wrap" class="hidden">
      <div class="schema-select-box" id="schema-select-box" title="Switch Schema" style="cursor: pointer;">
        <div class="schema-select-text">
          <span class="schema-prefix">schema</span>
          <span class="schema-current-name" id="schema-current-display">public</span>
        </div>
        <span class="material-symbols-outlined schema-chevron">expand_more</span>
      </div>
    </div>

    <button type="button" id="add-table-btn" class="sidebar-new-table-btn" title="Create New Table">
      <span class="material-symbols-outlined">add</span>
      <span>New table</span>
    </button>

    <div id="sidebar-search-row">
      <div id="search-bar" role="search">
        <span class="material-symbols-outlined" id="search-icon">search</span>
        <input type="text" placeholder="Search tables..." id="search-input" aria-label="Search tables" autocomplete="off" spellcheck="false" />
        <button id="search-clear-btn" class="search-clear-btn hidden" title="Clear filter" aria-label="Clear filter">✕</button>
      </div>
      <button type="button" id="refresh-tables-btn" class="sidebar-refresh-btn" title="Refresh tables" aria-label="Refresh tables">
        <span class="material-symbols-outlined">refresh</span>
      </button>
    </div>

    <nav id="table-nav" aria-label="Database Tables">
      <!-- Dynamically populated tables -->
    </nav>
  </div>

  <div id="sidebar-footer">
    <div class="sidebar-footer-top">
      <div class="sidebar-db-status" title="Database Connection Status">
        <span class="status-indicator-dot" id="sidebar-db-status-dot"></span>
        <span id="brand-db-type">CONNECTING...</span>
      </div>
      <span class="sidebar-version-tag">v1.2.1</span>
    </div>

    <div class="sidebar-footer-actions">
      <button type="button" id="sidebar-app-btn" class="sidebar-footer-btn" title="Install Desktop App Shortcut" aria-label="Install Desktop App Shortcut">
        <span class="material-symbols-outlined" style="font-size: 15px;">install_desktop</span>
        <span class="sidebar-footer-btn-label">App</span>
      </button>
      <button type="button" id="sidebar-health-btn" class="sidebar-footer-btn" title="Schema Health Doctor" aria-label="Schema Health Doctor">
        <span class="material-symbols-outlined" style="font-size: 15px;">health_and_safety</span>
        <span id="sidebar-health-badge" class="sidebar-footer-btn-label">Doctor</span>
      </button>
      <button type="button" id="sidebar-trash-btn" class="sidebar-trash-btn hidden" title="Table Recycle Bin" aria-label="Table Recycle Bin">
        <span class="material-symbols-outlined" style="font-size: 15px;">delete</span>
        <span id="sidebar-trash-count">0</span>
      </button>
    </div>
  </div>
</aside>
`;
