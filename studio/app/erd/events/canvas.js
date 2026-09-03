import { ERDState } from '../state.js';
import { drawLines, renderNodes, renderMinimap } from '../render.js';
import { autoLayoutErd, saveErdDrafts } from '../core.js';
import { addNewDraftTable, loadErd } from '../view.js';
import { showContextMenu } from '../../../components/contextMenu.js';

let isBoxSelecting = false;
let boxSelectStart = { x: 0, y: 0 };
let selectionBoxElement = null;

export function bindCanvasEvents(wrapper) {
   // Dynamic Grid sync with zoom & scroll
   const updateGrid = () => {
      if (!wrapper) return;
      const size = 20 * ERDState.zoom;
      const dotSize = Math.max(1, 1.25 * ERDState.zoom);
      wrapper.style.backgroundSize = `${size}px ${size}px`;
      wrapper.style.backgroundImage = `radial-gradient(var(--color-border) ${dotSize}px, transparent ${dotSize}px)`;
      wrapper.style.backgroundPosition = `${-(wrapper.scrollLeft % size)}px ${-(wrapper.scrollTop % size)}px`;
   };

   wrapper.addEventListener('scroll', () => {
      renderMinimap();
      updateGrid();
   });

   // Panning & Box Selection
   wrapper.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
         e.preventDefault();
         ERDState.isPanning = true;
         ERDState.panStart.x = e.clientX;
         ERDState.panStart.y = e.clientY;
         ERDState.scrollStart.left = wrapper.scrollLeft;
         ERDState.scrollStart.top = wrapper.scrollTop;
         document.body.style.cursor = 'grabbing';
      } else if (
         e.button === 0 &&
         (e.target.id === 'erd-workspace' ||
            e.target.id === 'erd-svg-layer' ||
            e.target.id === 'erd-nodes-layer' ||
            e.target.id === 'erd-wrapper')
      ) {
         // Box Selection
         isBoxSelecting = true;
         boxSelectStart = { x: e.clientX, y: e.clientY };
         if (!e.ctrlKey && !e.metaKey) {
            ERDState.clearSelection();
            renderNodes();
         }

         selectionBoxElement = document.createElement('div');
         selectionBoxElement.style.position = 'fixed';
         selectionBoxElement.style.border = '1px solid var(--color-primary)';
         selectionBoxElement.style.backgroundColor = 'rgba(59, 130, 246, 0.12)';
         selectionBoxElement.style.borderRadius = '4px';
         selectionBoxElement.style.zIndex = '1000';
         selectionBoxElement.style.pointerEvents = 'none';
         document.body.appendChild(selectionBoxElement);
      }
   });

   const updateZoomDisplay = () => {
      const btnReset = document.getElementById('btn-erd-zoom-reset');
      if (btnReset)
         btnReset.textContent = Math.round(ERDState.zoom * 100) + '%';
   };

   const setZoom = (newZoom) => {
      ERDState.zoom = Math.max(0.2, Math.min(newZoom, 2.5));
      const workspace = document.getElementById('erd-workspace');
      if (workspace) {
         workspace.style.transform = `scale(${ERDState.zoom})`;
         drawLines();
         renderMinimap();
         updateZoomDisplay();
         updateGrid();
      }
   };

   // Zooming buttons
   const btnZoomIn = document.getElementById('btn-erd-zoom-in');
   if (btnZoomIn) btnZoomIn.onclick = () => setZoom(ERDState.zoom + 0.15);
   const btnZoomOut = document.getElementById('btn-erd-zoom-out');
   if (btnZoomOut) btnZoomOut.onclick = () => setZoom(ERDState.zoom - 0.15);
   const btnZoomReset = document.getElementById('btn-erd-zoom-reset');
   if (btnZoomReset) btnZoomReset.onclick = () => setZoom(1);

   // Fit to View
   const fitToView = () => {
      const nodes = document.querySelectorAll('.erd-node');
      if (!nodes || nodes.length === 0) return;

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

      if (minX === Infinity) return;

      const padding = 120;
      const contentW = maxX - minX + padding * 2;
      const contentH = maxY - minY + padding * 2;

      const viewW = wrapper.clientWidth;
      const viewH = wrapper.clientHeight;

      const scaleX = viewW / contentW;
      const scaleY = viewH / contentH;
      const targetZoom = Math.min(
         1.1,
         Math.max(0.35, Math.min(scaleX, scaleY)),
      );

      setZoom(targetZoom);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      wrapper.scrollLeft = centerX * targetZoom - viewW / 2;
      wrapper.scrollTop = centerY * targetZoom - viewH / 2;
      updateGrid();
   };

   const btnFitView = document.getElementById('btn-erd-fit-view');
   if (btnFitView) btnFitView.onclick = fitToView;

   // Minimap Toggle
   const toggleMinimapBtn = document.getElementById('btn-erd-toggle-minimap');
   const closeMinimapBtn = document.getElementById('btn-erd-close-minimap');
   const minimapContainer = document.getElementById('erd-minimap-container');

   const toggleMinimap = (forceState) => {
      if (!minimapContainer) return;
      const isCurrentlyHidden =
         minimapContainer.classList.contains('hidden') ||
         minimapContainer.style.display === 'none';
      const shouldShow =
         forceState !== undefined ? forceState : isCurrentlyHidden;

      if (!shouldShow) {
         minimapContainer.classList.add('hidden');
         minimapContainer.style.display = 'none';
         if (toggleMinimapBtn) toggleMinimapBtn.classList.remove('active');
      } else {
         minimapContainer.classList.remove('hidden');
         minimapContainer.style.display = 'block';
         if (toggleMinimapBtn) toggleMinimapBtn.classList.add('active');
         renderMinimap();
      }
   };

   if (toggleMinimapBtn) toggleMinimapBtn.onclick = () => toggleMinimap();
   if (closeMinimapBtn) {
      closeMinimapBtn.onclick = (e) => {
         e.stopPropagation();
         toggleMinimap(false);
      };
   }

   // Top HUD Actions
   const addTableBtn = document.getElementById('btn-erd-add-table');
   if (addTableBtn) {
      addTableBtn.onclick = () => {
         const vLeft = wrapper.scrollLeft / ERDState.zoom;
         const vTop = wrapper.scrollTop / ERDState.zoom;
         const vW = wrapper.clientWidth / ERDState.zoom;
         const vH = wrapper.clientHeight / ERDState.zoom;
         addNewDraftTable(
            Math.max(60, vLeft + vW / 2 - 150),
            Math.max(60, vTop + vH / 2 - 100),
         );
         window.showToast('Created new table draft', 'success');
      };
   }

   const autoLayoutBtn = document.getElementById('btn-erd-auto-layout');
   if (autoLayoutBtn) {
      autoLayoutBtn.onclick = () => {
         ERDState.pushUndoState();
         autoLayoutErd(ERDState.erdData);
         renderNodes();
         setTimeout(fitToView, 50);
         window.showToast('Auto Layout Applied', 'success');
      };
   }

   const snapGridBtn = document.getElementById('btn-erd-snap-grid');
   if (snapGridBtn) {
      snapGridBtn.onclick = () => {
         ERDState.snapToGrid = !ERDState.snapToGrid;
         if (ERDState.snapToGrid) {
            snapGridBtn.classList.add('active');
            window.showToast('Grid Snapping: ON (20px)', 'info');
         } else {
            snapGridBtn.classList.remove('active');
            window.showToast('Grid Snapping: OFF (Free)', 'info');
         }
      };
   }

   const saveDraftsBtn = document.getElementById('btn-erd-save-drafts');
   if (saveDraftsBtn) {
      saveDraftsBtn.onclick = async () => {
         const success = await saveErdDrafts(ERDState.erdData);
         if (success) {
            window.showToast('ERD Schema saved successfully!', 'success');
            loadErd(document.getElementById('main-content'));
         }
      };
   }

   // Zooming via scroll
   wrapper.addEventListener(
      'wheel',
      (e) => {
         if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            setZoom(ERDState.zoom - e.deltaY * zoomSensitivity);
         }
      },
      { passive: false },
   );

   document.addEventListener('mousemove', (e) => {
      if (isBoxSelecting && selectionBoxElement) {
         const minX = Math.min(e.clientX, boxSelectStart.x);
         const minY = Math.min(e.clientY, boxSelectStart.y);
         const width = Math.abs(e.clientX - boxSelectStart.x);
         const height = Math.abs(e.clientY - boxSelectStart.y);

         selectionBoxElement.style.left = minX + 'px';
         selectionBoxElement.style.top = minY + 'px';
         selectionBoxElement.style.width = width + 'px';
         selectionBoxElement.style.height = height + 'px';
         return;
      }

      if (ERDState.isPanning) {
         if (wrapper) {
            const dx = e.clientX - ERDState.panStart.x;
            const dy = e.clientY - ERDState.panStart.y;
            wrapper.scrollLeft = ERDState.scrollStart.left - dx;
            wrapper.scrollTop = ERDState.scrollStart.top - dy;
            updateGrid();
         }
         return;
      }
   });

   document.addEventListener('mouseup', (e) => {
      if (isBoxSelecting) {
         isBoxSelecting = false;
         if (selectionBoxElement) {
            const boxRect = selectionBoxElement.getBoundingClientRect();
            selectionBoxElement.remove();
            selectionBoxElement = null;

            const nodes = document.querySelectorAll('.erd-node');
            let selectionChanged = false;
            nodes.forEach((node) => {
               const nodeRect = node.getBoundingClientRect();
               if (
                  !(
                     boxRect.right < nodeRect.left ||
                     boxRect.left > nodeRect.right ||
                     boxRect.bottom < nodeRect.top ||
                     boxRect.top > nodeRect.bottom
                  )
               ) {
                  ERDState.selectedTables.add(node.dataset.table);
                  selectionChanged = true;
               }
            });
            if (selectionChanged) renderNodes();
         }
      }

      if (ERDState.isPanning) {
         ERDState.isPanning = false;
         document.body.style.cursor = '';
      }
   });

   // Workspace Context Menu
   wrapper.addEventListener('contextmenu', (e) => {
      if (
         e.target.id === 'erd-workspace' ||
         e.target.id === 'erd-svg-layer' ||
         e.target.id === 'erd-nodes-layer' ||
         e.target.id === 'erd-wrapper'
      ) {
         e.preventDefault();
         e.stopPropagation();
         showContextMenu(e, [
            {
               label: 'Add Table',
               icon: 'add_box',
               action: () => {
                  if (addTableBtn) addTableBtn.click();
               },
            },
            'divider',
            {
               label: 'Auto Layout',
               icon: 'account_tree',
               action: () => {
                  if (autoLayoutBtn) autoLayoutBtn.click();
               },
            },
         ]);
      }
   });

   // Search Logic
   const searchInput = document.getElementById('erd-search-input');
   const searchResults = document.getElementById('erd-search-results');
   if (searchInput && searchResults) {
      searchInput.addEventListener('input', (e) => {
         const query = e.target.value.toLowerCase().trim();
         searchResults.innerHTML = '';
         if (!query) {
            searchResults.classList.add('hidden');
            return;
         }

         const matches = ERDState.erdData.filter((t) =>
            t.table.toLowerCase().includes(query),
         );
         if (matches.length === 0) {
            searchResults.innerHTML = `<div class="erd-search-item" style="color: var(--color-text-soft);">No tables found</div>`;
            searchResults.classList.remove('hidden');
            return;
         }

         matches.forEach((m) => {
            const div = document.createElement('div');
            div.className = 'erd-search-item';
            div.innerHTML = `
          <span class="material-symbols-outlined icon-16" style="color: var(--color-primary);">table_chart</span>
          <span>${m.table}</span>
          <span class="erd-search-col-badge">${m.columns.length} cols</span>
        `;
            div.onclick = () => {
               ERDState.setSelection(m.table);
               const node = document.querySelector(
                  `.erd-node[data-table="${m.table}"]`,
               );
               if (node) {
                  const rect = node.getBoundingClientRect();
                  const wrapperRect = wrapper.getBoundingClientRect();
                  const x = parseFloat(node.style.left);
                  const y = parseFloat(node.style.top);

                  wrapper.scrollLeft =
                     x * ERDState.zoom - wrapperRect.width / 2 + rect.width / 2;
                  wrapper.scrollTop =
                     y * ERDState.zoom -
                     wrapperRect.height / 2 +
                     rect.height / 2;
                  updateGrid();
               }
               renderNodes();
               searchResults.classList.add('hidden');
               searchInput.value = '';
            };
            searchResults.appendChild(div);
         });
         searchResults.classList.remove('hidden');
      });

      document.addEventListener('click', (e) => {
         if (
            !searchInput.contains(e.target) &&
            !searchResults.contains(e.target)
         ) {
            searchResults.classList.add('hidden');
         }
      });

      const shortcutBadge = document.querySelector('.erd-search-shortcut');
      if (shortcutBadge) {
         shortcutBadge.onclick = () => searchInput.focus();
         shortcutBadge.style.cursor = 'pointer';
      }
   }

   // Path hover interaction
   wrapper.addEventListener('mouseover', (e) => {
      const path = e.target.closest('.erd-relationship-path');
      if (path) {
         path.classList.add('is-hovered');
         const fromTable = path.dataset.fromTable;
         const toTable = path.dataset.toTable;
         document
            .querySelector(`.erd-node[data-table="${fromTable}"]`)
            ?.classList.add('is-relationship-highlight');
         document
            .querySelector(`.erd-node[data-table="${toTable}"]`)
            ?.classList.add('is-relationship-highlight');
         return;
      }

      const fkCol = e.target.closest('.erd-column.is-fk');
      if (fkCol) {
         const tableNode = fkCol.closest('.erd-node');
         const colName = fkCol.dataset.col;
         if (tableNode) {
            const matchingPath = document.querySelector(
               `.erd-relationship-path[data-from-table="${tableNode.dataset.table}"][data-from-col="${colName}"]`,
            );
            if (matchingPath) matchingPath.classList.add('is-hovered');
         }
      }
   });

   wrapper.addEventListener('mouseout', (e) => {
      const path = e.target.closest('.erd-relationship-path');
      if (path) {
         path.classList.remove('is-hovered');
         document
            .querySelectorAll('.erd-node.is-relationship-highlight')
            .forEach((n) => n.classList.remove('is-relationship-highlight'));
         return;
      }

      const fkCol = e.target.closest('.erd-column.is-fk');
      if (fkCol) {
         document
            .querySelectorAll('.erd-relationship-path.is-hovered')
            .forEach((p) => p.classList.remove('is-hovered'));
      }
   });

   // Initial grid setup
   updateGrid();
}
