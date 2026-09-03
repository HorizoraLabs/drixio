import { renderMetricCards } from './components/cards.js';
import { renderAnalyticsSplitView } from './components/analytics.js';

export function refreshStatusDashboard() {
   fetchAndRenderStatus();
}

export async function loadStatusDashboard(container) {
   container.innerHTML = /* html */ `
    <div class="status-dashboard">
      <!-- 1. Hero Overview Panel -->
      <div class="hero-overview-panel">
        <div class="status-db-icon-container">
          <span class="material-symbols-outlined status-db-icon" id="status-db-icon">database</span>
          <span id="connection-dot" class="connection-dot green"></span>
        </div>
        <div class="hero-info">
          <div class="hero-title-row">
            <h1 id="header-db-name" class="hero-db-name">-</h1>
            <span id="header-status-badge" class="status-badge connected">
              <span class="status-badge-dot"></span>
              <span id="header-status-text">Connected</span>
            </span>
          </div>
          <div class="hero-subinfo">
            <span id="header-db-type" class="db-type-badge">-</span>
            <span class="hero-dot-separator">•</span>
            <span id="header-db-version" class="hero-db-version">-</span>
            <span class="hero-dot-separator">•</span>
            <span id="header-last-updated" class="hero-update-text">Just now</span>
          </div>
        </div>
        <div class="hero-actions">
          <button id="status-live-toggle" class="header-btn secondary" title="Toggle Auto-refresh">
            <span class="material-symbols-outlined" style="font-size: 15px; color: var(--color-success);">radio_button_checked</span>
            <span id="status-live-text">Live (3s)</span>
          </button>
          <button id="status-refresh-btn" class="header-btn secondary" title="Refresh Now">
            <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <!-- 2. Metric Cards Grid -->
      <div class="status-grid" id="status-cards-container">
        <!-- Cards will be injected here -->
      </div>
      
      <!-- 3. Analytics Split View (Top Tables & Donut Chart) -->
      <div class="analytics-split-view">
        <div id="status-toptables-container" class="top-tables-container hidden">
           <!-- Top tables injected here -->
        </div>
        <div id="status-distribution-container" class="distribution-container hidden">
           <!-- Distribution Bar injected here -->
        </div>
      </div>

      <!-- 4. Quick Actions Panel -->
      <div class="quick-actions-panel">
        <div class="analytics-panel-header">
          <h3 class="analytics-panel-title">Quick Operations</h3>
          <span class="analytics-panel-badge">Database Tools</span>
        </div>
        <div class="quick-actions-grid">
          <button type="button" class="quick-action-card" id="btn-quick-export-backup" title="Export full database backup (.sql)">
            <div class="quick-action-icon" style="color: var(--color-primary); background: rgba(59, 130, 246, 0.1);">
              <span class="material-symbols-outlined">download</span>
            </div>
            <div class="quick-action-info">
              <div class="quick-action-title">Export Database Backup</div>
              <div class="quick-action-desc">Download complete SQL schema & data dump</div>
            </div>
          </button>

          <button type="button" class="quick-action-card" id="btn-quick-export-dict" title="Download database markdown data dictionary">
            <div class="quick-action-icon" style="color: #10b981; background: rgba(16, 185, 129, 0.1);">
              <span class="material-symbols-outlined">menu_book</span>
            </div>
            <div class="quick-action-info">
              <div class="quick-action-title">Data Dictionary</div>
              <div class="quick-action-desc">Generate detailed markdown schema documentation</div>
            </div>
          </button>

          <button type="button" class="quick-action-card" id="btn-quick-open-console" title="Open SQL Query Console">
            <div class="quick-action-icon" style="color: #f59e0b; background: rgba(245, 158, 11, 0.1);">
              <span class="material-symbols-outlined">terminal</span>
            </div>
            <div class="quick-action-info">
              <div class="quick-action-title">SQL Console</div>
              <div class="quick-action-desc">Write, execute and test arbitrary SQL queries</div>
            </div>
          </button>

          <button type="button" class="quick-action-card" id="btn-quick-open-erd" title="View Entity Relationship Diagram">
            <div class="quick-action-icon" style="color: #8b5cf6; background: rgba(139, 92, 246, 0.1);">
              <span class="material-symbols-outlined">hub</span>
            </div>
            <div class="quick-action-info">
              <div class="quick-action-title">Visual ERD</div>
              <div class="quick-action-desc">Explore schema relationships & table foreign keys</div>
            </div>
          </button>
        </div>
      </div>
      
      <!-- 5. Feature Prompts (if any) -->
      <div id="feature-prompts-container" class="flex-col gap-4 hidden">
         <!-- Feature prompts will be injected here -->
      </div>
    </div>
  `;

   await fetchAndRenderStatus();

   // Bind Quick Actions
   const btnExportBackup = document.getElementById('btn-quick-export-backup');
   if (btnExportBackup) {
      btnExportBackup.addEventListener('click', () => {
         window.open('/api/database/export', '_blank');
      });
   }

   const btnExportDict = document.getElementById('btn-quick-export-dict');
   if (btnExportDict) {
      btnExportDict.addEventListener('click', () => {
         window.open('/api/database/dictionary', '_blank');
      });
   }

   const btnOpenConsole = document.getElementById('btn-quick-open-console');
   if (btnOpenConsole) {
      btnOpenConsole.addEventListener('click', () => {
         if (typeof window.handleSwitchTab === 'function') {
            window.handleSwitchTab('console-btn');
         }
      });
   }

   const btnOpenErd = document.getElementById('btn-quick-open-erd');
   if (btnOpenErd) {
      btnOpenErd.addEventListener('click', () => {
         if (typeof window.handleSwitchTab === 'function') {
            window.handleSwitchTab('erd-btn');
         }
      });
   }

   // Bind Refresh Button
   const refreshBtn = document.getElementById('status-refresh-btn');
   if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
         const icon = refreshBtn.querySelector('.material-symbols-outlined');
         if (icon) {
            icon.style.transition = 'transform 0.4s ease';
            icon.style.transform = `rotate(${(icon.dataset.rot || 0) * 1 + 360}deg)`;
            icon.dataset.rot = (icon.dataset.rot || 0) * 1 + 360;
         }
         fetchAndRenderStatus();
      });
   }

   // Bind Live Polling Toggle
   let isLiveEnabled = true;
   const liveToggle = document.getElementById('status-live-toggle');
   if (liveToggle) {
      liveToggle.addEventListener('click', () => {
         isLiveEnabled = !isLiveEnabled;
         const dotIcon = liveToggle.querySelector('.material-symbols-outlined');
         const textSpan = document.getElementById('status-live-text');
         if (isLiveEnabled) {
            if (dotIcon) dotIcon.style.color = 'var(--color-success)';
            if (textSpan) textSpan.textContent = 'Live (3s)';
         } else {
            if (dotIcon) dotIcon.style.color = 'var(--color-text-soft)';
            if (textSpan) textSpan.textContent = 'Paused';
         }
      });
   }

   // Setup polling
   if (window.statusPollingInterval) {
      clearInterval(window.statusPollingInterval);
   }

   window.statusPollingInterval = setInterval(() => {
      // Only poll if the tab is active and live polling is turned on
      if (window.AppState.currentTab === 'status-btn' && isLiveEnabled) {
         fetchAndRenderStatus();
      }
   }, 3000);
}

async function fetchAndRenderStatus() {
   const startTime = performance.now();
   try {
      const [resStatus, resStats] = await Promise.all([
         fetch('/api/status'),
         fetch('/api/tables/stats'),
      ]);
      const jsonStatus = await resStatus.json();
      const jsonStats = await resStats.json();
      const latency = Math.round(performance.now() - startTime);

      if (jsonStatus.success) {
         renderStatusData(jsonStatus.data, jsonStats.data, latency);
      } else {
         renderError(jsonStatus.error);
      }
   } catch (e) {
      renderError(e.message);
   }
}

function renderStatusData(data, tableStats = {}, latency = null) {
   const icon = document.getElementById('status-db-icon');
   const dot = document.getElementById('connection-dot');
   const statusBadge = document.getElementById('header-status-badge');
   const statusText = document.getElementById('header-status-text');
   if (!icon || !dot) return; // Unmounted

   if (data.status === 'connected') {
      icon.textContent = 'database';
      dot.className = 'connection-dot green';
      if (statusBadge) statusBadge.className = 'status-badge connected';
      if (statusText) statusText.textContent = 'Connected';
   } else {
      icon.textContent = 'database_off';
      dot.className = 'connection-dot red';
      if (statusBadge) statusBadge.className = 'status-badge disconnected';
      if (statusText) statusText.textContent = 'Disconnected';
      return;
   }

   // Render Hero
   const headerDbName = document.getElementById('header-db-name');
   const headerDbType = document.getElementById('header-db-type');
   const headerDbVersion = document.getElementById('header-db-version');
   const headerLastUpdated = document.getElementById('header-last-updated');

   if (headerDbName) headerDbName.textContent = data.dbName || 'Database';
   if (headerDbType) {
      headerDbType.textContent = data.dbType
         ? data.dbType.toUpperCase()
         : 'UNKNOWN';
      headerDbType.setAttribute('data-db-type', data.dbType || 'unknown');
   }
   if (headerDbVersion) {
      headerDbVersion.textContent = data.version ? `v${data.version}` : 'N/A';
   }
   if (headerLastUpdated) {
      const d = new Date();
      const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      headerLastUpdated.textContent =
         latency !== null ? `${timeStr} (${latency}ms)` : timeStr;
   }

   // Delegate Cards
   renderMetricCards(data);

   // Render Prompts (Only for engines with potential query performance plugins, hide on SQLite)
   const promptsContainer = document.getElementById(
      'feature-prompts-container',
   );
   if (promptsContainer) {
      if (data.dbType !== 'sqlite') {
         promptsContainer.innerHTML = /* html */ `
         <div class="feature-prompt">
           <span class="material-symbols-outlined icon">info</span>
           <div class="feature-prompt-content">
             <div class="prompt-title">Avg Query Latency & Slow Queries</div>
             <div class="prompt-desc">This metric requires database plugins to be enabled on your server (e.g. <code>pg_stat_statements</code> for PostgreSQL, or <code>Performance Schema</code> for MySQL).</div>
           </div>
           <button type="button" class="feature-prompt-close" onclick="this.closest('#feature-prompts-container').classList.add('hidden')" title="Dismiss">
             <span class="material-symbols-outlined">close</span>
           </button>
         </div>
       `;
         promptsContainer.classList.remove('hidden');
         promptsContainer.classList.add('flex');
      } else {
         promptsContainer.classList.add('hidden');
         promptsContainer.classList.remove('flex');
         promptsContainer.innerHTML = '';
      }
   }

   // Delegate Analytics Split View
   renderAnalyticsSplitView(tableStats);
}

function renderError(msg) {
   const icon = document.getElementById('status-db-icon');
   const dot = document.getElementById('connection-dot');
   if (icon && dot) {
      icon.textContent = 'database_off';
      dot.className = 'connection-dot red';
   }
   const container = document.getElementById('status-cards-container');
   if (container) {
      container.innerHTML = /* html */ `<div class="text-red-500">Failed to load database status: ${msg}</div>`;
   }
}
