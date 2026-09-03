import { executeRawQuery } from "../../lib/api.js";

export async function saveDataGridEdits() {
  if (!window.DataGrid) return;
  const { pendingEdits, pendingInserts, pkColumn } = window.DataGrid;
  const tableName = window.AppState.currentTable;

  if (!tableName || !pkColumn) {
    alert("Cannot save: No Primary Key detected for this table.");
    return;
  }

  let sqls = [];

  for (const [pkVal, edits] of Object.entries(pendingEdits)) {
    if (Object.keys(edits).length === 0) continue;
    const setClauses = Object.entries(edits)
      .map(([col, val]) => {
        if (val === "") return `"${col}" = NULL`;
        return `"${col}" = '${val.replace(/'/g, "''")}'`;
      })
      .join(", ");
    sqls.push(
      `UPDATE "${tableName}" SET ${setClauses} WHERE "${pkColumn}" = '${pkVal.replace(/'/g, "''")}';`,
    );
  }

  for (let i = 0; i < pendingInserts.length; i++) {
    const row = pendingInserts[i];
    if (Object.keys(row).length === 0) continue;

    const hasData = Object.values(row).some((val) => val !== "");
    if (!hasData) continue;

    const cols = Object.keys(row);
    const vals = cols.map((c) => {
      const val = row[c];
      if (val === "") return "NULL";
      return `'${val.replace(/'/g, "''")}'`;
    });
    sqls.push(
      `INSERT INTO "${tableName}" ("${cols.join('", "')}") VALUES (${vals.join(", ")});`,
    );
  }

  if (window.DataGrid.pendingDeletes) {
    for (const pk of window.DataGrid.pendingDeletes) {
      sqls.push(
        `DELETE FROM "${tableName}" WHERE "${pkColumn}" = '${pk.replace(/'/g, "''")}';`,
      );
    }
  }

  if (sqls.length === 0) return;

  let allSuccess = true;
  let errorMsg = "";

  for (const sql of sqls) {
    try {
      const res = await executeRawQuery(sql);
      if (!res.success) {
        allSuccess = false;
        errorMsg = res.error;
        break;
      }
    } catch (e) {
      allSuccess = false;
      errorMsg = e.message;
      break;
    }
  }

  if (allSuccess) {
    if (window.DataGrid) {
      window.DataGrid.pendingEdits = {};
      window.DataGrid.pendingInserts = [{}];
      window.DataGrid.pendingDeletes = new Set();
      window.DataGrid.history = [];
      window.DataGrid.currentTransaction = null;
      if (window.DataGrid.refreshData) {
        window.DataGrid.refreshData();
      } else {
        window.renderCurrentView();
      }
    }
    if (window.showToast) window.showToast("Data saved successfully!");
  } else {
    if (window.showToast) window.showToast("Save failed: " + errorMsg, "error");
    else alert("Save failed:\n" + errorMsg);
    document.querySelectorAll(".cell-edited").forEach((td) => {
      td.classList.remove("cell-edited");
      td.classList.add("cell-error");
    });
  }
  window.updateSidebarDirtyState?.();
}

export function updateCell(td, newVal, columns, recordHistory = true) {
  if (recordHistory && window.DataGrid.currentTransaction) {
    let oldVal = td.textContent;
    if (oldVal === "null" || td.classList.contains("ghost-row")) oldVal = "";
    if (oldVal !== newVal) {
      window.DataGrid.currentTransaction.push({ td, oldVal, newVal });
    }
  }

  const colName = td.dataset.col;
  const colIdx = td.dataset.colIdx;
  const ghostPlaceholder = colIdx === "0" ? `<span class="ghost-cell-hint">+ Add Row</span>` : "";
  td.innerHTML =
    newVal ||
    (td.dataset.insertIndex !== undefined ? ghostPlaceholder : "<em>null</em>");

  if (td.dataset.insertIndex !== undefined) {
    const idx = parseInt(td.dataset.insertIndex);
    if (!window.DataGrid.pendingInserts[idx])
      window.DataGrid.pendingInserts[idx] = {};
    if (newVal) {
      window.DataGrid.pendingInserts[idx][colName] = newVal;
      td.classList.add("cell-edited");
      td.classList.remove("ghost-row");

      if (idx === window.DataGrid.pendingInserts.length - 1) {
        td.closest('tr').classList.remove('ghost-row-tr');
        window.DataGrid.pendingInserts.push({});
        const tbody = document.querySelector(`#data-grid-table-${window.AppState.currentTable} tbody`);
        const tr = document.createElement("tr");
        tr.className = "ghost-row-tr";
        const nextRowIdx = parseInt(td.dataset.rowIdx) + 1;
        tr.innerHTML += `<td class="row-header" data-row-idx="${nextRowIdx}">*</td>`;
        columns.forEach((c, cIdx) => {
          const hint = cIdx === 0 ? `<span class="ghost-cell-hint">+ Add Row</span>` : "";
          tr.innerHTML += `<td class="data-cell ghost-row" data-row-idx="${nextRowIdx}" data-col-idx="${cIdx}" data-insert-index="${idx + 1}" data-col="${c}">${hint}</td>`;
        });
        tbody.appendChild(tr);
      }
    } else {
      if (window.DataGrid.pendingInserts[idx]) {
        delete window.DataGrid.pendingInserts[idx][colName];
      }
      td.classList.remove("cell-edited");
      td.classList.add("ghost-row");
    }
  } else {
    const pk = td.dataset.pk;
    if (newVal !== td.dataset.original) {
      if (!window.DataGrid.pendingEdits[pk])
        window.DataGrid.pendingEdits[pk] = {};
      window.DataGrid.pendingEdits[pk][colName] = newVal;
      td.classList.add("cell-edited");
      td.classList.remove("cell-error");
    } else {
      td.classList.remove("cell-edited");
      td.classList.remove("cell-error");
      if (window.DataGrid.pendingEdits[pk]) {
        delete window.DataGrid.pendingEdits[pk][colName];
        if (Object.keys(window.DataGrid.pendingEdits[pk]).length === 0) {
          delete window.DataGrid.pendingEdits[pk];
        }
      }
    }
  }
  window.updateSidebarDirtyState?.();
}

export function markRowDeleted(rowIdx, recordHistory = true) {
  const tr = document
    .querySelector(`#data-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${rowIdx}"]`)
    ?.closest("tr");
  if (!tr || tr.classList.contains("ghost-row-tr")) return;

  if (tr.classList.contains("row-deleted")) return;

  const firstCell = tr.querySelector("td.data-cell");
  const pk = firstCell?.dataset.pk;
  if (pk !== undefined) {
    if (recordHistory && window.DataGrid.currentTransaction) {
      window.DataGrid.currentTransaction.push({
        type: "delete",
        rowIdx,
        pk,
      });
    }
    window.DataGrid.pendingDeletes.add(pk);
    tr.classList.add("row-deleted");
  }
  window.updateSidebarDirtyState?.();
}

export function unmarkRowDeleted(rowIdx, pk) {
  const tr = document
    .querySelector(`#data-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${rowIdx}"]`)
    ?.closest("tr");
  if (tr) tr.classList.remove("row-deleted");
  window.DataGrid.pendingDeletes.delete(pk);
  window.updateSidebarDirtyState?.();
}


export function duplicateDataRows(rowIndices, columns) {
  rowIndices.forEach(rowIdx => {
    const t = window.AppState.currentTable;
    const tr = document.querySelector(`#data-grid-table-${t} td.data-cell[data-row-idx="${rowIdx}"]`)?.closest("tr");
    if (!tr || tr.classList.contains("ghost-row-tr")) return;

    let ghostTr = document.querySelector(`#data-grid-table-${t} .ghost-row-tr`);
    if (!ghostTr) return;

    columns.forEach((col, cIdx) => {
      const sourceTd = tr.querySelector(`td.data-cell[data-col-idx="${cIdx}"]`);
      const targetTd = ghostTr.querySelector(`td.data-cell[data-col-idx="${cIdx}"]`);
      if (sourceTd && targetTd) {
        let val = sourceTd.dataset.insertIndex !== undefined 
          ? window.DataGrid.pendingInserts[sourceTd.dataset.insertIndex][col]
          : (sourceTd.classList.contains("cell-edited") ? window.DataGrid.pendingEdits[sourceTd.dataset.pk]?.[col] : sourceTd.dataset.original);
        
        if (val !== undefined && val !== null && val !== "null") {
          updateCell(targetTd, val, columns, true);
        }
      }
    });
  });
}
