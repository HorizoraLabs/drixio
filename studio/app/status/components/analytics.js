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
         <div class="drixio-empty-analytics">
            <div class="drixio-empty-icon">
               <span class="material-symbols-outlined">table_chart_view</span>
            </div>
            <div class="drixio-empty-title">No tables found in this database</div>
            <div class="drixio-empty-desc">Create your first database table or import a SQL script to populate data analytics and track records.</div>
            <div class="drixio-empty-actions">
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

   if (totalRows > 0) {
      let accountedRows = 0;
      let cumulativePct = 0;
      const size = 140;
      const radius = size / 2;

      // Calculate SVG paths for donut segments
      let svgHtml = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="distribution-pie" style="transform: rotate(-90deg);">`;

      const renderSlice = (color, pct, name, count) => {
         // Create donut slice via stroke-dasharray
         const c = 2 * Math.PI * (radius / 2); // Circumference for stroke at r=35 (radius/2 because stroke grows out from center if r=radius/2 and stroke-width=radius)
         // Actually, simpler standard SVG donut:
         const r = 35; // internal radius
         const strokeWidth = 70; // full width to edge
         const circ = 2 * Math.PI * r;
         const strokeLen = (pct / 100) * circ;
         const dashOffset = -((cumulativePct / 100) * circ);

         svgHtml += `<circle class="donut-slice" data-table="${name}" r="${r}" cx="${size / 2}" cy="${size / 2}" 
                        fill="transparent" stroke="${color}" stroke-width="${strokeWidth}" 
                        stroke-dasharray="${strokeLen} ${circ}" stroke-dashoffset="${dashOffset}" 
                        title="${name}: ${count.toLocaleString()} rows (${pct.toFixed(1)}%)"
                        style="transition: opacity 0.2s; cursor: pointer;"></circle>`;
         cumulativePct += pct;
      };

      top5.forEach(([tableName, count], index) => {
         const pct = (count / totalRows) * 100;
         accountedRows += count;

         renderSlice(colors[index], pct, tableName, count);

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
         renderSlice('#64748b', pct, 'Others', others);

         legendHtml += /* html */ `
        <div class="legend-item">
          <div class="legend-color" style="background: #64748b"></div>
          <span class="legend-name">Others (${entries.length - 5})</span>
          <span class="legend-pct">${pct.toFixed(1)}%</span>
        </div>
      `;
      }

      // Cover center to make it a donut
      svgHtml += `<circle r="${radius * 0.74}" cx="${size / 2}" cy="${size / 2}" fill="var(--color-bg-secondary)"></circle>`;
      svgHtml += `</svg>`;

      const totalFormatted =
         totalRows > 999999
            ? (totalRows / 1000000).toFixed(1) + 'M'
            : totalRows.toLocaleString();

      chartHtml += /* html */ `
      <div class="distribution-pie-wrapper stagger-in">
        ${svgHtml}
        <div class="donut-center-info">
          <span class="donut-total-num">${totalFormatted}</span>
          <span class="donut-total-label">Total Rows</span>
        </div>
      </div>
    `;
   } else {
      chartHtml += /* html */ `
      <div class="distribution-pie-wrapper stagger-in">
        <svg width="140" height="140" viewBox="0 0 140 140" class="distribution-pie">
            <circle r="35" cx="70" cy="70" fill="transparent" stroke="var(--color-border)" stroke-width="70"></circle>
            <circle r="51.8" cx="70" cy="70" fill="var(--color-bg-secondary)"></circle>
        </svg>
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

   // Bind Hover Sync between top-table-item, legend-item and donut-slice
   const topItems = topContainer.querySelectorAll('.top-table-item');
   const legendItems = distContainer.querySelectorAll(
      '.legend-item[data-table]',
   );
   const donutSlices = distContainer.querySelectorAll(
      '.donut-slice[data-table]',
   );

   const syncHover = (tbl, isHovering) => {
      // Top Table item
      topContainer
         .querySelector(`.top-table-item[data-table="${tbl}"]`)
         ?.classList.toggle('is-hovered', isHovering);
      // Legend item
      distContainer
         .querySelector(`.legend-item[data-table="${tbl}"]`)
         ?.classList.toggle('is-hovered', isHovering);

      // SVG Slices
      if (donutSlices.length > 0) {
         if (isHovering) {
            donutSlices.forEach((slice) => {
               if (slice.dataset.table === tbl) slice.style.opacity = '1';
               else slice.style.opacity = '0.3';
            });
         } else {
            donutSlices.forEach((slice) => (slice.style.opacity = '1'));
         }
      }
   };

   topItems.forEach((item) => {
      const tbl = item.dataset.table;
      item.addEventListener('mouseenter', () => syncHover(tbl, true));
      item.addEventListener('mouseleave', () => syncHover(tbl, false));
   });

   legendItems.forEach((item) => {
      const tbl = item.dataset.table;
      item.addEventListener('mouseenter', () => syncHover(tbl, true));
      item.addEventListener('mouseleave', () => syncHover(tbl, false));
   });

   donutSlices.forEach((item) => {
      const tbl = item.dataset.table;
      item.addEventListener('mouseenter', () => syncHover(tbl, true));
      item.addEventListener('mouseleave', () => syncHover(tbl, false));
   });

   return totalRows;
}
