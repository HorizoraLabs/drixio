window.navigateToTableData = function(tableName) {
  const btn = document.querySelector(`.table-btn[data-table="${tableName}"]`);
  if (!btn) return;
  window.AppState.currentTable = tableName;
  window.AppState.currentTableBtnElement = btn;
  window.handleSwitchTab("data-btn");
};

export function renderAnalyticsSplitView(tableStats) {
  const distContainer = document.getElementById(
    "status-distribution-container",
  );
  const topContainer = document.getElementById("status-toptables-container");
  if (!distContainer || !topContainer) return;

  const entries = Object.entries(tableStats).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return;

  const top5 = entries.slice(0, 5);
  const totalRows = entries.reduce((sum, [_, count]) => sum + count, 0);

  // Colors for top 5 tables
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

  // Render Top Tables
  let listHtml = /* html */ `<h3 class="top-tables-title">Top Largest Tables</h3><div class="top-tables-list">`;
  top5.forEach(([tableName, count], index) => {
    listHtml += /* html */ `
      <div class="top-table-item hover-clickable" onclick="window.navigateToTableData('${tableName}')">
        <span class="top-table-name" style="border-left: 4px solid ${colors[index]}; padding-left: 8px;">${tableName}</span>
        <span class="top-table-rows">${count.toLocaleString()} rows</span>
      </div>
    `;
  });
  listHtml += `</div>`;
  topContainer.innerHTML = listHtml;
  topContainer.classList.remove("hidden");
  topContainer.classList.add("block");

  // Render Distribution Donut Chart
  let chartHtml = /* html */ `<h3 class="distribution-title">Row Count Distribution</h3><div class="distribution-content" style="display: flex; gap: 48px; align-items: center; justify-content: space-between; margin-top: 24px;">`;
  let legendHtml = /* html */ `<div class="distribution-legend" style="flex: 1; margin-top: 0;">`;

  let pieStops = [];
  let currentPct = 0;

  if (totalRows > 0) {
    let accountedRows = 0;
    top5.forEach(([tableName, count], index) => {
      const pct = (count / totalRows) * 100;
      accountedRows += count;
      const start = currentPct;
      const end = currentPct + pct;
      pieStops.push(`${colors[index]} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
      currentPct = end;

      legendHtml += /* html */ `
        <div class="legend-item">
          <div class="legend-color" style="background: ${colors[index]}"></div>
          <span>${tableName} (${pct.toFixed(1)}%)</span>
        </div>
      `;
    });

    const others = totalRows - accountedRows;
    if (others > 0 && entries.length > 5) {
      const pct = (others / totalRows) * 100;
      const start = currentPct;
      const end = currentPct + pct;
      pieStops.push(`#94a3b8 ${start.toFixed(2)}% ${end.toFixed(2)}%`);
      currentPct = end;

      legendHtml += /* html */ `
        <div class="legend-item">
          <div class="legend-color" style="background: #94a3b8"></div>
          <span>Others (${pct.toFixed(1)}%)</span>
        </div>
      `;
    }

    chartHtml += /* html */ `<div class="distribution-pie" style="background: conic-gradient(${pieStops.join(", ")});"></div>`;
  } else {
    chartHtml += /* html */ `<div class="distribution-pie" style="background: var(--color-border);"></div>`;
    legendHtml += /* html */ `<div class="text-soft text-sm">No rows found</div>`;
  }

  legendHtml += `</div>`; // Close legend
  chartHtml += legendHtml + `</div>`; // Close content layout
  distContainer.innerHTML = chartHtml;
  distContainer.classList.remove("hidden");
  distContainer.classList.add("block");
}
