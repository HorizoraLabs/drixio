window.navigateToTableData = function (tableName) {
   const btn = document.querySelector(`.table-btn[data-table="${tableName}"]`);
   if (!btn) return;
   window.AppState.currentTable = tableName;
   window.AppState.currentTableBtnElement = btn;
   window.handleSwitchTab('data-btn');
};

export function renderAnalyticsSplitView(tableStats) {
   const distContainer = document.getElementById(
      'status-distribution-container',
   );
   const topContainer = document.getElementById('status-toptables-container');
   if (!distContainer || !topContainer) return;

   const entries = Object.entries(tableStats).sort((a, b) => b[1] - a[1]);
   if (entries.length === 0) {
      topContainer.classList.add('hidden');
      distContainer.classList.add('hidden');
      return;
   }

   const top5 = entries.slice(0, 5);
   const totalRows = entries.reduce((sum, [_, count]) => sum + count, 0);

   // Colors aligned with Drixio brand design palette
   const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

   // 1. Render Top Tables with Horizontal Bar Visualizer
   let listHtml = /* html */ `
    <div class="analytics-panel-header">
      <h3 class="analytics-panel-title">Top Largest Tables</h3>
      <span class="analytics-panel-badge">${entries.length} tables</span>
    </div>
    <div class="top-tables-list">
  `;

   const maxCount = top5[0] ? Math.max(top5[0][1], 1) : 1;

   top5.forEach(([tableName, count], index) => {
      const barPct = ((count / maxCount) * 100).toFixed(1);
      const totalPct =
         totalRows > 0 ? ((count / totalRows) * 100).toFixed(1) : 0;

      listHtml += /* html */ `
      <div class="top-table-item hover-clickable" onclick="window.navigateToTableData('${tableName}')" title="Click to view ${tableName} data">
        <div class="top-table-bar-fill" style="width: ${barPct}%; background-color: ${colors[index]}"></div>
        <div class="top-table-content">
          <div class="top-table-left">
            <span class="top-table-rank">#${index + 1}</span>
            <span class="top-table-name">${tableName}</span>
          </div>
          <div class="top-table-right">
            <span class="top-table-pct">${totalPct}%</span>
            <span class="top-table-rows">${count.toLocaleString()} rows</span>
            <span class="material-symbols-outlined top-table-arrow">arrow_forward</span>
          </div>
        </div>
      </div>
    `;
   });
   listHtml += `</div>`;
   topContainer.innerHTML = listHtml;
   topContainer.classList.remove('hidden');
   topContainer.classList.add('block');

   // 2. Render Distribution Donut Chart with Centered Total Rows
   let chartHtml = /* html */ `
    <div class="analytics-panel-header">
      <h3 class="analytics-panel-title">Row Count Distribution</h3>
      <span class="analytics-panel-badge">${totalRows.toLocaleString()} total</span>
    </div>
    <div class="distribution-content">
  `;

   let legendHtml = /* html */ `<div class="distribution-legend">`;

   let pieStops = [];
   let currentPct = 0;

   if (totalRows > 0) {
      let accountedRows = 0;
      top5.forEach(([tableName, count], index) => {
         const pct = (count / totalRows) * 100;
         accountedRows += count;
         const start = currentPct;
         const end = currentPct + pct;
         pieStops.push(
            `${colors[index]} ${start.toFixed(2)}% ${end.toFixed(2)}%`,
         );
         currentPct = end;

         legendHtml += /* html */ `
        <div class="legend-item" onclick="window.navigateToTableData('${tableName}')" style="cursor: pointer;" title="View ${tableName}">
          <div class="legend-color" style="background: ${colors[index]}"></div>
          <span class="legend-name">${tableName}</span>
          <span class="legend-pct">${pct.toFixed(1)}%</span>
        </div>
      `;
      });

      const others = totalRows - accountedRows;
      if (others > 0 && entries.length > 5) {
         const pct = (others / totalRows) * 100;
         const start = currentPct;
         const end = currentPct + pct;
         pieStops.push(`#64748b ${start.toFixed(2)}% ${end.toFixed(2)}%`);
         currentPct = end;

         legendHtml += /* html */ `
        <div class="legend-item">
          <div class="legend-color" style="background: #64748b"></div>
          <span class="legend-name">Others (${entries.length - 5})</span>
          <span class="legend-pct">${pct.toFixed(1)}%</span>
        </div>
      `;
      }

      chartHtml += /* html */ `
      <div class="distribution-pie-wrapper">
        <div class="distribution-pie" style="background: conic-gradient(${pieStops.join(', ')});"></div>
        <div class="donut-center-info">
          <span class="donut-total-num">${totalRows > 999999 ? (totalRows / 1000000).toFixed(1) + 'M' : totalRows.toLocaleString()}</span>
          <span class="donut-total-label">Total Rows</span>
        </div>
      </div>
    `;
   } else {
      chartHtml += /* html */ `
      <div class="distribution-pie-wrapper">
        <div class="distribution-pie" style="background: var(--color-border);"></div>
        <div class="donut-center-info">
          <span class="donut-total-num">0</span>
          <span class="donut-total-label">No Rows</span>
        </div>
      </div>
    `;
      legendHtml += /* html */ `<div class="text-soft" style="font-size: 13px;">No data rows found</div>`;
   }

   legendHtml += `</div>`; // Close legend
   chartHtml += legendHtml + `</div>`; // Close content layout
   distContainer.innerHTML = chartHtml;
   distContainer.classList.remove('hidden');
   distContainer.classList.add('block');
}
