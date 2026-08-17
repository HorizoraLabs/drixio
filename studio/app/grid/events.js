import {
  updateCell,
  duplicateDataRows,
  markRowDeleted,
  unmarkRowDeleted,
} from "../data/core.js";
import {
  updateSchemaCell,
  duplicateSchemaRows,
  markSchemaRowDeleted,
  unmarkSchemaRowDeleted,
} from "../schema/core.js";
import { renderSelection } from "./view.js";
import { showContextMenu } from "../../components/contextMenu.js";

export const bindGridEvents = () => {
  document.addEventListener("mouseup", () => {
    if (window.DataGrid && window.DataGrid.selection) {
      window.DataGrid.selection.isDragging = false;
    }
    if (window.SchemaGrid && window.SchemaGrid.selection) {
      window.SchemaGrid.selection.isDragging = false;
    }
  });

  document.addEventListener("contextmenu", (e) => {
    const isData = window.AppState?.currentTab === "data-btn";
    const isSchema = window.AppState?.currentTab === "schema-btn";
    if (!isData && !isSchema) return;
    if (isData && !window.DataGrid) return;
    if (isSchema && !window.SchemaGrid) return;

    const rowHeader = e.target.closest("td.row-header");
    if (!rowHeader) return;

    e.preventDefault();
    const rowIdx = parseInt(rowHeader.dataset.rowIdx);

    const handleContextMenuAction = (actionType) => {
      let rowsToProcess = [rowIdx];
      const grid = isData ? window.DataGrid : window.SchemaGrid;
      if (grid && grid.selection && grid.selection.startRow !== -1) {
        const s = grid.selection;
        const minR = Math.min(s.startRow, s.endRow);
        const maxR = Math.max(s.startRow, s.endRow);
        if (rowIdx >= minR && rowIdx <= maxR) {
          rowsToProcess = [];
          for (let i = minR; i <= maxR; i++) rowsToProcess.push(i);
        }
      }

      if (isData) {
        {
          window.DataGrid.currentTransaction = [];
          if (actionType === "delete") {
            rowsToProcess.forEach((r) => markRowDeleted(r));
          } else if (actionType === "duplicate") {
            duplicateDataRows(
              rowsToProcess,
              window.DataGrid.schema.map((c) => c.name),
            );
            setTimeout(() => {
              const tableContainer = document.getElementById(
                `data-grid-container-${window.AppState.currentTable}`,
              );
              if (tableContainer)
                tableContainer.scrollTop = tableContainer.scrollHeight;
            }, 50);
          }
          if (window.DataGrid.currentTransaction.length > 0)
            window.DataGrid.history.push(window.DataGrid.currentTransaction);
          window.DataGrid.currentTransaction = null;
        }
      } else if (isSchema) {
        {
          window.SchemaGrid.currentTransaction = [];
          if (actionType === "delete") {
            rowsToProcess.forEach((r) => markSchemaRowDeleted(r));
          } else if (actionType === "duplicate") {
            duplicateSchemaRows(rowsToProcess, [
              "name",
              "type",
              "isPk",
              "nullable",
              "defaultValue",
              "Index",
            ]);
            setTimeout(() => {
              const tableContainer = document.getElementById(
                `schema-grid-container-${window.AppState.currentTable}`,
              );
              if (tableContainer)
                tableContainer.scrollTop = tableContainer.scrollHeight;
            }, 50);
          }
          if (window.SchemaGrid.currentTransaction.length > 0)
            window.SchemaGrid.history.push(
              window.SchemaGrid.currentTransaction,
            );
          window.SchemaGrid.currentTransaction = null;
        }
      }
    };

    showContextMenu(e, [
      {
        label: 'Duplicate Row(s)',
        icon: 'content_copy',
        action: () => handleContextMenuAction("duplicate")
      },
      'divider',
      {
        label: 'Delete Row(s)',
        icon: 'delete',
        danger: true,
        action: () => handleContextMenuAction("delete")
      }
    ]);
  });

  document.addEventListener("keydown", (e) => {
    const isData = window.AppState?.currentTab === "data-btn";
    const isSchema = window.AppState?.currentTab === "schema-btn";

    if (e.key === "F5") {
      if (isData && window.DataGrid?.refreshData) {
        e.preventDefault();
        window.DataGrid.refreshData();
      } else if (isSchema && document.getElementById("btn-refresh-schema")) {
        e.preventDefault();
        document.getElementById("btn-refresh-schema").click();
      }
      return;
    }

    if (!isData && !isSchema) return;
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "SELECT" ||
      e.target.tagName === "TEXTAREA"
    )
      return;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      const grid = isData ? window.DataGrid : window.SchemaGrid;
      if (!grid || !grid.selection) return;
      e.preventDefault();

      const s = grid.selection;
      if (s.startRow === -1) return;

      const maxCols = isData ? grid.schema.length : 5;
      const t = window.AppState?.currentTable;
      const rowElements = document.querySelectorAll(
        isData
          ? `#data-grid-table-${t} tbody tr`
          : `#schema-grid-table-${t} tbody tr`,
      );
      const maxRows = rowElements.length > 0 ? rowElements.length - 1 : 0;

      let targetRow = e.shiftKey ? s.endRow : s.startRow;
      let targetCol = e.shiftKey ? s.endCol : s.startCol;

      if (e.key === "ArrowUp") targetRow = Math.max(0, targetRow - 1);
      if (e.key === "ArrowDown") targetRow = Math.min(maxRows, targetRow + 1);
      if (e.key === "ArrowLeft") targetCol = Math.max(0, targetCol - 1);
      if (e.key === "ArrowRight")
        targetCol = Math.min(maxCols - 1, targetCol + 1);

      if (e.shiftKey) {
        s.endRow = targetRow;
        s.endCol = targetCol;
      } else {
        s.startRow = targetRow;
        s.endRow = targetRow;
        s.startCol = targetCol;
        s.endCol = targetCol;
      }

      const tableId = isData
        ? `data-grid-table-${t}`
        : `schema-grid-table-${t}`;
      renderSelection(tableId, grid);

      setTimeout(() => {
        const td = document.querySelector(
          isData
            ? `#data-grid-table-${t} td.data-cell[data-row-idx="${targetRow}"][data-col-idx="${targetCol}"]`
            : `#schema-grid-table-${t} td.data-cell[data-row-idx="${targetRow}"][data-col-idx="${targetCol}"]`,
        );
        if (td) {
          const container = document.getElementById(
            isData ? `data-grid-container-${t}` : `schema-grid-container-${t}`,
          );
          if (container) {
            const tdRect = td.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            if (tdRect.bottom > containerRect.bottom) {
              container.scrollTop += tdRect.bottom - containerRect.bottom + 5;
            } else if (tdRect.top < containerRect.top + 30) {
              container.scrollTop -= containerRect.top + 30 - tdRect.top;
            }

            if (tdRect.right > containerRect.right) {
              container.scrollLeft += tdRect.right - containerRect.right + 5;
            } else if (tdRect.left < containerRect.left + 50) {
              container.scrollLeft -= containerRect.left + 50 - tdRect.left;
            }
          }
        }
      }, 5);
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      const grid = isData ? window.DataGrid : window.SchemaGrid;
      if (!grid || !grid.selection || grid.selection.startRow === -1) return;
      e.preventDefault();

      const t = window.AppState?.currentTable;
      let targetRow = Math.min(grid.selection.startRow, grid.selection.endRow);
      let targetCol = Math.min(grid.selection.startCol, grid.selection.endCol);

      if (e.key === "Enter") {
        const td = document.querySelector(
          isData
            ? `#data-grid-table-${t} td.data-cell[data-row-idx="${targetRow}"][data-col-idx="${targetCol}"]`
            : `#schema-grid-table-${t} td.data-cell[data-row-idx="${targetRow}"][data-col-idx="${targetCol}"]`,
        );
        if (td) {
          const dblclickEvent = new MouseEvent("dblclick", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          td.dispatchEvent(dblclickEvent);
        }
        return;
      }

      if (e.key === "Tab") {
        const maxCols = isData ? grid.schema.length : 5;
        const rowElements = document.querySelectorAll(
          isData
            ? `#data-grid-table-${t} tbody tr`
            : `#schema-grid-table-${t} tbody tr`,
        );
        const maxRows = rowElements.length > 0 ? rowElements.length - 1 : 0;

        if (e.shiftKey) {
          targetCol -= 1;
          if (targetCol < 0) {
            targetCol = maxCols - 1;
            targetRow = Math.max(0, targetRow - 1);
          }
        } else {
          targetCol += 1;
          if (targetCol >= maxCols) {
            targetCol = 0;
            targetRow = Math.min(maxRows, targetRow + 1);
          }
        }

        grid.selection.startRow = targetRow;
        grid.selection.endRow = targetRow;
        grid.selection.startCol = targetCol;
        grid.selection.endCol = targetCol;

        const tableId = isData
          ? `data-grid-table-${t}`
          : `schema-grid-table-${t}`;
        renderSelection(tableId, grid);

        setTimeout(() => {
          const td = document.querySelector(
            isData
              ? `#data-grid-table-${t} td.data-cell[data-row-idx="${targetRow}"][data-col-idx="${targetCol}"]`
              : `#schema-grid-table-${t} td.data-cell[data-row-idx="${targetRow}"][data-col-idx="${targetCol}"]`,
          );
          if (td) {
            const container = document.getElementById(
              isData
                ? `data-grid-container-${t}`
                : `schema-grid-container-${t}`,
            );
            if (container) {
              const tdRect = td.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();

              if (tdRect.bottom > containerRect.bottom) {
                container.scrollTop += tdRect.bottom - containerRect.bottom + 5;
              } else if (tdRect.top < containerRect.top + 30) {
                container.scrollTop -= containerRect.top + 30 - tdRect.top;
              }

              if (tdRect.right > containerRect.right) {
                container.scrollLeft += tdRect.right - containerRect.right + 5;
              } else if (tdRect.left < containerRect.left + 50) {
                container.scrollLeft -= containerRect.left + 50 - tdRect.left;
              }
            }
          }
        }, 5);
        return;
      }
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (isData) {
        {
          window.DataGrid.currentTransaction = [];
          document
            .querySelectorAll(
              `#data-grid-table-${window.AppState.currentTable} .cell-in-range`,
            )
            .forEach((td) =>
              updateCell(
                td,
                "",
                window.DataGrid.schema.map((c) => c.name),
              ),
            );
          if (window.DataGrid.currentTransaction.length > 0)
            window.DataGrid.history.push(window.DataGrid.currentTransaction);
          window.DataGrid.currentTransaction = null;
        }
      } else if (isSchema) {
        {
          window.SchemaGrid.currentTransaction = [];
          const cols = ["name", "type", "isPk", "nullable", "defaultValue"];
          document
            .querySelectorAll(
              `#schema-grid-table-${window.AppState.currentTable} .cell-in-range`,
            )
            .forEach((td) => {
              if (
                td.dataset.insertIndex !== undefined ||
                td.dataset.colKey === "name"
              )
                updateSchemaCell(td, "", cols);
            });
          if (window.SchemaGrid.currentTransaction.length > 0)
            window.SchemaGrid.history.push(
              window.SchemaGrid.currentTransaction,
            );
          window.SchemaGrid.currentTransaction = null;
        }
      }
    }

    if (e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isData) window.saveDataGridEdits();
      if (isSchema) window.saveSchemaEdits();
    }

    if (e.key.toLowerCase() === "c" && (e.ctrlKey || e.metaKey)) {
      const grid = isData ? window.DataGrid : window.SchemaGrid;
      const s = grid.selection;
      if (s.startRow === -1) return;
      const minR = Math.min(s.startRow, s.endRow);
      const maxR = Math.max(s.startRow, s.endRow);
      const minC = Math.min(s.startCol, s.endCol);
      const maxC = Math.max(s.startCol, s.endCol);

      let tsv = "";
      for (let r = minR; r <= maxR; r++) {
        let rowArr = [];
        for (let c = minC; c <= maxC; c++) {
          const td = document.querySelector(
            isData
              ? `#data-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${r}"][data-col-idx="${c}"]`
              : `#schema-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${r}"][data-col-idx="${c}"]`,
          );
          if (td) {
            const val = td.textContent.replace(/^null$|^\+ New$/, "");
            rowArr.push(val);
          }
        }
        tsv += rowArr.join("\t") + "\n";
      }
      navigator.clipboard.writeText(tsv.trimEnd());

      document.querySelectorAll(".cell-in-range").forEach((td) => {
        td.style.backgroundColor = "var(--color-copy-flash)";
        setTimeout(() => (td.style.backgroundColor = ""), 150);
      });
    }

    if (e.key === "-" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const grid = isData ? window.DataGrid : window.SchemaGrid;
      const s = grid.selection;
      if (s.startRow === -1) return;
      const minR = Math.min(s.startRow, s.endRow);
      const maxR = Math.max(s.startRow, s.endRow);

      if (isData) {
        {
          grid.currentTransaction = [];
          for (let r = minR; r <= maxR; r++) markRowDeleted(r);
          if (grid.currentTransaction.length > 0)
            grid.history.push(grid.currentTransaction);
          grid.currentTransaction = null;
        }
      } else if (isSchema) {
        {
          grid.currentTransaction = [];
          for (let r = minR; r <= maxR; r++) markSchemaRowDeleted(r);
          if (grid.currentTransaction.length > 0)
            grid.history.push(grid.currentTransaction);
          grid.currentTransaction = null;
        }
      }
    }

    if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isData) {
        const lastTx = window.DataGrid.history?.pop();
        if (lastTx) {
          {
            const cols = window.DataGrid.schema.map((c) => c.name);
            for (let i = lastTx.length - 1; i >= 0; i--) {
              const act = lastTx[i];
              if (act.type === "delete") unmarkRowDeleted(act.rowIdx, act.pk);
              else updateCell(act.td, act.oldVal, cols, false);
            }
          }
        }
      } else if (isSchema) {
        const lastTx = window.SchemaGrid.history?.pop();
        if (lastTx) {
          {
            const cols = ["name", "type", "isPk", "nullable", "defaultValue"];
            for (let i = lastTx.length - 1; i >= 0; i--) {
              const act = lastTx[i];
              if (act.type === "delete")
                unmarkSchemaRowDeleted(act.rowIdx, act.pk);
              else updateSchemaCell(act.td, act.oldVal, cols, false);
            }
          }
        }
      }
    }
  });

  document.addEventListener("paste", (e) => {
    const isData = window.AppState?.currentTab === "data-btn";
    const isSchema = window.AppState?.currentTab === "schema-btn";
    if (!isData && !isSchema) return;

    const grid = isData ? window.DataGrid : window.SchemaGrid;
    if (!grid) return;

    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "SELECT" ||
      e.target.tagName === "TEXTAREA"
    )
      return;

    const s = grid.selection;
    if (s.startRow === -1) return;

    const pasteData = e.clipboardData.getData("text");
    if (!pasteData) return;
    e.preventDefault();

    const rows = pasteData.split(/\r?\n/).map((row) => row.split("\t"));
    let currentRow = Math.min(s.startRow, s.endRow);
    const startCol = Math.min(s.startCol, s.endCol);

    grid.currentTransaction = [];

    if (isData) {
      {
        const columns = grid.schema.map((c) => c.name);
        rows.forEach((rowArr) => {
          rowArr.forEach((cellData, cOffset) => {
            const targetCol = startCol + cOffset;
            const td = document.querySelector(
              `#data-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${currentRow}"][data-col-idx="${targetCol}"]`,
            );
            if (td) {
              updateCell(td, cellData, columns);
            }
          });
          currentRow++;
        });
        if (grid.currentTransaction.length > 0)
          grid.history.push(grid.currentTransaction);
        grid.currentTransaction = null;
      }
    } else if (isSchema) {
      {
        const cols = ["name", "type", "isPk", "nullable", "defaultValue"];
        rows.forEach((rowArr) => {
          rowArr.forEach((cellData, cOffset) => {
            const targetCol = startCol + cOffset;
            const td = document.querySelector(
              `#schema-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${currentRow}"][data-col-idx="${targetCol}"]`,
            );
            if (
              td &&
              (td.dataset.insertIndex !== undefined ||
                td.dataset.colKey === "name")
            ) {
              updateSchemaCell(td, cellData, cols);
            }
          });
          currentRow++;
        });
        if (grid.currentTransaction.length > 0)
          grid.history.push(grid.currentTransaction);
        grid.currentTransaction = null;
      }
    }
  });
};
