import { ERDState } from "./state.js";
import {
  fetchAllSchemaData,
  loadSavedPositions,
  savePositions,
} from "./core.js";
import { renderNodes } from "./render.js";
import {
  bindGlobalEvents,
  handleCopy,
  handlePaste,
  handleDelete,
} from "./events/index.js";

import { showContextMenu } from "../../components/contextMenu.js";

export async function loadErd(container) {
  if (!document.getElementById("erd-wrapper")) {
    // Initial workspace creation
    container.innerHTML = /* html */ `
      <div id="erd-wrapper" class="erd-grid-bg erd-workspace-container">
        <div id="erd-workspace" class="erd-workspace-canvas">
          <svg id="erd-svg-layer" class="erd-svg-layer"></svg>
          <div id="erd-nodes-layer" class="erd-nodes-layer"></div>
        </div>
        <div class="erd-controls-container">
          <!-- Search -->
          <div class="erd-search-container" class="pointer-events-auto">
            <span class="material-symbols-outlined search-icon">search</span>
            <input type="text" id="erd-search-input" placeholder="Search tables..." autocomplete="off">
            <div id="erd-search-results" class="erd-search-results hidden"></div>
          </div>
          
          <!-- Zoom Controls -->
          <div class="erd-controls-group">
             <button id="btn-erd-zoom-out" class="drixio-btn drixio-btn-secondary erd-zoom-btn" title="Zoom Out"><span class="material-symbols-outlined" class="icon-20">remove</span></button>
             <button id="btn-erd-zoom-reset" class="drixio-btn drixio-btn-secondary erd-zoom-text-btn" title="Reset Zoom">100%</button>
             <button id="btn-erd-zoom-in" class="drixio-btn drixio-btn-secondary erd-zoom-btn" title="Zoom In"><span class="material-symbols-outlined" class="icon-20">add</span></button>
          </div>
          
          <!-- Minimap -->
          <div id="erd-minimap" class="erd-minimap">
             <div id="erd-minimap-content" class="erd-minimap-content"></div>
             <div id="erd-minimap-viewport" class="erd-minimap-viewport"></div>
          </div>
        </div>
      </div>
    `;

    let contextMenuPos = { x: 0, y: 0 };
    const wrapper = document.getElementById("erd-wrapper");

    wrapper.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (e.target.closest(".erd-node")) return;

      const workspaceRect = document
        .getElementById("erd-workspace")
        .getBoundingClientRect();
      contextMenuPos.x = (e.clientX - workspaceRect.left) / ERDState.zoom;
      contextMenuPos.y = (e.clientY - workspaceRect.top) / ERDState.zoom;

      showContextMenu(e, [
         {
            label: 'Add Table',
            icon: 'table_chart',
            action: () => {
              const newTableName = `new_table_${Math.floor(Math.random() * 1000)}`;
              const newSchema = {
                table: newTableName,
                isDraft: true,
                columns: [
                  {
                    name: "id",
                    type: "INTEGER",
                    isPk: true,
                    isDraft: true,
                    nullable: false,
                  },
                ],
              };

              const positions = loadSavedPositions();
              positions[newTableName] = { x: contextMenuPos.x, y: contextMenuPos.y };
              savePositions(positions);

              ERDState.pushUndoState();
              ERDState.erdData.push(newSchema);
              renderNodes();
            }
         },
         {
            label: 'Paste',
            icon: 'content_paste',
            action: handlePaste
         }
      ]);
    });

    bindGlobalEvents();
  }

  // Show loading indicator
  const nodesLayer = document.getElementById("erd-nodes-layer");
  if (nodesLayer)
    nodesLayer.innerHTML = `<div class="p-6 text-soft">Loading ERD Data...</div>`;

  const fetchedData = await fetchAllSchemaData();
  ERDState.erdData = fetchedData || [];

  // Sort columns: PK first, FKs at bottom
  ERDState.erdData.forEach((schema) => {
    schema.columns.sort((a, b) => {
      if (a.isPk && !b.isPk) return -1;
      if (!a.isPk && b.isPk) return 1;
      if (!!a.fkTarget && !b.fkTarget) return 1;
      if (!a.fkTarget && !!b.fkTarget) return -1;
      return 0;
    });
    // Ensure PKs are never nullable
    schema.columns.forEach(c => {
      if (c.isPk) c.nullable = false;
    });
  });

  ERDState.undoStack = [];
  ERDState.clearSelection();

  renderNodes();
}
