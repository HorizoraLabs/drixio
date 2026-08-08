import { ERDState } from "../state.js";
import { drawLines, renderNodes, renderMinimap } from "../render.js";
import { autoLayoutErd } from "../core.js";
import { showContextMenu } from "../../../components/contextMenu.js";

let isBoxSelecting = false;
let boxSelectStart = { x: 0, y: 0 };
let selectionBoxElement = null;

export function bindCanvasEvents(wrapper) {
  wrapper.addEventListener("scroll", () => {
     renderMinimap();
  });

  // Panning & Box Selection
  wrapper.addEventListener("mousedown", (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      ERDState.isPanning = true;
      ERDState.panStart.x = e.clientX;
      ERDState.panStart.y = e.clientY;
      ERDState.scrollStart.left = wrapper.scrollLeft;
      ERDState.scrollStart.top = wrapper.scrollTop;
      document.body.style.cursor = "grabbing";
    } else if (e.button === 0 && (e.target.id === "erd-workspace" || e.target.id === "erd-svg-layer" || e.target.id === "erd-nodes-layer")) {
      // Box Selection
      isBoxSelecting = true;
      boxSelectStart = { x: e.clientX, y: e.clientY };
      if (!e.ctrlKey && !e.metaKey) {
         ERDState.clearSelection();
         renderNodes();
      }
      
      selectionBoxElement = document.createElement("div");
      selectionBoxElement.style.position = "fixed";
      selectionBoxElement.style.border = "1px solid #3b82f6";
      selectionBoxElement.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
      selectionBoxElement.style.zIndex = "1000";
      selectionBoxElement.style.pointerEvents = "none";
      document.body.appendChild(selectionBoxElement);
    }
  });

  const updateZoomDisplay = () => {
    const btnReset = document.getElementById("btn-erd-zoom-reset");
    if (btnReset) btnReset.textContent = Math.round(ERDState.zoom * 100) + "%";
  };

  const setZoom = (newZoom) => {
    ERDState.zoom = Math.max(0.2, Math.min(newZoom, 3)); 
    const workspace = document.getElementById("erd-workspace");
    if (workspace) {
      workspace.style.transform = `scale(${ERDState.zoom})`;
      drawLines();
      renderMinimap();
      updateZoomDisplay();
    }
  };

  // Zooming buttons
  const btnZoomIn = document.getElementById("btn-erd-zoom-in");
  if (btnZoomIn) btnZoomIn.addEventListener("click", () => setZoom(ERDState.zoom + 0.1));
  const btnZoomOut = document.getElementById("btn-erd-zoom-out");
  if (btnZoomOut) btnZoomOut.addEventListener("click", () => setZoom(ERDState.zoom - 0.1));
  const btnZoomReset = document.getElementById("btn-erd-zoom-reset");
  if (btnZoomReset) btnZoomReset.addEventListener("click", () => setZoom(1));

  // Zooming via scroll
  wrapper.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      setZoom(ERDState.zoom - e.deltaY * zoomSensitivity);
    }
  }, { passive: false });

  document.addEventListener("mousemove", (e) => {
    if (isBoxSelecting && selectionBoxElement) {
      const minX = Math.min(e.clientX, boxSelectStart.x);
      const minY = Math.min(e.clientY, boxSelectStart.y);
      const width = Math.abs(e.clientX - boxSelectStart.x);
      const height = Math.abs(e.clientY - boxSelectStart.y);
      
      selectionBoxElement.style.left = minX + "px";
      selectionBoxElement.style.top = minY + "px";
      selectionBoxElement.style.width = width + "px";
      selectionBoxElement.style.height = height + "px";
      return;
    }

    if (ERDState.isPanning) {
      if (wrapper) {
        const dx = e.clientX - ERDState.panStart.x;
        const dy = e.clientY - ERDState.panStart.y;
        wrapper.scrollLeft = ERDState.scrollStart.left - dx;
        wrapper.scrollTop = ERDState.scrollStart.top - dy;
      }
      return;
    }
  });

  document.addEventListener("mouseup", (e) => {
    if (isBoxSelecting) {
      isBoxSelecting = false;
      if (selectionBoxElement) {
        const boxRect = selectionBoxElement.getBoundingClientRect();
        selectionBoxElement.remove();
        selectionBoxElement = null;
        
        const nodes = document.querySelectorAll(".erd-node");
        let selectionChanged = false;
        nodes.forEach(node => {
           const nodeRect = node.getBoundingClientRect();
           if (!(boxRect.right < nodeRect.left || boxRect.left > nodeRect.right || boxRect.bottom < nodeRect.top || boxRect.top > nodeRect.bottom)) {
               ERDState.selectedTables.add(node.dataset.table);
               selectionChanged = true;
           }
        });
        if (selectionChanged) renderNodes();
      }
    }

    if (ERDState.isPanning) {
      ERDState.isPanning = false;
      document.body.style.cursor = "";
    }
  });

  // Workspace Context Menu
  wrapper.addEventListener("contextmenu", (e) => {
    // Only show if clicking on the empty workspace
    if (e.target.id === "erd-workspace" || e.target.id === "erd-svg-layer" || e.target.id === "erd-nodes-layer" || e.target.id === "erd-wrapper") {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e, [
        {
          label: 'Add Table',
          icon: 'add_box',
          action: () => {
             // Trigger global Add Table (simulate click on top nav if exists)
             const btn = document.getElementById("btn-add-table");
             if (btn) btn.click();
          }
        },
        'divider',
        {
          label: 'Auto Layout',
          icon: 'account_tree',
          action: () => {
            ERDState.pushUndoState();
            autoLayoutErd(ERDState.erdData);
            renderNodes();
            window.showToast("Auto Layout Applied", "success");
          }
        }
      ]);
    }
  });

  // Search Logic
  const searchInput = document.getElementById("erd-search-input");
  const searchResults = document.getElementById("erd-search-results");
  if (searchInput && searchResults) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      searchResults.innerHTML = "";
      if (!query) {
        searchResults.style.display = "none";
        return;
      }

      const matches = ERDState.erdData.filter(t => t.table.toLowerCase().includes(query));
      if (matches.length === 0) {
         searchResults.innerHTML = `<div class="erd-search-item" style="color: var(--color-text-soft);">No results</div>`;
         searchResults.style.display = "block";
         return;
      }

      matches.forEach(m => {
         const div = document.createElement("div");
         div.className = "erd-search-item";
         div.textContent = m.table;
         div.onclick = () => {
            // Center view on this table
            ERDState.setSelection(m.table);
            const node = document.querySelector(`.erd-node[data-table="${m.table}"]`);
            if (node) {
               const rect = node.getBoundingClientRect();
               const wrapperRect = wrapper.getBoundingClientRect();
               const x = parseFloat(node.style.left);
               const y = parseFloat(node.style.top);
               
               wrapper.scrollLeft = (x * ERDState.zoom) - (wrapperRect.width / 2) + (rect.width / 2);
               wrapper.scrollTop = (y * ERDState.zoom) - (wrapperRect.height / 2) + (rect.height / 2);
            }
            renderNodes();
            searchResults.style.display = "none";
            searchInput.value = "";
         };
         searchResults.appendChild(div);
      });
      searchResults.style.display = "block";
    });

    // Hide search results when clicking outside
    document.addEventListener("click", (e) => {
       if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
          searchResults.style.display = "none";
       }
    });
  }
}
