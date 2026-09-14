import { formatBytes } from '../utils.js';

let lastPollData = null;
let lastPollTime = null;

function createTile({
   icon,
   label,
   value,
   badge = '',
   badgeClass = 'badge-neutral',
}) {
   return /* html */ `
    <div class="status-dashboard-status-tile">
      <div class="status-dashboard-tile-icon">
        <span class="material-symbols-outlined">${icon}</span>
      </div>
      <div class="status-dashboard-tile-main">
        <div class="status-dashboard-tile-label">${label}</div>
        <div class="status-dashboard-tile-value-row">
          <span class="status-dashboard-tile-value">${value}</span>
          ${badge ? `<span class="status-dashboard-tile-badge ${badgeClass}">${badge}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

export function renderMetricCards(data, totalRowCount = 0) {
   const cardsContainer = document.getElementById('status-cards-container');
   if (!cardsContainer) return;

   let tilesHtml = '';
   const now = Date.now();
   const isConnected = data.status === 'connected';

   // 1. STATUS
   tilesHtml += createTile({
      icon: 'apps',
      label: 'STATUS',
      value: isConnected ? 'Healthy' : 'Disconnected',
      badge: isConnected ? 'NORMAL' : 'OFFLINE',
      badgeClass: isConnected ? 'badge-status-ok' : 'badge-status-err',
   });

   // 2. COMPUTE
   const engineName = (data.dbType || 'UNKNOWN').toUpperCase();
   const engineVersion = data.version ? `v${data.version}` : 'NANO';
   tilesHtml += createTile({
      icon: 'memory',
      label: 'COMPUTE',
      value: engineName,
      badge: engineVersion,
      badgeClass: 'badge-primary',
   });

   // 3. STORAGE
   tilesHtml += createTile({
      icon: 'database',
      label: 'STORAGE',
      value: formatBytes(data.sizeBytes),
   });

   // 4. CONNECTIONS
   const conns = data.activeConnections || (data.dbType === 'sqlite' ? 1 : 1);
   tilesHtml += createTile({
      icon: 'hub',
      label: 'CONNECTIONS',
      value: `${conns} Active`,
      badge: data.dbType === 'sqlite' ? 'LOCAL' : 'POOLED',
      badgeClass: 'badge-neutral',
   });

   // 5. TOTAL TABLES
   tilesHtml += createTile({
      icon: 'table_rows',
      label: 'TABLES',
      value: `${data.totalTables ?? 0} Tables`,
   });

   // 6. TOTAL ROWS / RECORDS
   let rowVal = `${(totalRowCount || 0).toLocaleString()} Rows`;
   if (data.dbType === 'mysql' && data.queries) {
      if (lastPollData && lastPollTime) {
         const timeDiff = (now - lastPollTime) / 1000;
         const qDiff = Math.max(0, data.queries - (lastPollData.queries || 0));
         const qps = (qDiff / timeDiff).toFixed(1);
         rowVal = `${qps} QPS`;
      }
   } else if (data.dbType === 'postgres' && data.transactions) {
      if (lastPollData && lastPollTime) {
         const timeDiff = (now - lastPollTime) / 1000;
         const tDiff = Math.max(
            0,
            data.transactions - (lastPollData.transactions || 0),
         );
         const tps = (tDiff / timeDiff).toFixed(1);
         rowVal = `${tps} TPS`;
      }
   }

   tilesHtml += createTile({
      icon: 'inventory_2',
      label: 'DATABASE RECORDS',
      value: rowVal,
   });

   cardsContainer.innerHTML = tilesHtml;

   lastPollData = data;
   lastPollTime = now;
}
