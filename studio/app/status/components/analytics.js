window.navigateToTableData = function (tableName) {
   const btn = document.querySelector(`.table-btn[data-table="${tableName}"]`);
   if (!btn) return;
   window.AppState.currentTable = tableName;
   window.AppState.currentTableBtnElement = btn;
   window.handleSwitchTab('data-btn');
};

export function renderAnalyticsSplitView(tableStats = {}) {
   const distContainer = document.getElementById(
      'status-distribution-container',
   );
   const topContainer = document.getElementById('status-toptables-container');
   if (!distContainer || !topContainer) return 0;

   const entries = Object.entries(tableStats).sort((a, b) => b[1] - a[1]);
   const totalRows = entries.reduce((sum, [_, count]) => sum + count, 0);

   if (entries.length === 0) {
      topContainer.classList.remove('hidden');
      distContainer.classList.add('hidden');
      topContainer.style.gridColumn = '1 / -1';
      topContainer.innerHTML = /* html */ `
         <div class="supabase-empty-analytics">
            <div class="supabase-empty-icon">
               <span class="material-symbols-outlined">table_chart_view</span>
            </div>
            <div class="supabase-empty-title">No tables found in this database</div>
            <div class="supabase-empty-desc">Create your first database table or import a SQL script to populate data analytics and track records.</div>
            <div class="supabase-empty-actions">
               <button type="button" class="btn-primary" onclick="window.openCreateTableModal ? window.openCreateTableModal() : document.getElementById('add-table-btn')?.click()">
                  <span class="material-symbols-outlined" style="font-size: 15px;">add</span>
                  <span>Create Table</span>
               </button>
               <button type="button" class="btn-secondary" onclick="document.getElementById('btn-quick-import-backup')?.click()">
                  <span class="material-symbols-outlined" style="font-size: 15px;">upload</span>
                  <span>Import SQL</span>
               </button>
            </div>
         </div>
      `;
      return 0;
   }

   topContainer.style.gridColumn = '';
   const top5 = entries.slice(0, 5);

   // Brand colors: blue, indigo, cyan, amber, pink
   const colors = ['#3b82f6', '#6366f1', '#06b6d4', '#f59e0b', '#ec4899'];

   // 1. Render Top Tables with Horizontal Bar Visualizer
   let listHtml = /* html */ `
    <div class="analytics-panel-header">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-primary" style="font-size: 18px;">leaderboard</span>
        <h3 class="analytics-panel-title">Largest Tables by Rows</h3>
      </div>
      <span class="analytics-panel-badge">${entries.length} tables total</span>
    </div>
    <div class="top-tables-list">
  `;

   const maxCount = top5[0] ? Math.max(top5[0][1], 1) : 1;

   top5.forEach(([tableName, count], index) => {
      const barPct = ((count / maxCount) * 100).toFixed(1);
      const totalPct =
         totalRows > 0 ? ((count / totalRows) * 100).toFixed(1) : 0;

      listHtml += /* html */ `
      <div class="top-table-item hover-clickable" data-table="${tableName}" onclick="window.navigateToTableData('${tableName}')" title="Click to view ${tableName} data">
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
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-primary" style="font-size: 18px;">pie_chart</span>
        <h3 class="analytics-panel-title">Row Count Distribution</h3>
      </div>
      <span class="analytics-panel-badge">${totalRows.toLocaleString()} total rows</span>
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
        <div class="legend-item" data-table="${tableName}" onclick="window.navigateToTableData('${tableName}')" style="cursor: pointer;" title="View ${tableName}">
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

      const totalFormatted =
         totalRows > 999999
            ? (totalRows / 1000000).toFixed(1) + 'M'
            : totalRows.toLocaleString();

      chartHtml += /* html */ `
      <div class="distribution-pie-wrapper">
        <div class="distribution-pie" style="background: conic-gradient(${pieStops.join(', ')});"></div>
        <div class="donut-center-info">
          <span class="donut-total-num">${totalFormatted}</span>
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

   // Bind Hover Sync between top-table-item and legend-item
   topContainer.querySelectorAll('.top-table-item').forEach((item) => {
      const tbl = item.dataset.table;
      item.addEventListener('mouseenter', () => {
         distContainer
            .querySelector(`.legend-item[data-table="${tbl}"]`)
            ?.classList.add('is-hovered');
      });
      item.addEventListener('mouseleave', () => {
         distContainer
            .querySelector(`.legend-item[data-table="${tbl}"]`)
            ?.classList.remove('is-hovered');
      });
   });

   distContainer
      .querySelectorAll('.legend-item[data-table]')
      .forEach((item) => {
         const tbl = item.dataset.table;
         item.addEventListener('mouseenter', () => {
            topContainer
               .querySelector(`.top-table-item[data-table="${tbl}"]`)
               ?.classList.add('is-hovered');
         });
         item.addEventListener('mouseleave', () => {
            topContainer
               .querySelector(`.top-table-item[data-table="${tbl}"]`)
               ?.classList.remove('is-hovered');
         });
      });

   return totalRows;
}
