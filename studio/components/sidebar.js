import { fetchTables, fetchTableStats } from "../lib/api.js";

export async function initSidebar() {
  try {
    const res = await fetchTables();
    const tableNav = document.getElementById("table-nav");
    let notFoundMsg = document.getElementById("not-found-msg");
    if (notFoundMsg) notFoundMsg.remove();
    if (res.success && res.data && res.data.length > 0) {
      res.data.forEach((tableName) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "table-btn";
        btn.dataset.table = tableName;
        btn.innerHTML = /* html */ `<span>${tableName}</span><span class="table-btn-badge" id="badge-${tableName}" class="hidden"></span>`;
        btn.onclick = () => {
          window.AppState.currentTable = tableName;
          window.AppState.currentTableBtnElement = btn;

          if (
            window.AppState.currentTab === "erd-btn" ||
            window.AppState.currentTab === "sql-btn" ||
            window.AppState.currentTab === "status-btn"
          ) {
            window.handleSwitchTab("data-btn");
          } else {
            window.renderCurrentView();
          }
        };
        tableNav.appendChild(btn);
      });
      window.handleSwitchTab("data-btn");

      // Fetch stats asynchronously
      fetchTableStats()
        .then((statsRes) => {
          if (statsRes.success && statsRes.data) {
            Object.entries(statsRes.data).forEach(([tName, count]) => {
              const badge = document.getElementById(`badge-${tName}`);
              if (badge) {
                badge.textContent = Number(count).toLocaleString();
                badge.style.display = "inline-flex"; // flex so it aligns content center
              }
            });
          }
        })
        .catch((e) => console.error("Failed to load table stats:", e));
    } else {
      tableNav.innerHTML = /* html */ `<div id="not-found-msg">No Tables Found.</div>`;
      window.handleSwitchTab("data-btn");
    }
  } catch (err) {
    console.error("Failed to fetch tables:", err);
  }
}
