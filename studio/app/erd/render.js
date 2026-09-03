import { ERDState } from './state.js';
import { loadSavedPositions, getErdPendingDraftCount } from './core.js';
import { bindNodeEvents } from './events/index.js';

export function updateSaveDraftsBadge() {
   const saveBtn = document.getElementById('btn-erd-save-drafts');
   if (!saveBtn) return;
   const count = getErdPendingDraftCount(ERDState.erdData);
   const badge = saveBtn.querySelector('.erd-draft-count-badge');
   if (count > 0) {
      saveBtn.classList.remove('disabled');
      saveBtn.classList.add('has-drafts');
      if (badge) {
         badge.textContent = count;
         badge.style.display = 'inline-flex';
      }
   } else {
      saveBtn.classList.remove('has-drafts');
      if (badge) {
         badge.style.display = 'none';
      }
   }
}

export function renderNodes() {
   const nodesLayer = document.getElementById('erd-nodes-layer');
   if (!nodesLayer) return;
   nodesLayer.innerHTML = '';

   if (!ERDState.erdData || ERDState.erdData.length === 0) {
      nodesLayer.innerHTML = /* html */ `
      <div class="erd-empty-workspace">
        <div class="erd-empty-icon-box">
          <span class="material-symbols-outlined">account_tree</span>
        </div>
        <h3>No tables in this database</h3>
        <p>Right-click the canvas or click "+ Add Table" above to create an entity.</p>
      </div>
    `;
      updateSaveDraftsBadge();
      return;
   }

   const savedPositions = loadSavedPositions();
   let startX = 600;
   let startY = 400;
   let maxRowHeight = 0;

   ERDState.erdData.forEach((schema) => {
      let x, y;
      if (savedPositions[schema.table]) {
         x = savedPositions[schema.table].x;
         y = savedPositions[schema.table].y;
      } else {
         x = startX;
         y = startY;
         startX += 340;
         if (startX > 1800) {
            startX = 600;
            startY += maxRowHeight + 60;
            maxRowHeight = 0;
         }
      }

      const node = createNodeElement(schema, x, y);
      if (ERDState.selectedTables.has(schema.table)) {
         node.classList.add('is-selected');
      }
      nodesLayer.appendChild(node);

      const estHeight = 44 + schema.columns.length * 34 + 36;
      if (estHeight > maxRowHeight) maxRowHeight = estHeight;
   });

   bindNodeEvents();
   updateSaveDraftsBadge();

   setTimeout(() => {
      drawLines();
      renderMinimap();
   }, 10);
}

export function createNodeElement(schema, x, y) {
   const node = document.createElement('div');
   node.className = `erd-node ${schema.isDraft ? 'is-draft' : ''}`;
   node.dataset.table = schema.table;
   node.style.left = `${x}px`;
   node.style.top = `${y}px`;

   let columnsHtml = schema.columns
      .map((col, index) => {
         const isFkClass = col.fkTarget ? 'is-fk' : '';
         const isDraftClass = col.isDraft ? 'is-draft' : '';
         const typeStr = col.type.toUpperCase();

         return /* html */ `
      <div class="erd-column ${isFkClass} ${isDraftClass}" data-col="${col.name}" data-index="${index}">
        <div class="erd-col-left">
          <span class="erd-reorder-handle" draggable="true" title="Drag to reorder column">
            ${
               col.isPk
                  ? '<span class="erd-badge-pk" title="Primary Key">PK</span>'
                  : col.fkTarget
                    ? `<span class="erd-badge-fk" title="Foreign Key to ${col.fkTarget.table}.${col.fkTarget.column}">FK</span>`
                    : '<span class="erd-col-bullet"></span>'
            }
          </span>
          <span class="erd-col-name editable-field ${col.isPk ? 'is-pk' : ''}" data-field="name">${col.name}</span>
          ${col.nullable ? '<span class="erd-col-nullable" title="Nullable column">?</span>' : ''}
        </div>
        <div class="erd-col-right">
          <span class="erd-col-type editable-field" data-field="type">${typeStr}</span>
          ${
             (col.isDraft || schema.isDraft) && !col.isPk
                ? /* html */ `<div class="erd-drag-handle" title="Drag to create Foreign Key"></div>`
                : ''
          }
        </div>
      </div>
    `;
      })
      .join('');

   node.innerHTML = /* html */ `
    <div class="erd-node-header" title="${schema.isDraft ? 'Double-click to rename table' : 'Double-click to open Schema view'}">
      <div class="erd-node-header-left">
        <div class="erd-node-icon-box">
          <span class="material-symbols-outlined erd-node-icon">table_chart</span>
        </div>
        <span class="erd-node-name">${schema.table}</span>
        ${schema.isDraft ? '<span class="erd-badge-draft">DRAFT</span>' : ''}
      </div>
      <div class="erd-node-header-right">
        <span class="erd-col-count" title="${schema.columns.length} columns">${schema.columns.length}</span>
        <span class="material-symbols-outlined erd-node-drag-handle">drag_indicator</span>
      </div>
    </div>
    <div class="erd-node-body">
      ${columnsHtml}
    </div>
    <div class="erd-add-col-btn">
      <span class="material-symbols-outlined" style="font-size: 15px;">add</span>
      <span>Add Column</span>
    </div>
  `;

   return node;
}

export function drawLines() {
   const svg = document.getElementById('erd-svg-layer');
   if (!svg) return;

   let pathsHtml = '';

   ERDState.erdData.forEach((schema) => {
      const fromTable = schema.table;
      const fromNode = document.querySelector(
         `.erd-node[data-table="${fromTable}"]`,
      );
      if (!fromNode) return;

      schema.columns.forEach((col) => {
         if (col.fkTarget) {
            const toTable = col.fkTarget.table;
            const toCol = col.fkTarget.column;
            const toNode = document.querySelector(
               `.erd-node[data-table="${toTable}"]`,
            );
            if (!toNode) return;

            const fromColEl = fromNode.querySelector(
               `.erd-column[data-col="${col.name}"]`,
            );
            const toColEl = toNode.querySelector(
               `.erd-column[data-col="${toCol}"]`,
            );
            if (!fromColEl || !toColEl) return;

            const fromRect = fromColEl.getBoundingClientRect();
            const toRect = toColEl.getBoundingClientRect();
            const workspaceRect = document
               .getElementById('erd-workspace')
               .getBoundingClientRect();

            // SMART ROUTING LOGIC
            let startX, startY, endX, endY;

            if (fromRect.right < toRect.left + 20) {
               startX = (fromRect.right - workspaceRect.left) / ERDState.zoom;
               endX = (toRect.left - workspaceRect.left) / ERDState.zoom;
            } else {
               startX = (fromRect.left - workspaceRect.left) / ERDState.zoom;
               endX = (toRect.right - workspaceRect.left) / ERDState.zoom;
            }

            startY =
               (fromRect.top + fromRect.height / 2 - workspaceRect.top) /
               ERDState.zoom;
            endY =
               (toRect.top + toRect.height / 2 - workspaceRect.top) /
               ERDState.zoom;

            const deltaX = Math.abs(endX - startX);
            const curveOffset = Math.max(deltaX * 0.5, 50);

            const cp1x =
               startX < endX ? startX + curveOffset : startX - curveOffset;
            const cp1y = startY;
            const cp2x =
               startX < endX ? endX - curveOffset : endX + curveOffset;
            const cp2y = endY;

            const startMarker = 'url(#crows-foot-zero-many)';
            const endMarker = col.nullable
               ? 'url(#zero-or-one)'
               : 'url(#one-and-only-one)';

            pathsHtml += /* html */ `
          <path 
            class="erd-relationship-path"
            d="M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}" 
            fill="none" 
            marker-start="${startMarker}"
            marker-end="${endMarker}"
            data-from-table="${fromTable}"
            data-from-col="${col.name}"
            data-to-table="${toTable}"
            data-to-col="${toCol}"
          />
        `;
         }
      });
   });

   svg.innerHTML = /* html */ `
    <defs>
      <!-- FK side: Zero or Many (0<) -->
      <marker id="crows-foot-zero-many" viewBox="0 0 16 10" refX="16" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
        <path d="M 16 0 L 8 5 M 16 10 L 8 5 M 16 5 L 8 5 M 4 5 L 0 5" fill="none" stroke="currentColor" stroke-width="1.5" />
        <circle cx="5" cy="5" r="3" fill="var(--color-bg-primary)" stroke="currentColor" stroke-width="1.5" />
      </marker>
      
      <!-- PK side: One and Only One (||) -->
      <marker id="one-and-only-one" viewBox="0 0 16 10" refX="13" refY="5" markerWidth="10" markerHeight="10" orient="auto">
        <path d="M 10 0 L 10 10 M 6 0 L 6 10" fill="none" stroke="currentColor" stroke-width="1.5" />
      </marker>

      <!-- PK side: Zero or One (0|) -->
      <marker id="zero-or-one" viewBox="0 0 16 10" refX="13" refY="5" markerWidth="10" markerHeight="10" orient="auto">
        <path d="M 10 0 L 10 10 M 6 0 L 6 10" fill="none" stroke="currentColor" stroke-width="1.5" />
        <circle cx="5" cy="5" r="3" fill="var(--color-bg-primary)" stroke="currentColor" stroke-width="1.5" />
      </marker>
    </defs>
    ${pathsHtml}
  `;
}

export function getMinimapMetrics(workspace, nodes) {
   const mapW = 180;
   const mapH = 120;

   if (!workspace || !nodes || nodes.length === 0) {
      return {
         mapW,
         mapH,
         scale: 0.1,
         offsetX: 0,
         offsetY: 0,
         minX: 0,
         minY: 0,
         vW: 800,
         vH: 600,
         vLeft: 0,
         vTop: 0,
      };
   }

   const vW = workspace.clientWidth / ERDState.zoom;
   const vH = workspace.clientHeight / ERDState.zoom;
   const vLeft = workspace.scrollLeft / ERDState.zoom;
   const vTop = workspace.scrollTop / ERDState.zoom;

   let minX = Infinity;
   let minY = Infinity;
   let maxX = -Infinity;
   let maxY = -Infinity;

   nodes.forEach((node) => {
      const x = parseFloat(node.style.left) || 0;
      const y = parseFloat(node.style.top) || 0;
      const w = node.offsetWidth || 290;
      const h = node.offsetHeight || 150;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
   });

   if (minX === Infinity) {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 600;
   }

   // Add fixed padding around the tables
   const padding = 200;
   minX -= padding;
   minY -= padding;
   maxX += padding;
   maxY += padding;

   const nodesW = maxX - minX;
   const nodesH = maxY - minY;

   // The data area must be at least as large as the viewport
   // so the viewport rectangle is never bigger than the minimap!
   const dataW = Math.max(nodesW, vW);
   const dataH = Math.max(nodesH, vH);

   // Center the nodes bounding box inside the data bounding box
   const centerX = minX + nodesW / 2;
   const centerY = minY + nodesH / 2;
   const finalMinX = centerX - dataW / 2;
   const finalMinY = centerY - dataH / 2;

   const scale = Math.min(mapW / dataW, mapH / dataH);
   const offsetX = (mapW - dataW * scale) / 2;
   const offsetY = (mapH - dataH * scale) / 2;

   return {
      mapW,
      mapH,
      scale,
      offsetX,
      offsetY,
      minX: finalMinX,
      minY: finalMinY,
      vW,
      vH,
      vLeft,
      vTop,
   };
}

export function renderMinimap() {
   const minimapContent = document.getElementById('erd-minimap-content');
   if (!minimapContent) return;

   minimapContent.innerHTML = '';

   const nodesLayer = document.getElementById('erd-nodes-layer');
   const workspace = document.getElementById('erd-wrapper');
   if (!nodesLayer || !workspace) return;

   const nodes = Array.from(nodesLayer.querySelectorAll('.erd-node'));
   if (nodes.length === 0) return;

   const { scale, offsetX, offsetY, minX, minY, vW, vH, vLeft, vTop } =
      getMinimapMetrics(workspace, nodes);

   nodes.forEach((node) => {
      const x = parseFloat(node.style.left) || 0;
      const y = parseFloat(node.style.top) || 0;
      const w = node.offsetWidth || 290;
      const h = node.offsetHeight || 150;
      const table = node.dataset.table;

      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.left = `${offsetX + (x - minX) * scale}px`;
      div.style.top = `${offsetY + (y - minY) * scale}px`;
      div.style.width = `${Math.max(w * scale, 8)}px`;
      div.style.height = `${Math.max(h * scale, 6)}px`;
      div.style.backgroundColor = 'var(--color-primary)';
      div.style.opacity = ERDState.selectedTables.has(table) ? '1' : '0.6';
      div.style.borderRadius = '2px';
      minimapContent.appendChild(div);
   });

   // Render Viewport
   const viewport = document.getElementById('erd-minimap-viewport');
   if (viewport) {
      viewport.style.left = `${offsetX + (vLeft - minX) * scale}px`;
      viewport.style.top = `${offsetY + (vTop - minY) * scale}px`;
      viewport.style.width = `${vW * scale}px`;
      viewport.style.height = `${vH * scale}px`;
   }
}
