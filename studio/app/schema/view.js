import { fetchTableSchema, fetchTableIndexes } from "../../lib/api.js";
import { bindSchemaCellEditor } from "./events.js";
import { bindColumnResizer, bindCellSelection } from "../grid/view.js";

export { saveSchemaEdits } from "./core.js";

export async function loadTableSchema(tableName, btnElement, container = null) {
  const allBtns = document.querySelectorAll(".table-btn");
  allBtns.forEach((b) => b.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");

  const headerTableName = document.getElementById("table-name");
  if (headerTableName) headerTableName.textContent = tableName + " (Schema)";

  const renderTarget = container || document.getElementById("main-content");
  renderTarget.innerHTML = "<div class='p-6'>Loading Schema...</div>";

  try {
    const [res, indexesRes] = await Promise.all([
      fetchTableSchema(tableName),
      fetchTableIndexes(tableName),
    ]);

    if (res.success && res.data) {
      let schema = res.data;
      let indexes =
        indexesRes.success && indexesRes.data ? indexesRes.data : [];

      window.SchemaGrid = {
        schema,
        indexes,
        pendingEdits: {},
        pendingIndexEdits: { added: [], dropped: [] },
        pendingInserts: [{}],
        pendingDeletes: new Set(),
        selectedCell: null,
        history: [],
        currentTransaction: null,
        sortState: { colKey: null, asc: true },
        filterText: "",
        isResizing: false,
        selection: {
          startRow: -1,
          startCol: -1,
          endRow: -1,
          endCol: -1,
          isDragging: false,
        },
      };

      if (window.TableStates && window.TableStates[tableName]) {
        window.TableStates[tableName].schemaGrid = window.SchemaGrid;
      }

      renderTarget.innerHTML = /* html */ `
        <div class="toolbar">
          <div class="filter-group">
            <div class="filter-icon-container">
              <span class="material-symbols-outlined">search</span>
              <span>Search</span>
            </div>
            <input type="text" id="schema-search-val-${tableName}" class="filter-input" placeholder="Search name or type..." class="w-250" value="${window.SchemaGrid.filterText}" />
          </div>
          <div class="flex-1"></div>
          <button id="btn-refresh-schema-${tableName}" class="refresh-btn" title="Refresh Schema (F5)"><span class="material-symbols-outlined">refresh</span></button>
        </div>
        <div id="schema-grid-container-${tableName}" class="table-container"></div>
      `;

      window.renderSchemaGrid = () => {
        const tableContainer = document.getElementById(
          `schema-grid-container-${tableName}`,
        );
        if (!tableContainer) return;

        let displaySchema = [...window.SchemaGrid.schema];

        if (window.SchemaGrid.filterText) {
          const lowerF = window.SchemaGrid.filterText.toLowerCase();
          displaySchema = displaySchema.filter(
            (c) =>
              (c.name && c.name.toLowerCase().includes(lowerF)) ||
              (c.type && c.type.toLowerCase().includes(lowerF)),
          );
        }

        if (window.SchemaGrid.sortState.colKey) {
          displaySchema.sort((a, b) => {
            const key = window.SchemaGrid.sortState.colKey;
            let valA = a[key];
            let valB = b[key];
            if (valA === undefined || valA === null) valA = "";
            if (valB === undefined || valB === null) valB = "";
            if (valA < valB) return window.SchemaGrid.sortState.asc ? -1 : 1;
            if (valA > valB) return window.SchemaGrid.sortState.asc ? 1 : -1;
            return 0;
          });
        }

        const columns = [
          "name",
          "type",
          "isPk",
          "nullable",
          "defaultValue",
          "indexing",
        ];
        const columnLabels = [
          "Name",
          "Type",
          "PK/FK",
          "Nullable",
          "Default Value",
          "Indexing",
        ];

        let tableHtml = `<table class="data-table" id="schema-grid-table-${tableName}"><thead><tr><th class="row-header">#</th>`;
        columns.forEach((cKey, i) => {
          let sortArrow = "";
          if (window.SchemaGrid.sortState.colKey === cKey) {
            sortArrow = window.SchemaGrid.sortState.asc ? "▲" : "▼";
          }
          tableHtml += `<th class="sortable" data-col-key="${cKey}">
                     <div class="flex justify-between items-center">
                        <div>${columnLabels[i]}</div>
                        <div class="sort-arrow" class="text-10 opacity-80 ml-2 w-12 text-right">${sortArrow}</div>
                     </div>
                   </th>`;
        });
        tableHtml += `</tr></thead><tbody>`;

        if (displaySchema && displaySchema.length > 0) {
          displaySchema.forEach((col, rowIndex) => {
            tableHtml += `<tr><td class="row-header" data-row-idx="${rowIndex}">${rowIndex + 1}</td>`;

            columns.forEach((cKey, cIdx) => {
              if (cKey === "indexing") {
                if (rowIndex === 0) {
                  const numRows =
                    (displaySchema ? displaySchema.length : 0) + 1; // +1 for ghost row
                  const idxCount = window.SchemaGrid.indexes.length;
                  const addedCount =
                    window.SchemaGrid.pendingIndexEdits.added.length;
                  const droppedCount =
                    window.SchemaGrid.pendingIndexEdits.dropped.length;
                  const total = idxCount + addedCount - droppedCount;

                  tableHtml += `<td class="data-cell manage-indexes-cell" rowspan="${numRows}" class="text-center align-middle cursor-pointer font-medium border-l text-brand">
                    Manage Indexes (${total})
                  </td>`;
                }
                return; // Skip rendering td for cKey === "indexing" if rowIndex > 0
              }

              let val = col[cKey];
              if (cKey === "isPk") {
                const isPk = val;
                const isFk = !!col.fkTarget;
                if (isPk && isFk)
                  val = `PK, FK (${col.fkTarget.table}.${col.fkTarget.column})`;
                else if (isPk) val = "PK";
                else if (isFk)
                  val = `FK (${col.fkTarget.table}.${col.fkTarget.column})`;
                else val = "-";
              } else if (cKey === "nullable") val = val ? "Yes" : "No";
              else if (val === null || val === undefined) val = "";

              const safeValForAttr = String(val).replace(/"/g, "&quot;");
              const safeValForHtml =
                val === ""
                  ? `<span class="text-soft">-</span>`
                  : String(val).replace(/</g, "&lt;");
              tableHtml += `<td class="data-cell" data-row-idx="${rowIndex}" data-col-idx="${cIdx}" data-pk="${col.name}" data-col-key="${cKey}" data-original="${safeValForAttr}">${safeValForHtml}</td>`;
            });
            tableHtml += `</tr>`;
          });
        }

        tableHtml += `<tr class="ghost-row-tr">`;
        const ghostIdx = displaySchema ? displaySchema.length : 0;
        tableHtml += `<td class="row-header" data-row-idx="${ghostIdx}">*</td>`;
        columns.forEach((cKey, cIdx) => {
          if (cKey === "indexing") return;
          tableHtml += `<td class="data-cell ghost-row" data-row-idx="${ghostIdx}" data-col-idx="${cIdx}" data-insert-index="0" data-col-key="${cKey}">+ New</td>`;
        });
        tableHtml += `</tr></tbody></table>`;
        tableContainer.innerHTML = tableHtml;

        document
          .querySelectorAll(`#schema-grid-table-${tableName} th.sortable`)
          .forEach((th) => {
            th.onclick = (e) => {
              if (window.SchemaGrid.isResizing) return;
              const hasPending =
                Object.keys(window.SchemaGrid.pendingEdits).length > 0 ||
                window.SchemaGrid.pendingInserts.length > 1 ||
                window.SchemaGrid.pendingDeletes.size > 0 ||
                window.SchemaGrid.pendingIndexEdits.added.length > 0 ||
                window.SchemaGrid.pendingIndexEdits.dropped.length > 0;
              if (hasPending) {
                alert(
                  "You have unsaved changes! Please press Ctrl+S to save them before sorting.",
                );
                return;
              }
              const colKey = th.dataset.colKey;
              if (window.SchemaGrid.sortState.colKey === colKey) {
                window.SchemaGrid.sortState.asc =
                  !window.SchemaGrid.sortState.asc;
              } else {
                window.SchemaGrid.sortState.colKey = colKey;
                window.SchemaGrid.sortState.asc = true;
              }
              window.SchemaGrid.selection = {
                startRow: -1,
                startCol: -1,
                endRow: -1,
                endCol: -1,
                isDragging: false,
              };
              window.renderSchemaGrid();
            };
            bindColumnResizer(th, window.SchemaGrid);
          });

        bindCellSelection(
          tableContainer,
          `schema-grid-table-${tableName}`,
          window.SchemaGrid,
          columns.length,
        );
        bindSchemaCellEditor(tableContainer, columns);
      };

      window.renderSchemaGrid();

      const searchInput = document.getElementById(
        `schema-search-val-${tableName}`,
      );
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          window.SchemaGrid.filterText = e.target.value;
          window.SchemaGrid.selection = {
            startRow: -1,
            startCol: -1,
            endRow: -1,
            endCol: -1,
            isDragging: false,
          };
          window.renderSchemaGrid();
        });
      }

      const refreshBtn = document.getElementById(
        `btn-refresh-schema-${tableName}`,
      );
      if (refreshBtn)
        refreshBtn.onclick = () => {
          const hasPending =
            Object.keys(window.SchemaGrid.pendingEdits).length > 0 ||
            window.SchemaGrid.pendingInserts.length > 1 ||
            window.SchemaGrid.pendingDeletes.size > 0 ||
            window.SchemaGrid.pendingIndexEdits.added.length > 0 ||
            window.SchemaGrid.pendingIndexEdits.dropped.length > 0;
          if (hasPending) {
            if (
              !confirm(
                "You have unsaved changes. Are you sure you want to refresh and discard them?",
              )
            )
              return;
          }

          window.SchemaGrid.pendingEdits = {};
          window.SchemaGrid.pendingInserts = [{}];
          window.SchemaGrid.pendingDeletes.clear();
          window.SchemaGrid.pendingIndexEdits = { added: [], dropped: [] };
          window.SchemaGrid.history = [];
          window.SchemaGrid.currentTransaction = null;
          window.updateSidebarDirtyState?.();

          loadTableSchema(
            tableName,
            btnElement,
            document.getElementById(`view-schema-btn-${tableName}`),
          );
        };
    } else {
      renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Error: ${res.error}</div>`;
    }
  } catch (err) {
    renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Failed to load schema: ${err.message}</div>`;
  }
}
