import { formatUptime, formatBytes } from '../utils.js';

let lastPollData = null;
let lastPollTime = null;

function createCard(
   icon,
   title,
   value,
   colorClass,
   subtext = '',
   progressPct = null,
) {
   let progressHtml = '';
   if (progressPct !== null && !isNaN(progressPct)) {
      const clamped = Math.min(100, Math.max(0, progressPct));
      progressHtml = `
      <div class="status-card-progress">
        <div class="status-card-progress-bar" style="width: ${clamped}%"></div>
      </div>
    `;
   }

   return /* html */ `
    <div class="status-card ${colorClass}">
      <div class="status-card-header">
        <span class="status-card-title">${title}</span>
        <div class="status-card-icon">
          <span class="material-symbols-outlined">${icon}</span>
        </div>
      </div>
      <div class="status-card-body">
        <div class="status-card-value">${value}</div>
        ${progressHtml}
        ${subtext ? `<div class="status-card-subtext">${subtext}</div>` : ''}
      </div>
    </div>
  `;
}

export function renderMetricCards(data) {
   const cardsContainer = document.getElementById('status-cards-container');
   if (!cardsContainer) return;

   let cardsHtml = '';
   const now = Date.now();

   // 1. Total Tables
   cardsHtml += createCard(
      'table_chart',
      'Total Tables',
      data.totalTables != null ? data.totalTables : '0',
      'card-blue',
      'Active schemas & base tables',
   );

   // 2. Storage
   cardsHtml += createCard(
      'hard_drive',
      'Storage Used',
      formatBytes(data.sizeBytes),
      'card-amber',
      data.dbName ? `File / DB: ${data.dbName}` : 'Disk footprint',
   );

   // 3. Active Connections
   cardsHtml += createCard(
      'hub',
      'Active Connections',
      data.activeConnections || '1',
      'card-emerald',
      data.dbType === 'sqlite' ? 'Single-process runtime' : 'Connected clients',
   );

   // 4. Server Uptime (if available)
   if (data.uptime) {
      cardsHtml += createCard(
         'schedule',
         'Server Uptime',
         formatUptime(data.uptime),
         'card-indigo',
         'Continuous runtime',
      );
   }

   // 5. Database Specific Metrics
   if (data.dbType === 'mysql') {
      let qps = 0;
      if (lastPollData && lastPollTime && data.queries) {
         const timeDiff = (now - lastPollTime) / 1000;
         const queryDiff = data.queries - lastPollData.queries;
         qps = Math.max(0, queryDiff / timeDiff);
      }
      cardsHtml += createCard(
         'speed',
         'Query Throughput',
         `${qps.toFixed(1)} /s`,
         'card-blue',
         `Total: ${(data.queries || 0).toLocaleString()} queries`,
      );
   } else if (data.dbType === 'postgres') {
      let tps = 0;
      if (lastPollData && lastPollTime && data.transactions) {
         const timeDiff = (now - lastPollTime) / 1000;
         const txDiff = data.transactions - lastPollData.transactions;
         tps = Math.max(0, txDiff / timeDiff);
      }
      cardsHtml += createCard(
         'receipt_long',
         'Transactions Rate',
         `${tps.toFixed(1)} /s`,
         'card-blue',
         `Total: ${(data.transactions || 0).toLocaleString()} commits/rollbacks`,
      );
   } else if (data.dbType === 'sqlite') {
      const memPct = data.osMemTotal
         ? ((data.osMemUsed / data.osMemTotal) * 100).toFixed(1)
         : 0;
      cardsHtml += createCard(
         'memory',
         'Host Memory',
         `${memPct}%`,
         'card-blue',
         `${formatBytes(data.osMemUsed)} / ${formatBytes(data.osMemTotal)}`,
         parseFloat(memPct),
      );
      cardsHtml += createCard(
         'memory_alt',
         'Host CPU Load',
         (data.osCpuUsage || 0).toFixed(2),
         'card-indigo',
         '1-min system load average',
      );
   }

   cardsContainer.innerHTML = cardsHtml;

   lastPollData = data;
   lastPollTime = now;
}
