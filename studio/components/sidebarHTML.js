export const SideBarHTML = /* html */ `
<aside id="sidebar-panel">
  <div id="sidebar-header">
    <div class="brand-left">
      <div class="brand-logo-badge">
        <span class="material-symbols-outlined" id="database-icon">database</span>
      </div>
      <div class="brand-container">
        <div class="brand-name">
          <h1 id="brand-title">DRIXIO</h1>
          <span id="brand-subtitle">STUDIO</span>
        </div>
        <span id="brand-by">By Horizora</span>
      </div>
    </div>
    <button id="sidebar-collapse-btn" class="sidebar-icon-btn" title="Toggle Sidebar Width" aria-label="Toggle Sidebar Width">
      <span class="material-symbols-outlined" id="sidebar-collapse-icon">menu_open</span>
    </button>
  </div>

  <div id="sidebar-content">
    <div id="search-bar" role="search">
      <span class="material-symbols-outlined" id="search-icon">search</span>
      <input type="text" placeholder="Filter tables..." id="search-input" aria-label="Search tables" autocomplete="off" spellcheck="false" />
      <button id="search-clear-btn" class="search-clear-btn hidden" title="Clear filter" aria-label="Clear filter">✕</button>
      <kbd class="search-kbd" title="Shortcut">/</kbd>
    </div>

    <div class="sidebar-section-header">
      <div class="section-title-wrap">
        <span class="section-title">TABLES</span>
        <span id="table-count-badge" class="section-count">0</span>
      </div>
      <div class="section-actions">
        <button id="refresh-tables-btn" class="sidebar-icon-btn" title="Refresh Table List" aria-label="Refresh Table List">
          <span class="material-symbols-outlined">refresh</span>
        </button>
      </div>
    </div>

    <nav id="table-nav" aria-label="Database Tables">
      <!-- Dynamically populated tables -->
    </nav>
  </div>

  <div id="sidebar-footer">
    <div class="sidebar-db-status" title="Database Connection Status">
      <span class="status-indicator-dot" id="sidebar-db-status-dot"></span>
      <span id="brand-db-type">CONNECTING...</span>
    </div>

    <div class="sidebar-footer-actions">
      <button id="theme-toggle" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme">
        <span class="material-symbols-outlined" id="theme-icon">dark_mode</span>
        <span id="theme-text">Theme</span>
      </button>
      <span class="sidebar-version-tag" title="Drixio Studio Edition">v1.1.8</span>
    </div>
  </div>
</aside>
`;
