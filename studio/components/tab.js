export const TabHTML = /* html */ `
<nav id="tab-nav" role="navigation" aria-label="Views and tools">
  <!-- Top Navigation Items -->
  <div class="rail-top">
    <button
      type="button"
      class="tab-btn rail-item isCurrentTab"
      onclick="handleSwitchTab('data-btn')"
      id="data-btn"
      title="Table Editor"
      aria-label="Table Editor"
    >
      <span class="material-symbols-outlined rail-icon" id="data-icon">table_chart</span>
      <span class="rail-label">Table Editor</span>
    </button>

    <button
      type="button"
      class="tab-btn rail-item"
      onclick="handleSwitchTab('schema-btn')"
      id="schema-btn"
      title="Schema"
      aria-label="Schema"
    >
      <span class="material-symbols-outlined rail-icon" id="schema-icon">schema</span>
      <span class="rail-label">Schema</span>
    </button>

    <button
      type="button"
      class="tab-btn rail-item"
      onclick="handleSwitchTab('sql-btn')"
      id="sql-btn"
      title="SQL Editor"
      aria-label="SQL Editor"
    >
      <span class="material-symbols-outlined rail-icon" id="sql-icon">terminal</span>
      <span class="rail-label">SQL Editor</span>
    </button>

    <div class="rail-divider"></div>

    <button
      type="button"
      class="tab-btn rail-item"
      onclick="handleSwitchTab('erd-btn')"
      id="erd-btn"
      title="ERD Diagram"
      aria-label="ERD Diagram"
    >
      <span class="material-symbols-outlined rail-icon" id="erd-icon">account_tree</span>
      <span class="rail-label">ERD Diagram</span>
    </button>

    <button
      type="button"
      class="tab-btn rail-item"
      onclick="handleSwitchTab('status-btn')"
      id="status-btn"
      title="Database Status"
      aria-label="Database Status"
    >
      <span class="material-symbols-outlined rail-icon" id="status-icon">monitoring</span>
      <span class="rail-label">Status & Metrics</span>
    </button>

    <button
      type="button"
      class="tab-btn rail-item hidden"
      onclick="handleSwitchTab('connect-btn')"
      id="connect-btn"
      title="Connection"
      aria-label="Connection"
    >
      <span class="material-symbols-outlined rail-icon" id="connect-icon">cable</span>
      <span class="rail-label">Connection</span>
    </button>
  </div>

  <!-- Bottom: Theme Mode Toggle Button -->
  <div class="rail-bottom">
    <div class="rail-divider"></div>
    <button
      type="button"
      class="rail-item rail-theme-toggle"
      id="theme-toggle"
      title="Toggle Theme (Light / Dark)"
      aria-label="Toggle Theme"
    >
      <span class="material-symbols-outlined rail-icon" id="theme-icon">dark_mode</span>
      <span class="rail-label" id="theme-text">Dark Mode</span>
    </button>
  </div>
</nav>
`;
