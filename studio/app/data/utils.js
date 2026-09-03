export function getFilterQuery() {
  const t = window.AppState?.currentTable;
  if (!t) return "";
  const filterVal = document.getElementById(`filter-val-${t}`)?.value.trim();
  const filterOp = document.getElementById(`filter-op-${t}`)?.value;
  const filterCol = document.getElementById(`filter-col-${t}`)?.value;

  let query = "";
  if (filterVal || filterOp === "IS NULL") {
    let safeVal = filterVal;
    if (
      safeVal &&
      !safeVal.startsWith("'") &&
      !safeVal.endsWith("'") &&
      isNaN(Number(safeVal))
    ) {
      const isRawSql =
        safeVal.toUpperCase().includes(" AND ") ||
        safeVal.toUpperCase().includes(" OR ");
      if (!isRawSql) {
        safeVal = `'${safeVal.replace(/'/g, "''")}'`;
      }
    }
    query = `"${filterCol}" ${filterOp} ${safeVal}`;
  }
  return query;
}

export function generateRowHtml(row, rowIndex, pkColumn, columns, schema = []) {
  let html = `<td class="row-header" data-row-idx="${rowIndex}">${rowIndex + 1}</td>`;
  const pkValue = pkColumn ? row[pkColumn] : rowIndex;
  columns.forEach((col, cIdx) => {
    const colSchema = schema.find((c) => c.name === col);
    const val = row[col] !== null ? String(row[col]) : "null";
    const safeValForAttr = val.replace(/"/g, "&quot;");
    const safeValForHtml =
      val === "null" ? "<em>null</em>" : val.replace(/</g, "&lt;");

    const isFk = colSchema && colSchema.fkTarget && val !== "null";
    if (isFk) {
      const fkTable = colSchema.fkTarget.table;
      const fkCol = colSchema.fkTarget.column;
      html += `<td class="data-cell is-fk-cell" data-row-idx="${rowIndex}" data-col-idx="${cIdx}" data-pk="${pkValue}" data-col="${col}" data-original="${safeValForAttr}" data-fk-table="${fkTable}" data-fk-col="${fkCol}"><span class="cell-text">${safeValForHtml}</span><button type="button" class="fk-jump-btn" title="View & jump to ${fkTable} (${fkCol} = ${safeValForAttr})" data-fk-table="${fkTable}" data-fk-col="${fkCol}" data-fk-val="${safeValForAttr}"><span class="material-symbols-outlined">open_in_new</span></button></td>`;
    } else {
      html += `<td class="data-cell" data-row-idx="${rowIndex}" data-col-idx="${cIdx}" data-pk="${pkValue}" data-col="${col}" data-original="${safeValForAttr}"><span class="cell-text">${safeValForHtml}</span></td>`;
    }
  });
  return html;
}
