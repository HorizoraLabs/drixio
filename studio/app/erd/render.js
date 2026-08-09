import { ERDState } from "./state.js";
import { loadSavedPositions } from "./core.js";
import { bindNodeEvents } from "./events/index.js";

export function renderNodes() {
  const nodesLayer = document.getElementById("erd-nodes-layer");
  if (!nodesLayer) return;
  nodesLayer.innerHTML = "";

  if (!ERDState.erdData || ERDState.erdData.length === 0) {
    nodesLayer.innerHTML = /* html */ `
      <div class="p-6 text-soft">No tables found. Right click to add one.</div>
    `;
    return;
  }

  const savedPositions = loadSavedPositions();
  let startX = 50;
  let startY = 50;
  let maxRowHeight = 0;

  ERDState.erdData.forEach((schema) => {
    let x, y;
    if (savedPositions[schema.table]) {
      x = savedPositions[schema.table].x;
      y = savedPositions[schema.table].y;
    } else {
      x = startX;
      y = startY;
      startX += 320;
      if (startX > 1200) {
        startX = 50;
        startY += maxRowHeight + 50;
        maxRowHeight = 0;
      }
    }

    const node = createNodeElement(schema, x, y);
    if (ERDState.selectedTables.has(schema.table)) {
      node.classList.add("is-selected");
    }
    nodesLayer.appendChild(node);

    const estHeight = 40 + schema.columns.length * 40 + 40;
    if (estHeight > maxRowHeight) maxRowHeight = estHeight;
  });

  bindNodeEvents();

  setTimeout(() => {
    drawLines();
    renderMinimap();
  }, 10);
}

export function createNodeElement(schema, x, y) {
  const node = document.createElement("div");
  node.className = `erd-node ${schema.isDraft ? "is-draft" : ""}`;
  node.dataset.table = schema.table;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;

  let columnsHtml = schema.columns
    .map((col, index) => {
      let icon = "web_asset";
      let iconColor = "var(--color-text-soft)";
      if (col.isPk) {
        icon = "key";
        iconColor = "#f59e0b";
      } else if (col.fkTarget) {
        icon = "link";
        iconColor = "#3b82f6";
      }

      const isFkClass = col.fkTarget ? "is-fk" : "";
      const isDraftClass = col.isDraft ? "is-draft" : "";
      const typeStr = col.type.toUpperCase();

      return /* html */ `
      <div class="erd-column ${isFkClass} ${isDraftClass}" data-col="${col.name}" data-index="${index}">
        <div class="erd-col-left" class="flex-1 items-center gap-2">
           <span class="material-symbols-outlined erd-reorder-handle icon-16 cursor-grab" draggable="true" style="--dynamic-icon-color: ${iconColor}; color: var(--dynamic-icon-color);">${icon}</span>
           <span class="erd-col-name editable-field" data-field="name">${col.name}${col.nullable ? " ?" : ""}</span>
        </div>
        <div class="erd-col-right items-center gap-6px">
           <span class="erd-col-type editable-field" data-field="type">${typeStr}</span>
           ${
             (col.isDraft || schema.isDraft) && !col.isPk
               ? /* html */ `<div class="erd-drag-handle" title="Drag to create Foreign Key"></div>`
               : ""
           }
        </div>
      </div>
    `;
    })
    .join("");

  node.innerHTML = /* html */ `
    <div class="erd-node-header" title="${schema.isDraft ? "Double click to rename" : ""}">
      <span class="material-symbols-outlined" class="icon-16">table_chart</span>
      <span class="font-semibold" class="erd-node-name">${schema.table}</span>
    </div>
    <div class="erd-node-body">
      ${columnsHtml}
    </div>
    <div class="erd-add-col-btn">
      <span class="material-symbols-outlined" class="icon-16">add</span> Add Column
    </div>
  `;

  return node;
}

export function drawLines() {
  const svg = document.getElementById("erd-svg-layer");
  if (!svg) return;

  let pathsHtml = "";

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
          .getElementById("erd-workspace")
          .getBoundingClientRect();

        // SMART ROUTING LOGIC
        // Determine whether source is to the left or right of target
        let startX, startY, endX, endY;

        // If source right edge is to the left of target left edge (source is left of target)
        if (fromRect.right < toRect.left + 20) {
          startX = (fromRect.right - workspaceRect.left) / ERDState.zoom;
          endX = (toRect.left - workspaceRect.left) / ERDState.zoom;
        } else {
          // Source is right of target, go out the left side of source, into the right side of target
          startX = (fromRect.left - workspaceRect.left) / ERDState.zoom;
          endX = (toRect.right - workspaceRect.left) / ERDState.zoom;
        }

        startY =
          (fromRect.top + fromRect.height / 2 - workspaceRect.top) /
          ERDState.zoom;
        endY =
          (toRect.top + toRect.height / 2 - workspaceRect.top) / ERDState.zoom;

        const deltaX = Math.abs(endX - startX);
        const curveOffset = Math.max(deltaX * 0.5, 50);

        // Control points need to shoot outwards from the connection point
        const cp1x =
          startX < endX ? startX + curveOffset : startX - curveOffset;
        const cp1y = startY;
        const cp2x = startX < endX ? endX - curveOffset : endX + curveOffset;
        const cp2y = endY;

        const startMarker = "url(#crows-foot-zero-many)";
        const endMarker = col.nullable
          ? "url(#zero-or-one)"
          : "url(#one-and-only-one)";

        pathsHtml += /* html */ `
          <path 
            d="M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}" 
            fill="none" 
            stroke="var(--color-text)" 
            stroke-width="1.5" 
            opacity="0.8"
            marker-start="${startMarker}"
            marker-end="${endMarker}"
          />
        `;
      }
    });
  });

  svg.innerHTML = /* html */ `
    <defs>
      <!-- FK side: Zero or Many (0<) -->
      <marker id="crows-foot-zero-many" viewBox="0 0 16 10" refX="16" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
        <path d="M 16 0 L 8 5 M 16 10 L 8 5 M 16 5 L 8 5 M 4 5 L 0 5" fill="none" stroke="var(--color-text)" stroke-width="1.5" opacity="0.9" />
        <circle cx="5" cy="5" r="3" fill="var(--color-bg-primary)" stroke="var(--color-text)" stroke-width="1.5" opacity="0.9" />
      </marker>
      
      <!-- PK side: One and Only One (||) -->
      <marker id="one-and-only-one" viewBox="0 0 16 10" refX="13" refY="5" markerWidth="10" markerHeight="10" orient="auto">
        <path d="M 10 0 L 10 10 M 6 0 L 6 10" fill="none" stroke="var(--color-text)" stroke-width="1.5" opacity="0.9" />
      </marker>

      <!-- PK side: Zero or One (0|) -->
      <marker id="zero-or-one" viewBox="0 0 16 10" refX="13" refY="5" markerWidth="10" markerHeight="10" orient="auto">
        <path d="M 10 0 L 10 10" fill="none" stroke="var(--color-text)" stroke-width="1.5" opacity="0.9" />
        <circle cx="5" cy="5" r="3" fill="var(--color-bg-primary)" stroke="var(--color-text)" stroke-width="1.5" opacity="0.9" />
      </marker>
    </defs>
    ${pathsHtml}
  `;
}

export function renderMinimap() {
  const minimapContent = document.getElementById("erd-minimap-content");
  if (!minimapContent) return;

  minimapContent.innerHTML = "";

  const savedPositions = loadSavedPositions();

  const nodesLayer = document.getElementById("erd-nodes-layer");
  if (!nodesLayer) return;

  const nodes = Array.from(nodesLayer.querySelectorAll(".erd-node"));

  // Calculate scale factor. Workspace is fixed 4000x4000
  const mapW = 180;
  const mapH = 130;
  const dataW = 4000;
  const dataH = 4000;
  const scale = Math.min(mapW / dataW, mapH / dataH);

  const offsetX = (mapW - dataW * scale) / 2;
  const offsetY = (mapH - dataH * scale) / 2;

  nodes.forEach((node) => {
    const table = node.dataset.table;
    const pos = savedPositions[table] || { x: 0, y: 0 };
    const rect = node.getBoundingClientRect();
    const w = rect.width / ERDState.zoom;
    const h = rect.height / ERDState.zoom;

    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.left = `${offsetX + pos.x * scale}px`;
    div.style.top = `${offsetY + pos.y * scale}px`;
    div.style.width = `${w * scale}px`;
    div.style.height = `${h * scale}px`;
    div.style.backgroundColor = "var(--color-primary)";
    div.style.opacity = ERDState.selectedTables.has(table) ? "1" : "0.5";
    div.style.borderRadius = "2px";
    minimapContent.appendChild(div);
  });

  // Render Viewport
  const viewport = document.getElementById("erd-minimap-viewport");
  if (viewport) {
    const workspace = document.getElementById("erd-wrapper");
    const vW = workspace.clientWidth / ERDState.zoom;
    const vH = workspace.clientHeight / ERDState.zoom;
    const vLeft = workspace.scrollLeft / ERDState.zoom;
    const vTop = workspace.scrollTop / ERDState.zoom;

    viewport.style.left = `${offsetX + vLeft * scale}px`;
    viewport.style.top = `${offsetY + vTop * scale}px`;
    viewport.style.width = `${vW * scale}px`;
    viewport.style.height = `${vH * scale}px`;
  }
}
