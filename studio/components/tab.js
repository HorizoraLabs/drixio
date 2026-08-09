export const TabHTML = /* html */ `
<nav id="tab-nav">
  <button
    type="button"
    class="tab-btn"
    onclick="handleSwitchTab('data-btn')"
    id="data-btn"
  >
    <span class="material-symbols-outlined" id="data-icon"> table_rows </span>
    Data
  </button>
  <button
    class="tab-btn"
    onclick="handleSwitchTab('schema-btn')"
    id="schema-btn"
  >
    <span class="material-symbols-outlined" id="schema-icon">
      grid_layout_side
    </span>
    Schema (Table)
  </button>

  <div class="flex-1"></div>

  <button class="tab-btn" onclick="handleSwitchTab('status-btn')" id="status-btn">
    <span class="material-symbols-outlined" id="status-icon"> database </span>
    Database Status
  </button>
  <button class="tab-btn" onclick="handleSwitchTab('erd-btn')" id="erd-btn">
    <span class="material-symbols-outlined" id="erd-icon"> schema </span>
    ERD Visualization
  </button>
  <button class="tab-btn" onclick="handleSwitchTab('sql-btn')" id="sql-btn">
    <span class="material-symbols-outlined" id="sql-icon"> code </span>
    SQL Console
  </button>
</nav>
`;
