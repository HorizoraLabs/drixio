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
      <div id="erd-wrapper" class="erd-grid-bg" style="width: 100%; height: 100%; overflow: auto; background-color: var(--color-bg-secondary); position: relative; user-select: none;">
        <div id="erd-workspace" style="position: relative; width: 4000px; height: 4000px; transform-origin: 0 0;">
          <svg id="erd-svg-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;"></svg>
          <div id="erd-nodes-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;"></div>
        </div>
        
        <!-- Minimap & Search Container -->
        <div style="position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 12px; z-index: 100; pointer-events: none;">
          <!-- Search -->
          <div class="erd-search-container" style="pointer-events: auto;">
            <span class="material-symbols-outlined search-icon">search</span>
            <input type="text" id="erd-search-input" placeholder="Search tables..." autocomplete="off">
            <div id="erd-search-results" class="erd-search-results" style="display: none;"></div>
          </div>
          
          <!-- Zoom Controls -->
          <div style="display: flex; gap: 8px; justify-content: flex-end; pointer-events: auto;">
             <button id="btn-erd-zoom-out" class="drixio-btn drixio-btn-secondary" title="Zoom Out" style="padding: 4px; border-radius: 4px; min-width: 32px; height: 32px;"><span class="material-symbols-outlined" style="font-size: 20px;">remove</span></button>
             <button id="btn-erd-zoom-reset" class="drixio-btn drixio-btn-secondary" title="Reset Zoom" style="padding: 4px; border-radius: 4px; min-width: 32px; height: 32px; font-weight: bold; font-size: 13px;">100%</button>
             <button id="btn-erd-zoom-in" class="drixio-btn drixio-btn-secondary" title="Zoom In" style="padding: 4px; border-radius: 4px; min-width: 32px; height: 32px;"><span class="material-symbols-outlined" style="font-size: 20px;">add</span></button>
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
    nodesLayer.innerHTML = `<div style="padding: 24px; color: var(--color-text-soft);">Loading ERD Data...</div>`;

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
