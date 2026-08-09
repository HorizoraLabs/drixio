import { executeRawQuery } from "../../lib/api.js";

let queryCounter = 0;

export const exportCSV = (cols, rows, fileName) => {
  const csvContent = [
    cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    ...rows.map((r) =>
      cols
        .map((c) => {
          const val = r[c] === null ? "" : String(r[c]);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ].join("\\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const runConsoleQuery = async (queryToRun, editor, historyPane) => {
  let sql =
    queryToRun ||
    editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
  if (!sql) sql = editor.value.trim();
  if (!sql) return;

  if (sql.toLowerCase() === "clear" || sql.toLowerCase() === "clear;") {
    historyPane.innerHTML = "";
    if (!queryToRun) {
      editor.selectionStart = editor.selectionEnd;
      editor.value = "";
    }
    return;
  }

  window.AppState.lastQuery = editor.value;

  if (!window.AppState.queryHistory) window.AppState.queryHistory = [];
  const history = window.AppState.queryHistory;
  if (!history.includes(sql)) {
    history.unshift(sql);
    if (history.length > 10) history.pop();
    window.dispatchEvent(new Event("query-history-updated"));
  }

  queryCounter++;

  const blockId = `history-block-${queryCounter}`;

  const welcomeMsg = document.getElementById("console-welcome-msg");
  if (welcomeMsg) {
    welcomeMsg.style.display = "none";
  }

  const block = document.createElement("div");
  block.className = "console-history-block";

  block.innerHTML = /* html */ `
    <div class="console-history-header">
      <div class="console-history-sql">${sql.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      <div class="console-history-actions">
        <button class="icon-btn copy-btn" title="Copy SQL"><span class="material-symbols-outlined" class="icon-16">content_copy</span></button>
        <button class="icon-btn rerun-btn" title="Re-run"><span class="material-symbols-outlined" class="icon-16">refresh</span></button>
      </div>
    </div>
    <div id="${blockId}-results" class="console-history-results">
      <div class="console-msg-executing">
        <span class="material-symbols-outlined" class="animate-spin">sync</span> Executing...
      </div>
    </div>
  `;

  historyPane.appendChild(block);

  block.querySelector(".copy-btn").onclick = () => {
    navigator.clipboard.writeText(sql);
    window.showToast
      ? window.showToast("SQL copied to clipboard")
      : alert("Copied");
  };
  block.querySelector(".rerun-btn").onclick = () =>
    runConsoleQuery(sql, editor, historyPane);

  historyPane.scrollTop = historyPane.scrollHeight;

  if (!queryToRun) {
    editor.selectionStart = editor.selectionEnd;
    editor.value = "";
  }

  try {
    const startTime = performance.now();
    const res = await executeRawQuery(sql);
    const ms = (performance.now() - startTime).toFixed(1);

    const resContainer = document.getElementById(`${blockId}-results`);

    if (!res.success) {
      resContainer.innerHTML = /* html */ `<div class="console-msg-error"><span class="material-symbols-outlined" class="icon-16 mt-2px">error</span><span>Error: ${res.error}</span></div>`;
      historyPane.scrollTop = historyPane.scrollHeight;
      return;
    }

    const rows = res.data.rows || [];
    const rowCount = rows.length;

    if (rowCount === 0) {
      resContainer.innerHTML = /* html */ `<div class="console-msg-success"><span class="material-symbols-outlined" class="icon-16">check_circle</span> Query executed successfully in ${ms}ms. 0 rows returned.</div>`;
      historyPane.scrollTop = historyPane.scrollHeight;
      return;
    }

    const cols = Object.keys(rows[0]);

    const statsHeader = document.createElement("div");
    statsHeader.className = "console-stats-header";

    const limitedRows = rows.slice(0, 1000);
    const limitNotice = rowCount > 1000 ? ` (Showing first 1000)` : "";

    statsHeader.innerHTML = /* html */ `
      <div class="console-stats-info">
        <span class="material-symbols-outlined" class="text-success icon-14">check_circle</span> 
        <span>${rowCount} rows${limitNotice} &middot; ${ms}ms</span>
      </div>
      <button class="console-export-btn export-btn">
        <span class="material-symbols-outlined" class="icon-14">download</span> CSV
      </button>
    `;

    resContainer.innerHTML = "";
    resContainer.appendChild(statsHeader);

    statsHeader.querySelector(".export-btn").onclick = () => {
      exportCSV(cols, rows, `drixio_export_${new Date().getTime()}.csv`);
    };

    const tableContainer = document.createElement("div");
    tableContainer.className = "table-container";
    tableContainer.style.border = "1px solid var(--color-border)";
    tableContainer.style.borderRadius = "6px";
    tableContainer.style.overflow = "auto";
    tableContainer.style.maxHeight = "320px";

    const table = document.createElement("table");
    table.className = "data-table";

    const thead = document.createElement("thead");
    thead.style.position = "sticky";
    thead.style.top = "0";
    thead.style.zIndex = "10";

    const trHead = document.createElement("tr");
    const thNum = document.createElement("th");
    thNum.className = "row-header";
    thNum.textContent = "#";
    trHead.appendChild(thNum);

    cols.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    limitedRows.forEach((row, i) => {
      const tr = document.createElement("tr");
      const tdNum = document.createElement("td");
      tdNum.className = "row-header";
      tdNum.textContent = i + 1;
      tr.appendChild(tdNum);

      cols.forEach((c) => {
        const td = document.createElement("td");
        td.className = "data-cell data-cell-truncate";

        let val = row[c];
        if (val === null) {
          const nullSpan = document.createElement("span");
          nullSpan.textContent = "NULL";
          nullSpan.classList.add("text-soft", "italic");
          td.appendChild(nullSpan);
        } else {
          const strVal = String(val);
          td.textContent = strVal;
          if (strVal.length > 40) {
            td.title = strVal;
          }
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableContainer.appendChild(table);
    resContainer.appendChild(tableContainer);

    setTimeout(() => (historyPane.scrollTop = historyPane.scrollHeight), 10);
  } catch (e) {
    const resContainer = document.getElementById(`${blockId}-results`);
    if (resContainer) {
      resContainer.innerHTML = /* html */ `<div class="console-msg-error"><span class="material-symbols-outlined" class="icon-16 mt-2px">error</span><span>Error: ${e.message}</span></div>`;
      historyPane.scrollTop = historyPane.scrollHeight;
    }
  }
};
