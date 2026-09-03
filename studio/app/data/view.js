import { fetchTableSchema, fetchTableWithName } from "../../lib/api.js";
import { bindColumnResizer, bindCellSelection } from "../grid/view.js";
import { bindCellEditor } from "./events.js";
import { getFilterQuery, generateRowHtml } from "./utils.js";

export { saveDataGridEdits } from "./core.js";

export async function loadTableData(
  tableName,
  btnElement,
  whereClause = "",
  preserveState = false,
  container = null,
) {
  const allBtns = document.querySelectorAll(".table-btn");
  allBtns.forEach((b) => b.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");

  const headerTableName = document.getElementById("table-name");
  if (headerTableName) headerTableName.textContent = tableName;

  const renderTarget = container || document.getElementById("main-content");
  if (!preserveState) {
    renderTarget.innerHTML = "<div class='p-6'>Loading...</div>";
  }

  try {
    const schemaRes = await fetchTableSchema(tableName);
    if (!schemaRes.success) throw new Error(schemaRes.error);
    const schema = schemaRes.data;
    const pkColumn = schema.find((c) => c.isPk)?.name;

    if (!preserveState || !window.DataGrid) {
      window.DataGrid = {
        schema,
        pkColumn,
        pendingEdits: {},
        pendingInserts: [{}],
        pendingDeletes: new Set(),
        selectedCell: null,
        history: [],
        currentTransaction: null,
        sortState: { col: pkColumn || schema[0].name, asc: true },
        pagination: { limit: 50, offset: 0, isLoading: false, hasMore: true },
        selection: {
          isDragging: false,
          isDraggingRow: false,
          startRow: -1,
          startCol: -1,
          endRow: -1,
          endCol: -1,
        },
      };
    }

    // Cache the grid reference
    if (window.TableStates && window.TableStates[tableName]) {
      window.TableStates[tableName].dataGrid = window.DataGrid;
    }

    const options = {
      where: whereClause,
      limit: window.DataGrid.pagination.limit,
      offset: window.DataGrid.pagination.offset,
      orderCol: window.DataGrid.sortState.col,
      orderAsc: window.DataGrid.sortState.asc,
    };

    const res = await fetchTableWithName(tableName, options);
    if (res.success && res.data) {
      const rows = res.data.rows;
      const columns = res.data.columns;
      window.DataGrid.pagination.hasMore =
        rows.length === window.DataGrid.pagination.limit;

      let columnOptions = columns
        .map((c) => `<option value="${c}">${c}</option>`)
        .join("");

      if (!preserveState) {
        let html = `
          <div class="toolbar">
            <div class="filter-group">
              <div class="filter-icon-container">
                <span class="material-symbols-outlined" id="filter-icon">filter_list</span>
                <span>Filter</span>
              </div>
              <select id="filter-col-${tableName}" class="filter-select">${columnOptions}</select>
              <select id="filter-op-${tableName}" class="filter-select">
                <option value="=">=</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value=">=">&gt;=</option>
                <option value="<=">&lt;=</option>
                <option value="LIKE">LIKE</option>
                <option value="!=">!=</option>
              </select>
              <div class="filter-input-wrapper">
                <input type="text" id="filter-val-${tableName}" class="filter-input" placeholder="Filter value..." />
                <button type="button" id="btn-clear-filter-${tableName}" class="filter-clear-btn hidden" title="Clear filter">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
            <button id="btn-refresh-data-${tableName}" class="refresh-btn" title="Refresh Data (F5)">
              <span class="material-symbols-outlined">refresh</span>
            </button>
          </div>
          <div class="table-container" id="data-grid-container-${tableName}"></div>
        `;
        renderTarget.innerHTML = html;
      }

      let tableHtml = `<table class="data-table" id="data-grid-table-${tableName}"><thead><tr>`;
      tableHtml += `<th class="row-header">#</th>`;
      columns.forEach((col) => {
        const colSchema = schema.find((c) => c.name === col);
        let pkBadge = "";
        let typeText = colSchema?.type || "";
        if (colSchema) {
          const isPk = !!colSchema.isPk;
          const isFk = !!colSchema.fkTarget;
          if (isPk && isFk) {
            pkBadge = `<span class="col-badge badge-pfk" title="Primary Foreign Key (referencing ${colSchema.fkTarget.table}.${colSchema.fkTarget.column})">PFK</span>`;
          } else if (isPk) {
            pkBadge = `<span class="col-badge badge-pk" title="Primary Key">PK</span>`;
          } else if (isFk || colSchema.name.toLowerCase().includes("id")) {
            pkBadge = `<span class="col-badge badge-fk" title="Foreign Key">FK</span>`;
          }
        }
        let sortIcon = "";
        let isSorted = window.DataGrid.sortState.col === col;
        if (isSorted) {
          const arrowName = window.DataGrid.sortState.asc ? "arrow_upward" : "arrow_downward";
          sortIcon = `<span class="material-symbols-outlined th-sort-icon">${arrowName}</span>`;
        }
        tableHtml += /* html */ `<th class="sortable ${isSorted ? "sorted" : ""}" data-col="${col}">
                   <div class="th-content-wrapper">
                      <div class="th-col-info">
                         <div class="th-name-row">
                            <span class="th-col-name">${col}</span>
                            ${pkBadge}
                         </div>
                         ${typeText ? `<span class="th-col-type">${typeText}</span>` : ""}
                      </div>
                      <div class="th-sort-indicator ${isSorted ? "active" : ""}">
                         ${sortIcon}
                      </div>
                   </div>
                 </th>`;
      });
      tableHtml += `</tr></thead><tbody>`;

      if (rows && rows.length > 0) {
        rows.forEach((row, rowIndex) => {
          tableHtml += `<tr>${generateRowHtml(row, rowIndex, pkColumn, columns)}</tr>`;
        });
      }

      tableHtml += `<tr class="ghost-row-tr">`;
      const ghostIdx = rows ? rows.length : 0;
      tableHtml += `<td class="row-header" data-row-idx="${ghostIdx}">*</td>`;
      columns.forEach((col, cIdx) => {
        const cellHint = cIdx === 0 ? `<span class="ghost-cell-hint">+ Add Row</span>` : "";
        tableHtml += `<td class="data-cell ghost-row" data-row-idx="${ghostIdx}" data-col-idx="${cIdx}" data-insert-index="0" data-col="${col}">${cellHint}</td>`;
      });
      tableHtml += `</tr></tbody></table>`;

      const tableContainer = document.getElementById(
        `data-grid-container-${tableName}`,
      );
      if (!tableContainer) {
        // User navigated away (e.g., switched to Schema tab) while this was fetching
        return;
      }
      tableContainer.innerHTML = tableHtml;

      tableContainer.querySelectorAll("th.sortable").forEach((th) => {
        th.onclick = (e) => {
          if (window.DataGrid && window.DataGrid.isResizing) return;
          const hasPending =
            Object.keys(window.DataGrid.pendingEdits).length > 0 ||
            window.DataGrid.pendingInserts.length > 1 ||
            window.DataGrid.pendingDeletes.size > 0;
          if (hasPending) {
            alert(
              "You have unsaved changes. Please save changes before sorting.",
            );
            return;
          }

          const col = th.dataset.col;
          const currentTable = tableName;
          const grid = window.TableStates?.[currentTable]?.dataGrid || window.DataGrid;
          if (grid) {
            if (grid.sortState.col === col) {
              grid.sortState.asc = !grid.sortState.asc;
            } else {
              grid.sortState.col = col;
              grid.sortState.asc = true;
            }
            grid.pagination.offset = 0;
          }

          loadTableData(currentTable, btnElement, getFilterQuery(), true);
        };

        bindColumnResizer(th, window.DataGrid);
      });

      bindCellSelection(
        tableContainer,
        `data-grid-table-${tableName}`,
        window.DataGrid,
        columns.length,
      );
      bindCellEditor(tableContainer, schema, columns);

      if (!preserveState) {
        const inputElSearch = document.getElementById(
          `filter-val-${tableName}`,
        );

        const executeSearch = (resetOffset = true) => {
          if (resetOffset && window.DataGrid)
            window.DataGrid.pagination.offset = 0;

          loadTableData(tableName, btnElement, getFilterQuery(), true);
        };

        const clearFilterBtn = document.getElementById(`btn-clear-filter-${tableName}`);
        const updateClearBtn = () => {
          if (clearFilterBtn) {
            if (inputElSearch?.value.trim()) clearFilterBtn.classList.remove("hidden");
            else clearFilterBtn.classList.add("hidden");
          }
        };

        if (clearFilterBtn && inputElSearch) {
          clearFilterBtn.addEventListener("click", () => {
            inputElSearch.value = "";
            clearFilterBtn.classList.add("hidden");
            executeSearch(true);
            inputElSearch.focus();
          });
        }

        let searchTimeout;
        const debounceSearch = () => {
          updateClearBtn();
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(() => executeSearch(true), 400);
        };

        if (inputElSearch) {
          inputElSearch.addEventListener("input", debounceSearch);
        }

        const filterCol = document.getElementById(`filter-col-${tableName}`);
        const filterOp = document.getElementById(`filter-op-${tableName}`);
        if (filterCol)
          filterCol.addEventListener("change", () => executeSearch(true));
        if (filterOp)
          filterOp.addEventListener("change", () => executeSearch(true));

        const refreshData = () => {
          const hasPending =
            Object.keys(window.DataGrid.pendingEdits).length > 0 ||
            window.DataGrid.pendingInserts.length > 1 ||
            window.DataGrid.pendingDeletes.size > 0;
          if (hasPending) {
            const confirmDiscard = confirm(
              "You have unsaved changes. Are you sure you want to refresh and discard them?",
            );
            if (!confirmDiscard) return;
          }

          window.DataGrid.pendingEdits = {};
          window.DataGrid.pendingInserts = [{}];
          window.DataGrid.pendingDeletes = new Set();
          window.DataGrid.history = [];
          window.DataGrid.currentTransaction = null;
          window.updateSidebarDirtyState?.();

          executeSearch(false);
        };

        const refreshBtn = document.getElementById(
          `btn-refresh-data-${tableName}`,
        );
        if (refreshBtn) refreshBtn.onclick = refreshData;

        window.DataGrid.refreshData = refreshData;

        const loadMoreData = async () => {
          if (
            window.DataGrid.pagination.isLoading ||
            !window.DataGrid.pagination.hasMore
          )
            return;
          window.DataGrid.pagination.isLoading = true;
          window.DataGrid.pagination.offset += window.DataGrid.pagination.limit;

          const opts = {
            where: getFilterQuery(),
            limit: window.DataGrid.pagination.limit,
            offset: window.DataGrid.pagination.offset,
            orderCol: window.DataGrid.sortState.col,
            orderAsc: window.DataGrid.sortState.asc,
          };

          try {
            const resMore = await fetchTableWithName(tableName, opts);
            window.DataGrid.pagination.isLoading = false;
            if (resMore.success && resMore.data) {
              const moreRows = resMore.data.rows;
              window.DataGrid.pagination.hasMore =
                moreRows.length === window.DataGrid.pagination.limit;

              const tbody = document.querySelector(
                `#data-grid-table-${tableName} tbody`,
              );
              if (!tbody) return;

              const firstInsertRow = tbody
                .querySelector("td[data-insert-index]")
                ?.closest("tr");
              const startIdx = window.DataGrid.pagination.offset;

              moreRows.forEach((row, i) => {
                const tr = document.createElement("tr");
                tr.innerHTML = generateRowHtml(
                  row,
                  startIdx + i,
                  pkColumn,
                  columns,
                );
                if (firstInsertRow) {
                  tbody.insertBefore(tr, firstInsertRow);
                } else {
                  tbody.appendChild(tr);
                }
              });

              let currentIdx = startIdx + moreRows.length;
              const insertedTrs = tbody.querySelectorAll(
                "td[data-insert-index]",
              );
              const processedTrs = new Set();
              insertedTrs.forEach((td) => {
                const tr = td.closest("tr");
                if (processedTrs.has(tr)) return;
                processedTrs.add(tr);

                const rowHeader = tr.querySelector(".row-header");
                if (rowHeader) rowHeader.dataset.rowIdx = currentIdx;
                tr.querySelectorAll("td.data-cell").forEach(
                  (c) => (c.dataset.rowIdx = currentIdx),
                );
                currentIdx++;
              });
            }
          } catch (e) {
            window.DataGrid.pagination.isLoading = false;
          }
        };

        setTimeout(() => {
          const container = document.getElementById(
            `data-grid-container-${tableName}`,
          );
          if (container) {
            container.addEventListener("scroll", (e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.target;
              if (scrollTop + clientHeight >= scrollHeight - 50) {
                loadMoreData();
              }
            });
          }
        }, 50);
      }
    } else {
      renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Error: ${res.error}</div>`;
    }
  } catch (err) {
    renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Failed to load data: ${err.message}</div>`;
  }
}
