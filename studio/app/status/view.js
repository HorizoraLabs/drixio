import { renderMetricCards } from "./components/cards.js";
import { renderAnalyticsSplitView } from "./components/analytics.js";

export function refreshStatusDashboard() {
  fetchAndRenderStatus();
}

export async function loadStatusDashboard(container) {
  container.innerHTML = /* html */ `
    <div class="status-dashboard">
      <div class="hero-overview-panel">
        <div class="status-db-icon-container">
          <span class="material-symbols-outlined status-db-icon" id="status-db-icon">database_search</span>
          <span id="connection-dot" class="connection-dot yellow"></span>
        </div>
        <div class="hero-info">
          <h1 id="header-db-name" class="hero-db-name">-</h1>
          <div class="hero-subinfo">
            <span id="header-db-type" class="hero-db-type">-</span>
            <span class="hero-dot-separator">•</span>
            <span id="header-db-version" class="hero-db-version">-</span>
          </div>
        </div>
        <div class="hero-actions" style="margin-left: auto; margin-bottom: auto;">
          <button id="status-refresh-btn" class="icon-btn primary" title="Refresh Metrics" style="display: flex; align-items: center; margin-bottom: auto; gap: 8px; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); color: var(--color-text); cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s;">
            <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      <div class="status-grid" id="status-cards-container">
        <!-- Cards will be injected here -->
      </div>
      
      <div class="analytics-split-view">
        <div id="status-toptables-container" class="top-tables-container hidden">
           <!-- Top tables injected here -->
        </div>
        <div id="status-distribution-container" class="distribution-container hidden">
           <!-- Distribution Bar injected here -->
        </div>
      </div>
      
      <div id="feature-prompts-container" class="flex-col gap-4 mt-4 hidden">
         <!-- Feature prompts will be injected here -->
      </div>
    </div>
  `;

  await fetchAndRenderStatus();

  // Bind Refresh Button
  const refreshBtn = document.getElementById("status-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      const icon = refreshBtn.querySelector(".material-symbols-outlined");
      if (icon) {
        icon.style.transition = "transform 0.5s ease";
        icon.style.transform = `rotate(${((icon.dataset.rot || 0) * 1) + 360}deg)`;
        icon.dataset.rot = ((icon.dataset.rot || 0) * 1) + 360;
      }
      fetchAndRenderStatus();
    });
  }

  // Setup polling
  if (window.statusPollingInterval) {
    clearInterval(window.statusPollingInterval);
  }

  window.statusPollingInterval = setInterval(() => {
    // Only poll if the tab is active
    if (window.AppState.currentTab === "status-btn") {
      fetchAndRenderStatus();
    }
  }, 3000);
}

async function fetchAndRenderStatus() {
  try {
    const [resStatus, resStats] = await Promise.all([
      fetch("/api/status"),
      fetch("/api/tables/stats"),
    ]);
    const jsonStatus = await resStatus.json();
    const jsonStats = await resStats.json();

    if (jsonStatus.success) {
      renderStatusData(jsonStatus.data, jsonStats.data);
    } else {
      renderError(jsonStatus.error);
    }
  } catch (e) {
    renderError(e.message);
  }
}

function renderStatusData(data, tableStats = {}) {
  const icon = document.getElementById("status-db-icon");
  const dot = document.getElementById("connection-dot");
  if (!icon || !dot) return; // Unmounted

  if (data.status === "connected") {
    icon.textContent = "database";
    dot.className = "connection-dot green";
  } else {
    icon.textContent = "database_off";
    dot.className = "connection-dot red";
    return;
  }

  // Render Hero
  const headerDbName = document.getElementById("header-db-name");
  const headerDbType = document.getElementById("header-db-type");
  const headerDbVersion = document.getElementById("header-db-version");

  if (headerDbName) headerDbName.textContent = data.dbName || "Unknown";
  if (headerDbType) headerDbType.textContent = data.dbType || "Unknown";
  if (headerDbVersion)
    headerDbVersion.textContent = data.version ? `v${data.version}` : "N/A";

  // Delegate Cards
  renderMetricCards(data);

  // Render Prompts
  const promptsContainer = document.getElementById("feature-prompts-container");
  if (promptsContainer) {
    promptsContainer.innerHTML = /* html */ `
      <div class="feature-prompt">
        <span class="material-symbols-outlined icon">info</span>
        <div>
          <div class="prompt-title">Avg Query Latency & Slow Queries</div>
          <div>This metric requires specific database plugins to be enabled on your server (e.g. <code>pg_stat_statements</code> for PostgreSQL, or <code>Performance Schema</code> for MySQL).</div>
        </div>
      </div>
    `;
    promptsContainer.classList.remove("hidden");
    promptsContainer.classList.add("flex");
  }

  // Delegate Analytics Split View
  renderAnalyticsSplitView(tableStats);
}

function renderError(msg) {
  const icon = document.getElementById("status-db-icon");
  const dot = document.getElementById("connection-dot");
  if (icon && dot) {
    icon.textContent = "database_off";
    dot.className = "connection-dot red";
  }
  const container = document.getElementById("status-cards-container");
  if (container) {
    container.innerHTML = /* html */ `<div class="text-red-500">Failed to load database status: ${msg}</div>`;
  }
}
