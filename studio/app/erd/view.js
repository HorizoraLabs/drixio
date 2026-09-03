import { ERDState } from './state.js';
import {
   fetchAllSchemaData,
   loadSavedPositions,
   savePositions,
} from './core.js';
import { renderNodes } from './render.js';
import { bindGlobalEvents, handlePaste } from './events/index.js';
import { showContextMenu } from '../../components/contextMenu.js';

export function addNewDraftTable(x = 120, y = 120) {
   const newTableName = `new_table_${Math.floor(Math.random() * 1000)}`;
   const newSchema = {
      table: newTableName,
      isDraft: true,
      columns: [
         {
            name: 'id',
            type: 'INTEGER',
            isPk: true,
            isDraft: true,
            nullable: false,
         },
      ],
   };

   const positions = loadSavedPositions();
   positions[newTableName] = { x, y };
   savePositions(positions);

   ERDState.pushUndoState();
   ERDState.erdData.push(newSchema);
   ERDState.setSelection(newTableName);
   renderNodes();
}

export async function loadErd(container) {
   const headerTableName = document.getElementById('table-name');
   if (headerTableName)
      headerTableName.textContent = 'Entity Relationship Diagram';
   const headerTableIcon = document.getElementById('table-icon');
   if (headerTableIcon) headerTableIcon.textContent = 'account_tree';

   if (!document.getElementById('erd-main-viewport')) {
      container.innerHTML = /* html */ `
      <div id="erd-main-viewport" class="erd-main-viewport">
        <!-- Canvas Scrollable Workspace -->
        <div id="erd-wrapper" class="erd-grid-bg erd-workspace-container">
          <div id="erd-workspace" class="erd-workspace-canvas">
            <svg id="erd-svg-layer" class="erd-svg-layer"></svg>
            <div id="erd-nodes-layer" class="erd-nodes-layer"></div>
          </div>
        </div>

        <!-- Top Floating Action HUD -->
        <div class="erd-top-hud">
          <div class="erd-hud-left">
            <div class="erd-search-box">
              <span class="material-symbols-outlined search-icon">search</span>
              <input type="text" id="erd-search-input" placeholder="Search tables..." autocomplete="off">
              <kbd class="erd-search-shortcut">/</kbd>
              <div id="erd-search-results" class="erd-search-results hidden"></div>
            </div>
          </div>

          <div class="erd-hud-right">
            <button type="button" id="btn-erd-add-table" class="erd-hud-btn" title="Add a new draft table">
              <span class="material-symbols-outlined icon-18">add</span>
              <span>Add Table</span>
            </button>

            <button type="button" id="btn-erd-auto-layout" class="erd-hud-btn" title="Auto arrange tables neatly">
              <span class="material-symbols-outlined icon-18">account_tree</span>
              <span>Auto Layout</span>
            </button>

            <button type="button" id="btn-erd-snap-grid" class="erd-hud-btn active" title="Toggle magnetic grid snapping">
              <span class="material-symbols-outlined icon-18">grid_4x4</span>
              <span>Snap</span>
            </button>

            <div class="erd-hud-divider"></div>

            <button type="button" id="btn-erd-save-drafts" class="erd-hud-btn primary disabled" title="Save draft tables and columns (Ctrl+S)">
              <span class="material-symbols-outlined icon-18">save</span>
              <span>Save</span>
              <span class="erd-draft-count-badge" style="display: none;">0</span>
            </button>
          </div>
        </div>

        <!-- Bottom-Left Shortcuts Helper -->
        <div class="erd-shortcuts-helper">
          <span class="erd-shortcut-item"><kbd>Alt</kbd>+Drag Pan</span>
          <span class="erd-shortcut-item"><kbd>Ctrl</kbd>+Scroll Zoom</span>
          <span class="erd-shortcut-item"><kbd>Ctrl</kbd>+<kbd>S</kbd> Save</span>
        </div>

        <!-- Bottom-Right Floating Navigation Dock -->
        <div class="erd-bottom-dock">
          <!-- Collapsible Minimap -->
          <div id="erd-minimap-container" class="erd-minimap-container">
            <div class="erd-minimap-header">
              <span class="erd-minimap-title">
                <span class="material-symbols-outlined icon-14">map</span>
                Minimap
              </span>
              <button type="button" id="btn-erd-close-minimap" class="icon-btn" title="Hide minimap">
                <span class="material-symbols-outlined icon-14">close</span>
              </button>
            </div>
            <div id="erd-minimap" class="erd-minimap">
              <div id="erd-minimap-content" class="erd-minimap-content"></div>
              <div id="erd-minimap-viewport" class="erd-minimap-viewport"></div>
            </div>
          </div>

          <!-- Zoom HUD Controls -->
          <div class="erd-zoom-controls">
            <button type="button" id="btn-erd-zoom-out" class="erd-dock-btn" title="Zoom Out">
              <span class="material-symbols-outlined icon-18">remove</span>
            </button>
            <button type="button" id="btn-erd-zoom-reset" class="erd-dock-btn erd-zoom-value" title="Reset Zoom to 100%">
              100%
            </button>
            <button type="button" id="btn-erd-zoom-in" class="erd-dock-btn" title="Zoom In">
              <span class="material-symbols-outlined icon-18">add</span>
            </button>
            <button type="button" id="btn-erd-fit-view" class="erd-dock-btn" title="Fit tables to view">
              <span class="material-symbols-outlined icon-18">crop_free</span>
            </button>
            <div class="erd-dock-divider"></div>
            <button type="button" id="btn-erd-toggle-minimap" class="erd-dock-btn active" title="Toggle Minimap">
              <span class="material-symbols-outlined icon-18">map</span>
            </button>
          </div>
        </div>
      </div>
    `;

      const wrapper = document.getElementById('erd-wrapper');

      wrapper.addEventListener('contextmenu', (e) => {
         e.preventDefault();
         if (e.target.closest('.erd-node')) return;

         const workspaceRect = document
            .getElementById('erd-workspace')
            .getBoundingClientRect();
         const clickX = (e.clientX - workspaceRect.left) / ERDState.zoom;
         const clickY = (e.clientY - workspaceRect.top) / ERDState.zoom;

         showContextMenu(e, [
            {
               label: 'Add Table',
               icon: 'table_chart',
               action: () => addNewDraftTable(clickX, clickY),
            },
            {
               label: 'Paste',
               icon: 'content_paste',
               action: handlePaste,
            },
         ]);
      });

      bindGlobalEvents();
   }

   // Show loading indicator
   const nodesLayer = document.getElementById('erd-nodes-layer');
   if (nodesLayer) {
      nodesLayer.innerHTML = `<div class="erd-loading-state"><span class="material-symbols-outlined animate-spin icon-24">progress_activity</span><span>Loading Schema Diagrams...</span></div>`;
   }

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
      schema.columns.forEach((c) => {
         if (c.isPk) c.nullable = false;
      });
   });

   ERDState.undoStack = [];
   ERDState.clearSelection();

   renderNodes();

   // Automatically center the viewport on the tables on initial load
   setTimeout(() => {
      const wrapper = document.getElementById('erd-wrapper');
      if (wrapper && wrapper.scrollLeft === 0 && wrapper.scrollTop === 0) {
         const nodes = document.querySelectorAll('.erd-node');
         if (nodes.length > 0) {
            let minX = Infinity,
               minY = Infinity,
               maxX = -Infinity,
               maxY = -Infinity;
            nodes.forEach((n) => {
               const x = parseFloat(n.style.left) || 0;
               const y = parseFloat(n.style.top) || 0;
               const w = n.offsetWidth || 290;
               const h = n.offsetHeight || 150;
               if (x < minX) minX = x;
               if (y < minY) minY = y;
               if (x + w > maxX) maxX = x + w;
               if (y + h > maxY) maxY = y + h;
            });
            const cX = (minX + maxX) / 2;
            const cY = (minY + maxY) / 2;
            wrapper.scrollLeft = cX * ERDState.zoom - wrapper.clientWidth / 2;
            wrapper.scrollTop = cY * ERDState.zoom - wrapper.clientHeight / 2;
         }
      }
   }, 40);
}
