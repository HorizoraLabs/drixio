export const TabHTML = /* html */ `
<nav id="tab-nav" role="tablist" aria-label="Views and tools">
  <!-- Table Scoped Underline Tabs -->
  <div class="table-tabs" role="tablist">
    <button
      type="button"
      class="tab-btn isCurrentTab"
      onclick="handleSwitchTab('data-btn')"
      id="data-btn"
      role="tab"
      title="View table data records"
    >
      <span class="material-symbols-outlined tab-icon" id="data-icon">table_chart</span>
      <span>Data</span>
    </button>
    <button
      type="button"
      class="tab-btn"
      onclick="handleSwitchTab('schema-btn')"
      id="schema-btn"
      role="tab"
      title="View and edit table schema"
    >
      <span class="material-symbols-outlined tab-icon" id="schema-icon">schema</span>
      <span>Schema</span>
    </button>
    <button
      type="button"
      class="tab-btn hidden"
      onclick="handleSwitchTab('connect-btn')"
      id="connect-btn"
      role="tab"
      title="Connect or create database"
    >
      <span class="material-symbols-outlined tab-icon" id="connect-icon">cable</span>
      <span>Connect</span>
    </button>
  </div>

  <div class="flex-1"></div>

  <!-- Global Database Tools (Clean flat buttons) -->
  <div class="global-tools" role="toolbar" aria-label="Global tools">
    <button
      type="button"
      class="tab-btn tool-btn"
      onclick="handleSwitchTab('status-btn')"
      id="status-btn"
      role="tab"
      title="Database metrics and health"
    >
      <span class="material-symbols-outlined tab-icon" id="status-icon">monitoring</span>
      <span>Status</span>
    </button>
    <button
      type="button"
      class="tab-btn tool-btn"
      onclick="handleSwitchTab('erd-btn')"
      id="erd-btn"
      role="tab"
      title="Entity relationship diagram"
    >
      <span class="material-symbols-outlined tab-icon" id="erd-icon">account_tree</span>
      <span>ERD</span>
    </button>
    <button
      type="button"
      class="tab-btn tool-btn"
      onclick="handleSwitchTab('sql-btn')"
      id="sql-btn"
      role="tab"
      title="Execute SQL queries"
    >
      <span class="material-symbols-outlined tab-icon" id="sql-icon">terminal</span>
      <span>Console</span>
    </button>
  </div>
</nav>
`;
