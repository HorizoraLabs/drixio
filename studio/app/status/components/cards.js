import { formatUptime, formatBytes } from "../utils.js";

let lastPollData = null;
let lastPollTime = null;

function createCard(icon, title, value, colorClass, subtext = "") {
  return /* html */ `
    <div class="status-card ${colorClass}">
      <div class="status-card-header">
        <span>${title}</span>
        <div class="status-card-icon">
          <span class="material-symbols-outlined">${icon}</span>
        </div>
      </div>
      <div class="status-card-value">${value}</div>
      ${subtext ? `<div class="status-card-subtext">${subtext}</div>` : ""}
    </div>
  `;
}

export function renderMetricCards(data) {
  const cardsContainer = document.getElementById("status-cards-container");
  if (!cardsContainer) return;

  let cardsHtml = "";
  const now = Date.now();

  // 1. Total Tables
  cardsHtml += createCard(
    "table",
    "Total Tables",
    data.totalTables || "0",
    "card-purple",
  );

  // 2. Storage
  cardsHtml += createCard(
    "hard_drive",
    "Storage Used",
    formatBytes(data.sizeBytes),
    "card-warning",
  );

  // 3. Active Connections
  cardsHtml += createCard(
    "dns",
    "Active Connections",
    data.activeConnections || "0",
    "card-success",
  );

  // 4. Uptime (if available)
  if (data.uptime) {
    cardsHtml += createCard(
      "schedule",
      "Server Uptime",
      formatUptime(data.uptime),
      "card-purple",
    );
  }

  // 5. Database Specific Metric
  if (data.dbType === "mysql") {
    let qps = 0;
    if (lastPollData && lastPollTime && data.queries) {
      const timeDiff = (now - lastPollTime) / 1000;
      const queryDiff = data.queries - lastPollData.queries;
      qps = Math.max(0, queryDiff / timeDiff);
    }
    cardsHtml += createCard(
      "speed",
      "Queries Per Second",
      qps.toFixed(1),
      "card-primary",
      "QPS (Estimated)",
    );
  } else if (data.dbType === "postgres") {
    let tps = 0;
    if (lastPollData && lastPollTime && data.transactions) {
      const timeDiff = (now - lastPollTime) / 1000;
      const txDiff = data.transactions - lastPollData.transactions;
      tps = Math.max(0, txDiff / timeDiff);
    }
    cardsHtml += createCard(
      "receipt_long",
      "Transactions Per Sec",
      tps.toFixed(1),
      "card-primary",
      "TPS (Estimated)",
    );
  } else if (data.dbType === "sqlite") {
    const memUsagePct = ((data.osMemUsed / data.osMemTotal) * 100).toFixed(1);
    cardsHtml += createCard(
      "memory",
      "Host Memory Usage",
      `${memUsagePct}%`,
      "card-primary",
      formatBytes(data.osMemUsed),
    );
    cardsHtml += createCard(
      "memory_alt",
      "Host CPU Load",
      (data.osCpuUsage || 0).toFixed(2),
      "card-purple",
      "1 min avg",
    );
  }

  cardsContainer.innerHTML = cardsHtml;

  lastPollData = data;
  lastPollTime = now;
}
