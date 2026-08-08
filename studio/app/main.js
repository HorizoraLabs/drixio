import { HeaderHTML } from "../components/header.js";
import { SideBarHTML } from "../components/search-bar.js";
import { TabHTML } from "../components/tab.js";
import { initSidebar } from "../components/sidebar.js";
import { loadTableData, saveDataGridEdits } from "./data/view.js";
import { loadTableSchema, saveSchemaEdits } from "./schema/view.js";
import { loadSqlConsole } from "./console/view.js";
import { loadErd } from "./erd/view.js";
import { fetchConfig } from "../lib/api.js";
import { initTheme } from "../components/theme.js";
import { initToast } from "../components/toast.js";
import { bindGridEvents } from "./grid/events.js";

const header = document.getElementById("header-container");
const sidebar = document.getElementById("sidebar-container");
const tab = document.getElementById("tab-container");

header.innerHTML = HeaderHTML;
sidebar.innerHTML = SideBarHTML;
tab.innerHTML = TabHTML;

window.AppState = {
  currentTable: null,
  currentTab: "data-btn",
  currentTableBtnElement: null,
  dbType: null,
};

fetchConfig().then((res) => {
  if (res && res.success && res.data) {
    window.AppState.dbType = res.data.dbType;
  }
});

window.TableStates = {};
window.ViewCache = {};

window.updateSidebarDirtyState = function () {
  const allBtns = document.querySelectorAll(".table-btn");
  allBtns.forEach((btn) => {
    const tableName = btn.dataset.table; // Assuming we add data-table to sidebar btns
    // Fallback if data-table is not present, use textContent
    const text = btn.querySelector("span").textContent;
    const tName = tableName || text.replace(/\s*\*$/, "");
    const state = window.TableStates[tName];

    let isDirty = false;
    if (state) {
      if (state.dataGrid) {
        const dg = state.dataGrid;
        if (
          Object.keys(dg.pendingEdits || {}).length > 0 ||
          (dg.pendingInserts &&
            dg.pendingInserts.some((obj) => Object.keys(obj).length > 0)) ||
          (dg.pendingDeletes && dg.pendingDeletes.size > 0)
        ) {
          isDirty = true;
        }
      }
      if (state.schemaGrid) {
        const sg = state.schemaGrid;
        const hasIndexEdits =
          sg.pendingIndexEdits &&
          (sg.pendingIndexEdits.added.length > 0 ||
            sg.pendingIndexEdits.dropped.length > 0);
        if (
          Object.keys(sg.pendingEdits || {}).length > 0 ||
          (sg.pendingInserts &&
            sg.pendingInserts.some((obj) => Object.keys(obj).length > 0)) ||
          (sg.pendingDeletes && sg.pendingDeletes.size > 0) ||
          hasIndexEdits
        ) {
          isDirty = true;
        }
      }
    }

    let span = btn.querySelector("span");
    let baseText = span.textContent.replace(/\s*\*$/, "");
    if (isDirty) {
      span.textContent = baseText + " *";
      span.style.fontWeight = "bold";
    } else {
      span.textContent = baseText;
      span.style.fontWeight = "normal";
    }
  });
};

window.handleSwitchTab = function (tab) {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((btn) => btn.classList.remove("isCurrentTab"));
  const currentTab = document.getElementById(tab);
  if (currentTab) currentTab.classList.add("isCurrentTab");
  window.AppState.currentTab = tab;

  if (tab === "erd-btn" || tab === "sql-btn" || tab === "status-btn") {
    // These are global tabs, clear table selection
    window.AppState.currentTable = null;
    window.AppState.currentTableBtnElement = null;
    document
      .querySelectorAll(".table-btn")
      .forEach((b) => b.classList.remove("active"));
  } else if (tab === "data-btn" || tab === "schema-btn") {
    // These tabs require a table, auto-select first one if none selected
    if (!window.AppState.currentTable) {
      const firstTableBtn = document.querySelector(".table-btn");
      if (firstTableBtn) {
        window.AppState.currentTable =
          firstTableBtn.dataset.table ||
          firstTableBtn.querySelector("span").textContent.replace(/\s*\*$/, "");
        window.AppState.currentTableBtnElement = firstTableBtn;
        firstTableBtn.classList.add("active");
      }
    }
  }

  window.renderCurrentView();
};

window.renderEmptyState = function (container) {
  container.innerHTML = /* html */ `
    <div class="empty-state">
      <div class="icon-container">
        <span class="material-symbols-outlined">database</span>
      </div>
      <h2>No Table Selected</h2>
      <p>Select a table from the sidebar to view its data, schema, or run SQL queries.</p>
    </div>
  `;
};

window.renderCurrentView = function (whereClause = "", preserveState = false) {
  const isGlobalTab = ["erd-btn", "sql-btn", "status-btn"].includes(
    window.AppState.currentTab,
  );
  const mainContent = document.getElementById("main-content");

  // Hide all view containers
  document
    .querySelectorAll(".view-container")
    .forEach((el) => (el.style.display = "none"));

  // Determine view ID
  const viewId = isGlobalTab
    ? `view-${window.AppState.currentTab}`
    : `view-${window.AppState.currentTab}-${window.AppState.currentTable}`;

  let container = document.getElementById(viewId);
  if (!container) {
    container = document.createElement("div");
    container.id = viewId;
    container.className = "view-container";
    container.style.width = "100%";
    container.style.flex = "1";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.overflow = "hidden";
    mainContent.appendChild(container);
  }

  container.style.display = "flex";

  if (!window.AppState.currentTable && !isGlobalTab) {
    window.renderEmptyState(container);
    return;
  }

  const tableName = window.AppState.currentTable;
  if (tableName && !window.TableStates[tableName]) {
    window.TableStates[tableName] = { dataGrid: null, schemaGrid: null };
  }

  if (window.AppState.currentTab === "data-btn") {
    // Restore state
    if (window.TableStates[tableName].dataGrid) {
      window.DataGrid = window.TableStates[tableName].dataGrid;
    }

    // Only fetch if it's new or not cached, unless refresh is triggered (preserveState handles sorting logic internally)
    if (!window.TableStates[tableName].dataGrid || !container.hasChildNodes()) {
      loadTableData(
        tableName,
        window.AppState.currentTableBtnElement,
        whereClause,
        preserveState,
        container,
      );
    }
  } else if (window.AppState.currentTab === "schema-btn") {
    if (window.TableStates[tableName].schemaGrid) {
      window.SchemaGrid = window.TableStates[tableName].schemaGrid;
    }
    if (
      !window.TableStates[tableName].schemaGrid ||
      !container.hasChildNodes()
    ) {
      loadTableSchema(
        tableName,
        window.AppState.currentTableBtnElement,
        container,
      );
    }
  } else if (window.AppState.currentTab === "sql-btn") {
    if (!container.hasChildNodes()) {
      loadSqlConsole(
        tableName,
        window.AppState.currentTableBtnElement,
        container,
      );
    }
  } else if (window.AppState.currentTab === "erd-btn") {
    if (!container.hasChildNodes()) {
      loadErd(container);
    }
  } else if (window.AppState.currentTab === "status-btn") {
    if (!container.hasChildNodes()) {
      container.innerHTML = /* html */ `<div style='padding:24px; color: var(--color-text-soft);'>Database Status Dashboard coming soon!</div>`;
    }
  }

  // Highlight active sidebar btn since DOM cache might lose active styling dynamically
  document
    .querySelectorAll(".table-btn")
    .forEach((b) => b.classList.remove("active"));
  if (window.AppState.currentTableBtnElement) {
    window.AppState.currentTableBtnElement.classList.add("active");
  }
};

window.saveDataGridEdits = saveDataGridEdits;
window.saveSchemaEdits = saveSchemaEdits;

document.addEventListener("DOMContentLoaded", () => {
  initSidebar();

  initTheme();
  initToast();
  bindGridEvents();
});
