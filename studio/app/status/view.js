import { renderMetricCards } from './components/cards.js';
import { renderAnalyticsSplitView } from './components/analytics.js';
import { formatBytes, formatUptime } from './utils.js';
import { openImportModal } from '../../components/importModal.js';

export function refreshStatusDashboard() {
   fetchAndRenderStatus();
}

export async function loadStatusDashboard(container) {
   container.innerHTML = /* html */ `
    <div class="status-dashboard" style="opacity: 0;">
      <!-- Top Section: Left (Title + Endpoint + 6 Cards) | Right (Dotted Matrix Canvas) -->
      <div class="status-dashboard-hero">
        <!-- Left Column -->
        <div class="drixio-hero-left">
          <div class="drixio-hero-header skeleton-target">
            <h1 class="status-dashboard-db-title" id="hero-db-name">Loading...</h1>
            <div class="status-dashboard-endpoint">
              <span class="status-dashboard-endpoint-text" id="hero-conn-uri">Connecting to database instance...</span>
              <button type="button" class="status-dashboard-copy-btn" id="btn-copy-conn-uri" title="Copy Connection URI">
                <span class="material-symbols-outlined" style="font-size: 13px;">content_copy</span>
                <span id="btn-copy-conn-label">Copy</span>
              </button>
            </div>
          </div>

          <!-- 6 Supabase-style Compact Status Tiles (2x3 Grid) -->
          <div class="status-dashboard-tiles-grid" id="status-cards-container">
            <!-- Skeleton Cards -->
            ${Array(6)
               .fill(
                  /* html */ `
              <div class="status-dashboard-status-tile skeleton-target" style="background: rgba(255,255,255,0.02); border: 1px solid var(--color-border);">
                <div class="status-dashboard-tile-icon" style="background: rgba(255,255,255,0.05); color: transparent;">
                  <span class="material-symbols-outlined">circle</span>
                </div>
                <div class="status-dashboard-tile-main">
                  <div class="status-dashboard-tile-label" style="width: 40px; height: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;"></div>
                  <div class="status-dashboard-tile-value-row">
                    <span class="status-dashboard-tile-value" style="width: 80px; height: 16px; background: rgba(255,255,255,0.15); border-radius: 4px;"></span>
                  </div>
                </div>
              </div>`,
               )
               .join('')}
          </div>
        </div>

        <!-- Right Column: Supabase Dotted Matrix Canvas with Primary DB Node -->
        <div class="status-dashboard-hero-right skeleton-target">
          <div class="status-dashboard-canvas-wrapper">
            <div class="status-dashboard-canvas-dots"></div>
            
            <div class="status-dashboard-canvas-actions">
              <button type="button" class="status-dashboard-canvas-actions-btn" id="btn-canvas-center" title="Center Topology">
                <span class="material-symbols-outlined">center_focus_strong</span>
              </button>
            </div>

            <!-- Floating Primary DB Node -->
            <div class="status-dashboard-canvas-node" id="primary-db-node" style="opacity: 0;">
              <div class="node-main">
                <div class="node-icon-box" id="node-engine-avatar">
                  <span class="material-symbols-outlined" id="node-engine-icon">database</span>
                </div>
                <div class="node-text">
                  <div class="node-title" id="node-db-title">Primary Database</div>
                  <div class="node-subtitle" id="node-db-desc">Initializing Engine</div>
                  <div class="node-location" id="node-db-path">Connecting...</div>
                </div>
                <div class="node-badge" id="node-latency-pill">
                  <span class="node-badge-dot"></span>
                  <span id="node-latency-text">---</span>
                </div>
              </div>

              <div class="node-metrics-bar">
                <span id="node-stat-cpu">CPU --%</span>
                <span class="sep">·</span>
                <span id="node-stat-disk">Disk --</span>
                <span class="sep">·</span>
                <span id="node-stat-ram">RAM --%</span>
                <span class="sep">·</span>
                <span id="node-stat-conns">-- conn</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity Ribbon -->
      <div class="status-dashboard-ribbon skeleton-target">
        <div class="status-dashboard-ribbon-left">
          <div class="status-dashboard-health-stat">
            <span class="drixio-health-dot"></span>
            <span class="drixio-health-label" id="ribbon-health-label">Connecting...</span>
          </div>
          <span class="status-dashboard-ribbon-sep">•</span>
          <div class="drixio-records-stat">
            <span id="ribbon-records-count">Loading Records...</span>
          </div>
          <span class="status-dashboard-ribbon-sep">•</span>
          <div class="drixio-updated-stat">
            <span>Updated: <span id="header-last-updated" class="font-mono">Waiting</span></span>
          </div>
        </div>

        <div class="status-dashboard-ribbon-right">
          <button type="button" id="status-live-toggle" class="status-dashboard-ribbon-btn" title="Toggle Auto-refresh">
            <span class="material-symbols-outlined live-dot-icon">radio_button_checked</span>
            <span id="status-live-text">Live (3s)</span>
          </button>
          <button type="button" id="status-refresh-btn" class="status-dashboard-ribbon-btn" title="Refresh Now">
            <span class="material-symbols-outlined" style="font-size: 14px;">refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <!-- Analytics Split View (Top Tables & Row Count Distribution) -->
      <div class="drixio-analytics-grid">
        <div id="status-toptables-container" class="drixio-panel hidden skeleton-target">
          <!-- Top tables injected here -->
        </div>
        <div id="status-distribution-container" class="drixio-panel hidden skeleton-target">
          <!-- Distribution Donut injected here -->
        </div>
      </div>

      <!-- Quick Operations (6 Clean Action Cards) -->
      <div class="drixio-actions-panel skeleton-target">
        <div class="drixio-panel-header">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary" style="font-size: 17px;">bolt</span>
            <h3 class="drixio-panel-title">Quick Operations</h3>
          </div>
          <span class="drixio-panel-tag">Database Actions</span>
        </div>
        <div class="drixio-actions-grid">
          <!-- 1. Export Full Backup -->
          <button type="button" class="drixio-action-card stagger-in" id="btn-quick-export-backup" title="Export full database backup (.sql)">
            <div class="action-icon-box" style="color: #3b82f6;">
              <span class="material-symbols-outlined">download</span>
            </div>
            <div class="action-content">
              <div class="action-title">Export Full Backup</div>
              <div class="action-desc">Download complete SQL schema & data dump</div>
            </div>
          </button>

          <!-- 2. Export Schema DDL -->
          <button type="button" class="drixio-action-card stagger-in" id="btn-quick-export-ddl" title="Export schema DDL definitions (.sql)">
            <div class="action-icon-box" style="color: #06b6d4;">
              <span class="material-symbols-outlined">description</span>
            </div>
            <div class="action-content">
              <div class="action-title">Export Schema DDL</div>
              <div class="action-desc">Download CREATE TABLE DDL definitions</div>
            </div>
          </button>

          <!-- 3. Import & Restore -->
          <button type="button" class="drixio-action-card stagger-in" id="btn-quick-import-backup" title="Import SQL script or JSON data">
            <div class="action-icon-box" style="color: #10b981;">
              <span class="material-symbols-outlined">upload</span>
            </div>
            <div class="action-content">
              <div class="action-title">Import & Restore</div>
              <div class="action-desc">Restore tables from SQL script or JSON dump</div>
            </div>
          </button>

          <!-- 4. Data Dictionary -->
          <button type="button" class="drixio-action-card stagger-in" id="btn-quick-export-dict" title="Download database markdown data dictionary">
            <div class="action-icon-box" style="color: #8b5cf6;">
              <span class="material-symbols-outlined">menu_book</span>
            </div>
            <div class="action-content">
              <div class="action-title">Data Dictionary</div>
              <div class="action-desc">Generate markdown schema documentation</div>
            </div>
          </button>

          <!-- 5. SQL Console -->
          <button type="button" class="drixio-action-card stagger-in" id="btn-quick-open-console" title="Open SQL Query Console">
            <div class="action-icon-box" style="color: #f59e0b;">
              <span class="material-symbols-outlined">terminal</span>
            </div>
            <div class="action-content">
              <div class="action-title">SQL Console</div>
              <div class="action-desc">Write, execute and test arbitrary queries</div>
            </div>
          </button>

          <!-- 6. Visual ERD -->
          <button type="button" class="drixio-action-card stagger-in" id="btn-quick-open-erd" title="View Entity Relationship Diagram">
            <div class="action-icon-box" style="color: #ec4899;">
              <span class="material-symbols-outlined">hub</span>
            </div>
            <div class="action-content">
              <div class="action-title">Visual ERD</div>
              <div class="action-desc">Interactive table relationship canvas</div>
            </div>
          </button>
        </div>
      </div>

      <!-- Collapsible Engine Specifications Drawer -->
      <div class="drixio-runtime-panel skeleton-target">
        <div class="drixio-runtime-header" id="runtime-toggle-header" role="button" tabindex="0">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-soft" style="font-size: 16px;">tune</span>
            <span class="drixio-runtime-title">Engine Specifications & Runtime Environment</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="drixio-runtime-chip" id="runtime-chip-engine">Database Engine</span>
            <span class="material-symbols-outlined text-soft" id="runtime-expand-arrow" style="font-size: 16px; transition: transform 0.2s ease;">expand_more</span>
          </div>
        </div>
        <div class="drixio-runtime-body hidden" id="runtime-details-body">
          <div class="drixio-runtime-grid">
            <div class="runtime-item">
              <span class="runtime-key">Engine Type</span>
              <span class="runtime-val" id="rt-engine">-</span>
            </div>
            <div class="runtime-item">
              <span class="runtime-key">Engine Version</span>
              <span class="runtime-val font-mono" id="rt-version">-</span>
            </div>
            <div class="runtime-item">
              <span class="runtime-key">Database Target</span>
              <span class="runtime-val font-mono" id="rt-dbname">-</span>
            </div>
            <div class="runtime-item">
              <span class="runtime-key">Uptime</span>
              <span class="runtime-val font-mono" id="rt-uptime">-</span>
            </div>
            <div class="runtime-item">
              <span class="runtime-key">Active Connections</span>
              <span class="runtime-val font-mono" id="rt-conns">-</span>
            </div>
            <div class="runtime-item">
              <span class="runtime-key">Total Tables</span>
              <span class="runtime-val font-mono" id="rt-tables">-</span>
            </div>
            <div class="runtime-item">
              <span class="runtime-key">Storage Size</span>
              <span class="runtime-val font-mono" id="rt-storage">-</span>
            </div>
            <div class="runtime-item">
              <span class="runtime-key">Memory Footprint</span>
              <span class="runtime-val font-mono" id="rt-memory">-</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature Prompts (Postgres / MySQL) -->
      <div id="feature-prompts-container" class="flex-col gap-4 hidden"></div>
    </div>
  `;

   // GSAP Skeleton Initial Fade In
   if (window.gsap) {
      gsap.to('.status-dashboard', {
         opacity: 1,
         duration: 0.3,
         ease: 'power2.out',
      });
      // Shimmer animation for skeleton targets
      gsap.to('.skeleton-target', {
         opacity: 0.6,
         yoyo: true,
         repeat: -1,
         duration: 1,
         ease: 'sine.inOut',
      });
   } else {
      document.querySelector('.status-dashboard').style.opacity = '1';
   }

   await fetchAndRenderStatus();

   // Bind Copy Button
   const copyBtn = document.getElementById('btn-copy-conn-uri');
   if (copyBtn) {
      copyBtn.addEventListener('click', () => {
         const uriEl = document.getElementById('hero-conn-uri');
         const labelEl = document.getElementById('btn-copy-conn-label');
         if (
            uriEl &&
            uriEl.textContent &&
            uriEl.textContent !== 'Connecting...'
         ) {
            navigator.clipboard.writeText(uriEl.textContent);
            if (labelEl) {
               labelEl.textContent = 'Copied!';
               setTimeout(() => {
                  if (labelEl) labelEl.textContent = 'Copy';
               }, 1800);
            }
            if (typeof window.showToast === 'function') {
               window.showToast(
                  'Connection URI copied to clipboard!',
                  'success',
               );
            }
         }
      });
   }

   // Bind Quick Action Buttons
   const btnExportBackup = document.getElementById('btn-quick-export-backup');
   if (btnExportBackup) {
      btnExportBackup.addEventListener('click', () => {
         window.open('/api/database/export', '_blank');
      });
   }

   const btnExportDdl = document.getElementById('btn-quick-export-ddl');
   if (btnExportDdl) {
      btnExportDdl.addEventListener('click', () => {
         window.open('/api/database/schema-only', '_blank');
      });
   }

   const btnImportBackup = document.getElementById('btn-quick-import-backup');
   if (btnImportBackup) {
      btnImportBackup.addEventListener('click', () => {
         openImportModal('database');
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

   // Bind Runtime Details Toggle
   const runtimeToggleHeader = document.getElementById('runtime-toggle-header');
   const runtimeDetailsBody = document.getElementById('runtime-details-body');
   const runtimeExpandArrow = document.getElementById('runtime-expand-arrow');
   if (runtimeToggleHeader && runtimeDetailsBody) {
      runtimeToggleHeader.addEventListener('click', () => {
         const isCollapsed = runtimeDetailsBody.classList.contains('hidden');
         if (isCollapsed) {
            runtimeDetailsBody.classList.remove('hidden');
            if (runtimeExpandArrow)
               runtimeExpandArrow.style.transform = 'rotate(180deg)';
         } else {
            runtimeDetailsBody.classList.add('hidden');
            if (runtimeExpandArrow)
               runtimeExpandArrow.style.transform = 'rotate(0deg)';
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
            const currentRot = parseInt(icon.dataset.rot || '0', 10);
            const newRot = currentRot + 360;
            icon.style.transform = `rotate(${newRot}deg)`;
            icon.dataset.rot = `${newRot}`;
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
         const dotIcon = liveToggle.querySelector('.live-dot-icon');
         const textSpan = document.getElementById('status-live-text');
         if (isLiveEnabled) {
            if (dotIcon) dotIcon.style.color = 'var(--color-primary)';
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
         renderError(jsonStatus.error || 'Failed to load status');
      }
   } catch (e) {
      renderError(e instanceof Error ? e.message : String(e));
   }
}

function renderStatusData(data, tableStats = {}, latency = null) {
   const heroDbName = document.getElementById('hero-db-name');
   const heroConnUri = document.getElementById('hero-conn-uri');
   if (!heroDbName) return; // Unmounted

   // Calculate connection URI
   let connUri = '';
   if (data.dbType === 'sqlite') {
      connUri = `sqlite://${data.dbName || 'drixio.db'}`;
   } else if (data.dbType === 'postgres') {
      connUri = `postgresql://localhost:5432/${data.dbName || 'postgres'}`;
   } else if (data.dbType === 'mysql') {
      connUri = `mysql://localhost:3306/${data.dbName || 'mysql'}`;
   } else {
      connUri = `${data.dbType || 'database'}://${data.dbName || ''}`;
   }

   heroDbName.textContent = data.dbName || 'Database';
   if (heroConnUri) heroConnUri.textContent = connUri;

   // Update Primary Database Node
   const nodeDbTitle = document.getElementById('node-db-title');
   const nodeDbDesc = document.getElementById('node-db-desc');
   const nodeDbPath = document.getElementById('node-db-path');
   const nodeEngineAvatar = document.getElementById('node-engine-avatar');
   const nodeEngineIcon = document.getElementById('node-engine-icon');
   const nodeLatencyText = document.getElementById('node-latency-text');
   const nodeStatCpu = document.getElementById('node-stat-cpu');
   const nodeStatRam = document.getElementById('node-stat-ram');
   const nodeStatDisk = document.getElementById('node-stat-disk');
   const nodeStatConns = document.getElementById('node-stat-conns');

   if (nodeDbTitle) nodeDbTitle.textContent = data.dbName || 'Primary Database';
   if (nodeDbDesc) {
      const typeStr = (data.dbType || 'SQL').toUpperCase();
      nodeDbDesc.textContent = `${typeStr} Serverless Engine`;
   }
   if (nodeDbPath) nodeDbPath.textContent = connUri;

   if (nodeEngineAvatar && nodeEngineIcon) {
      if (data.dbType === 'sqlite') {
         nodeEngineIcon.textContent = 'database';
         nodeEngineAvatar.style.background = 'rgba(37, 99, 235, 0.12)';
         nodeEngineAvatar.style.color = 'var(--color-primary)';
      } else if (data.dbType === 'postgres') {
         nodeEngineIcon.textContent = 'dns';
         nodeEngineAvatar.style.background = 'rgba(99, 102, 241, 0.15)';
         nodeEngineAvatar.style.color = '#818cf8';
      } else {
         nodeEngineIcon.textContent = 'database';
         nodeEngineAvatar.style.background = 'rgba(245, 158, 11, 0.15)';
         nodeEngineAvatar.style.color = '#f59e0b';
      }
   }

   if (nodeLatencyText) {
      nodeLatencyText.textContent = latency !== null ? `${latency}ms` : '< 1ms';
   }

   // Node Resource Metrics Strip
   if (nodeStatCpu) {
      nodeStatCpu.textContent = `CPU ${data.osCpuUsage !== undefined ? data.osCpuUsage.toFixed(1) + '%' : '< 1%'}`;
   }
   if (nodeStatDisk) {
      nodeStatDisk.textContent = `Disk ${formatBytes(data.sizeBytes)}`;
   }
   if (nodeStatRam) {
      if (data.osMemUsed && data.osMemTotal) {
         const pct = Math.round((data.osMemUsed / data.osMemTotal) * 100);
         nodeStatRam.textContent = `RAM ${pct}%`;
      } else {
         nodeStatRam.textContent = 'RAM N/A';
      }
   }
   if (nodeStatConns) {
      nodeStatConns.textContent = `${data.activeConnections || 1} conn`;
   }

   // Update Activity Ribbon
   const headerLastUpdated = document.getElementById('header-last-updated');
   if (headerLastUpdated) {
      const d = new Date();
      const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      headerLastUpdated.textContent =
         latency !== null ? `${timeStr} (${latency}ms)` : timeStr;
   }

   // Delegate Analytics & Row Count
   const totalRowCount = renderAnalyticsSplitView(tableStats);

   // Update Ribbon Records Stat
   const ribbonRecordsCount = document.getElementById('ribbon-records-count');
   if (ribbonRecordsCount) {
      ribbonRecordsCount.textContent = `${(totalRowCount || 0).toLocaleString()} Total Records`;
   }

   // Delegate Metric Cards
   renderMetricCards(data, totalRowCount);

   // Update Runtime Details Panel
   const rtEngine = document.getElementById('rt-engine');
   const rtVersion = document.getElementById('rt-version');
   const rtDbname = document.getElementById('rt-dbname');
   const rtUptime = document.getElementById('rt-uptime');
   const rtConns = document.getElementById('rt-conns');
   const rtTables = document.getElementById('rt-tables');
   const rtStorage = document.getElementById('rt-storage');
   const rtMemory = document.getElementById('rt-memory');
   const runtimeChipEngine = document.getElementById('runtime-chip-engine');

   if (rtEngine)
      rtEngine.textContent = (data.dbType || 'UNKNOWN').toUpperCase();
   if (rtVersion)
      rtVersion.textContent = data.version ? `v${data.version}` : 'N/A';
   if (rtDbname) rtDbname.textContent = data.dbName || 'N/A';
   if (rtUptime) rtUptime.textContent = formatUptime(data.uptime);
   const conns = data.activeConnections || (data.dbType === 'sqlite' ? 1 : 1);
   if (rtConns) rtConns.textContent = `${conns} active connection(s)`;
   if (rtTables) rtTables.textContent = `${data.totalTables ?? 0} tables`;
   if (rtStorage) rtStorage.textContent = formatBytes(data.sizeBytes);
   if (rtMemory) {
      if (data.osMemUsed && data.osMemTotal) {
         rtMemory.textContent = `${formatBytes(data.osMemUsed)} / ${formatBytes(data.osMemTotal)}`;
      } else {
         rtMemory.textContent = 'Managed by host system';
      }
   }
   if (runtimeChipEngine) {
      runtimeChipEngine.textContent = `${(data.dbType || 'SQL').toUpperCase()} ${data.version ? `v${data.version}` : ''}`;
   }

   // Render Prompts for Engines
   const promptsContainer = document.getElementById(
      'feature-prompts-container',
   );
   if (promptsContainer) {
      if (data.dbType !== 'sqlite') {
         promptsContainer.innerHTML = /* html */ `
          <div class="feature-prompt stagger-in">
            <span class="material-symbols-outlined icon">info</span>
            <div class="feature-prompt-content">
              <div class="prompt-title">Query Performance Profiling</div>
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

   const healthLabel = document.getElementById('ribbon-health-label');
   if (healthLabel) {
      healthLabel.textContent =
         data.status === 'connected'
            ? '100.0% Connection Health'
            : 'Offline / Disconnected';
   }

   // Trigger GSAP Entry Animations when first loaded
   if (window.gsap && !window._statusAnimatedIn) {
      window._statusAnimatedIn = true;
      // Stop the skeleton shimmer
      gsap.killTweensOf('.skeleton-target');
      gsap.set('.skeleton-target', { clearProps: 'opacity' });

      gsap.fromTo(
         '.drixio-hero-header',
         { opacity: 0, x: -20 },
         { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' },
      );
      gsap.fromTo(
         '.status-dashboard-status-tile',
         { opacity: 0, y: 15 },
         {
            opacity: 1,
            y: 0,
            duration: 0.4,
            stagger: 0.05,
            ease: 'back.out(1.2)',
         },
      );
      gsap.to('#primary-db-node', {
         opacity: 1,
         duration: 0.5,
         ease: 'power2.inOut',
      });
      gsap.fromTo(
         '.drixio-action-card',
         { opacity: 0, y: 10 },
         {
            opacity: 1,
            y: 0,
            duration: 0.4,
            stagger: 0.05,
            ease: 'power2.out',
            delay: 0.2,
         },
      );
   }
}

function renderError(msg) {
   const container = document.getElementById('status-cards-container');
   if (container) {
      if (window.gsap) gsap.killTweensOf('.skeleton-target');

      const dashboard = document.querySelector('.status-dashboard');
      if (dashboard) {
         dashboard.innerHTML = /* html */ `
         <div class="drixio-empty-analytics" style="margin: auto; text-align: center; padding: 40px;">
             <div class="drixio-empty-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--color-error); width: 56px; height: 56px; border-radius: 50%;">
                 <span class="material-symbols-outlined" style="font-size: 28px;">error</span>
             </div>
             <div class="drixio-empty-title" style="font-size: 18px; margin-top: 16px;">Connection Failed</div>
             <div class="drixio-empty-desc" style="max-width: 400px; margin-top: 8px;">
                 Unable to fetch database status. Please check if your database engine is running and accessible.<br><br>
                 <code style="color: var(--color-error); background: rgba(239,68,68,0.05); padding: 4px 8px; border-radius: 4px;">${msg}</code>
             </div>
             <div class="drixio-empty-actions" style="margin-top: 24px;">
                 <button type="button" class="btn-primary" onclick="window.refreshStatusDashboard && window.refreshStatusDashboard()">
                     <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
                     <span>Try Again</span>
                 </button>
             </div>
         </div>
         `;
      }
   }
}
