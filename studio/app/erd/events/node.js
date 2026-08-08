import { ERDState } from "../state.js";
import { loadSavedPositions, savePositions } from "../core.js";
import { renderNodes, drawLines, renderMinimap } from "../render.js";
import { showContextMenu } from "../../../components/contextMenu.js";
import { handleCopy, handleDelete } from "./keyboard.js";

export function bindNodeEvents() {
  const workspace = document.getElementById("erd-workspace");
  const nodes = document.querySelectorAll(".erd-node");

  nodes.forEach((node) => {
    const schema = ERDState.erdData.find(s => s.table === node.dataset.table);
    if (!schema) return;

    // --- Selection & Drag Node ---
    const header = node.querySelector(".erd-node-header");
    header.addEventListener("mousedown", (e) => {
      if (e.button === 1 || e.target.tagName === "INPUT") return;
      
      if (!ERDState.selectedTables.has(schema.table)) {
        if (!e.ctrlKey && !e.metaKey) ERDState.clearSelection();
        ERDState.selectedTables.add(schema.table);
        // Update DOM classes manually to avoid re-rendering and detaching the dragged node
        document.querySelectorAll(".erd-node").forEach(n => {
           if (ERDState.selectedTables.has(n.dataset.table)) n.classList.add("is-selected");
           else n.classList.remove("is-selected");
        });
      } else if (e.ctrlKey || e.metaKey) {
        ERDState.selectedTables.delete(schema.table);
        node.classList.remove("is-selected");
        return; // Don't drag if deselecting
      }
      
      ERDState.draggingNode = node;
      const workspaceRect = workspace.getBoundingClientRect();
      
      ERDState.dragStartMouse = { x: e.clientX, y: e.clientY };
      ERDState.draggedNodesStart = [];
      
      ERDState.selectedTables.forEach(tName => {
         const n = document.querySelector(`.erd-node[data-table="${tName}"]`);
         if (n) {
             const nRect = n.getBoundingClientRect();
             ERDState.draggedNodesStart.push({
                 node: n,
                 startX: (nRect.left - workspaceRect.left) / ERDState.zoom,
                 startY: (nRect.top - workspaceRect.top) / ERDState.zoom
             });
             n.style.zIndex = "10";
         }
      });

      document.body.style.cursor = "grabbing";
    });

    node.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ERDState.selectedTables.has(schema.table)) {
         ERDState.setSelection(schema.table);
         document.querySelectorAll(".erd-node").forEach(n => {
            if (ERDState.selectedTables.has(n.dataset.table)) n.classList.add("is-selected");
            else n.classList.remove("is-selected");
         });
      }
      
      showContextMenu(e, [
        {
          label: 'Copy',
          icon: 'content_copy',
          action: handleCopy
        },
        {
          label: 'Cut',
          icon: 'content_cut',
          action: () => {
            handleCopy();
            handleDelete();
          }
        },
        'divider',
        {
          label: 'Delete',
          icon: 'delete',
          danger: true,
          action: handleDelete
        }
      ]);
    });

    // --- Add Column ---
    const addColBtn = node.querySelector(".erd-add-col-btn");
    addColBtn.addEventListener("click", () => {
      ERDState.pushUndoState();
      schema.columns.push({
        name: `new_col_${schema.columns.length}`,
        type: "TEXT",
        isDraft: true,
        nullable: true
      });
      renderNodes();
    });

    // --- Inline Edit Table Name ---
    if (schema.isDraft) {
      const nameSpan = header.querySelector(".erd-node-name");
      header.addEventListener("dblclick", (e) => {
        if (e.target.tagName === "INPUT") return;
        e.stopPropagation();
        const input = document.createElement("input");
        input.value = schema.table;
        input.className = "erd-inline-input";
        nameSpan.replaceWith(input);
        input.focus();

        const commit = () => {
          const oldName = schema.table;
          const newName = input.value.trim() || oldName;
          if (oldName !== newName) {
             ERDState.pushUndoState();
             schema.table = newName;
             
             const positions = loadSavedPositions();
             if (positions[oldName]) {
                 positions[newName] = positions[oldName];
                 delete positions[oldName];
                 savePositions(positions);
             }

             // Update references
             ERDState.erdData.forEach(s => {
                s.columns.forEach(c => {
                   if (c.fkTarget && c.fkTarget.table === oldName) {
                      c.fkTarget.table = newName;
                   }
                });
             });

             // Update selection if needed
             if (ERDState.selectedTables.has(oldName)) {
               ERDState.selectedTables.delete(oldName);
               ERDState.selectedTables.add(newName);
             }
          }
          renderNodes(); 
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") input.blur();
        });
      });
    } else {
      // Existing table: double click goes to schema view
      header.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        window.AppState.currentTable = node.dataset.table;
        
        const sidebarBtn = document.querySelector(`.table-btn[data-table="${node.dataset.table}"]`);
        if (sidebarBtn) {
           window.AppState.currentTableBtnElement = sidebarBtn;
           document.querySelectorAll(".table-btn").forEach(b => b.classList.remove("active"));
           sidebarBtn.classList.add("active");
        }
        
        if (window.handleSwitchTab) {
           window.handleSwitchTab("schema-btn");
        } else if (window.renderCurrentView) {
           window.AppState.currentTab = "schema-btn";
           window.renderCurrentView();
        }
      });
    }

    // --- Inline Edit Columns ---
    const cols = node.querySelectorAll(".erd-column");
    cols.forEach((colEl) => {
      const colIndex = parseInt(colEl.dataset.index);
      const colData = schema.columns[colIndex];
      
      colEl.addEventListener("contextmenu", (e) => {
          if (colData.isPk || (!colData.isDraft && !schema.isDraft)) return;
          e.preventDefault();
          e.stopPropagation();

          showContextMenu(e, [
            {
              label: 'Delete Column',
              icon: 'delete',
              danger: true,
              action: () => {
                ERDState.pushUndoState();
                
                // Remove any foreign keys pointing to this column before deleting it
                ERDState.erdData.forEach(s => {
                   s.columns.forEach(c => {
                      if (c.fkTarget && c.fkTarget.table === schema.table && c.fkTarget.column === colData.name) {
                         delete c.fkTarget;
                      }
                   });
                });
                
                schema.columns.splice(colIndex, 1);
                renderNodes();
              }
            }
          ]);
      });
      
      if (!colData.isDraft && !schema.isDraft) return; // Only edit drafts

      const editables = colEl.querySelectorAll(".editable-field");
      editables.forEach(el => {
        el.addEventListener("dblclick", (e) => {
          if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
          e.stopPropagation();
          const field = el.dataset.field;
          let input;
          if (field === 'type') {
            input = document.createElement("select");
            input.className = "erd-inline-input";
            const types = ["INTEGER", "TEXT", "REAL", "BLOB", "BOOLEAN", "DATE", "DATETIME"];
            types.forEach(t => {
               const opt = document.createElement("option");
               opt.value = t;
               opt.textContent = t;
               if (colData.type.toUpperCase() === t) opt.selected = true;
               input.appendChild(opt);
            });
            // Support custom types not in list
            if (!types.includes(colData.type.toUpperCase())) {
               const opt = document.createElement("option");
               opt.value = colData.type;
               opt.textContent = colData.type;
               opt.selected = true;
               input.appendChild(opt);
            }
            input.addEventListener("change", () => {
              input.blur();
            });
          } else {
            input = document.createElement("input");
            input.value = field === 'name' && colData.nullable ? colData.name + " ?" : colData[field];
            input.className = "erd-inline-input";
          }
          
          el.replaceWith(input);
          input.focus();

          const commit = () => {
            const oldName = colData[field];
            let newValue = field === 'type' ? input.value.toUpperCase() : input.value;
            newValue = newValue.trim() || oldName;
            
            if (oldName === newValue && !newValue.endsWith('?') && !newValue.endsWith('!')) {
               renderNodes();
               return;
            }
            
            ERDState.pushUndoState();
            
            if (field === 'name') {
              if (newValue.endsWith('?')) {
                colData.nullable = true;
                newValue = newValue.slice(0, -1).trim();
              } else {
                colData.nullable = false;
                if (newValue.endsWith('!')) {
                   newValue = newValue.slice(0, -1).trim();
                }
              }
            }
            
            if (field === 'name' && colData.isPk && oldName !== newValue) {
               ERDState.erdData.forEach(s => {
                  s.columns.forEach(c => {
                     if (c.fkTarget && c.fkTarget.table === schema.table && c.fkTarget.column === oldName) {
                        c.fkTarget.column = newValue;
                     }
                  });
               });
            }
            colData[field] = newValue;
            renderNodes();
          };
          input.addEventListener("blur", commit);
            input.addEventListener("keydown", (ev) => {
              if (ev.key === "Enter") input.blur();
            });
          });
        });

      // --- FK Drag Handle ---
      const dragHandle = colEl.querySelector(".erd-drag-handle");
      if (dragHandle) {
        dragHandle.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          ERDState.drawingFkStartCol = { table: schema.table, col: colData.name, colIndex: colIndex };
          const rect = dragHandle.getBoundingClientRect();
          const workspaceRect = workspace.getBoundingClientRect();
          ERDState.drawingFkStartCoords = {
            x: (rect.right - workspaceRect.left) / ERDState.zoom,
            y: (rect.top + rect.height/2 - workspaceRect.top) / ERDState.zoom
          };
        });
      }
    });

    // --- Column Reordering ---
    const handles = node.querySelectorAll(".erd-reorder-handle");
    handles.forEach(handle => {
      handle.addEventListener("dragstart", (e) => {
        const colEl = handle.closest(".erd-column");
        ERDState.draggingColInfo = {
          table: schema.table,
          colIndex: parseInt(colEl.dataset.index)
        };
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", schema.table);
      });
    });

    cols.forEach(colEl => {
      colEl.addEventListener("dragover", (e) => {
        if (!ERDState.draggingColInfo || ERDState.draggingColInfo.table !== schema.table) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      colEl.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!ERDState.draggingColInfo || ERDState.draggingColInfo.table !== schema.table) return;
        
        const fromIndex = ERDState.draggingColInfo.colIndex;
        const toIndex = parseInt(colEl.dataset.index);
        
        if (fromIndex !== toIndex) {
          ERDState.pushUndoState();
          const [movedCol] = schema.columns.splice(fromIndex, 1);
          schema.columns.splice(toIndex, 0, movedCol);
          renderNodes();
        }
        ERDState.draggingColInfo = null;
      });
    });
  });
}

// Global interactions related to nodes (drawing lines, moving nodes)
let _nodeGlobalsBound = false;
export function bindNodeGlobalEvents() {
  if (_nodeGlobalsBound) return;
  _nodeGlobalsBound = true;

  document.addEventListener("mousemove", (e) => {
    if (ERDState.drawingFkStartCol) {
      const workspace = document.getElementById("erd-workspace");
      if (!workspace) return;
      const workspaceRect = workspace.getBoundingClientRect();
      const curX = (e.clientX - workspaceRect.left) / ERDState.zoom;
      const curY = (e.clientY - workspaceRect.top) / ERDState.zoom;
      
      let tempPath = document.getElementById("erd-temp-path");
      const svgLayer = document.getElementById("erd-svg-layer");
      if (!tempPath) {
         tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
         tempPath.id = "erd-temp-path";
         tempPath.setAttribute("fill", "none");
         tempPath.setAttribute("stroke", "var(--color-primary)");
         tempPath.setAttribute("stroke-width", "2");
         tempPath.setAttribute("stroke-dasharray", "5,5");
         if (svgLayer) svgLayer.appendChild(tempPath);
      }
      if (tempPath) tempPath.setAttribute("d", `M ${ERDState.drawingFkStartCoords.x} ${ERDState.drawingFkStartCoords.y} L ${curX} ${curY}`);
      return;
    }

    if (!ERDState.draggingNode) return;
    const dx = (e.clientX - ERDState.dragStartMouse.x) / ERDState.zoom;
    const dy = (e.clientY - ERDState.dragStartMouse.y) / ERDState.zoom;
    
    ERDState.draggedNodesStart.forEach(info => {
       let newX = info.startX + dx;
       let newY = info.startY + dy;
       if (newX < 0) newX = 0;
       if (newY < 0) newY = 0;
       if (ERDState.snapToGrid) {
          newX = Math.round(newX / 20) * 20;
          newY = Math.round(newY / 20) * 20;
       }
       info.node.style.left = `${newX}px`;
       info.node.style.top = `${newY}px`;
    });
    
    drawLines();
  });

  document.addEventListener("mouseup", (e) => {
    if (ERDState.drawingFkStartCol) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const targetNode = target ? target.closest(".erd-node") : null;
      if (targetNode) {
         const targetTable = targetNode.dataset.table;
         if (targetTable !== ERDState.drawingFkStartCol.table) {
            const targetSchema = ERDState.erdData.find(s => s.table === targetTable);
            const pkCol = targetSchema.columns.find(c => c.isPk);
            if (pkCol) {
               const isNullable = confirm(`Create Foreign Key to ${targetTable}?\n\nClick OK for Nullable (0..N)\nClick Cancel for Not Nullable (1..N)`);
               
               ERDState.pushUndoState();
               const sourceSchema = ERDState.erdData.find(s => s.table === ERDState.drawingFkStartCol.table);
               const sourceCol = sourceSchema.columns[ERDState.drawingFkStartCol.colIndex];
               sourceCol.fkTarget = { table: targetTable, column: pkCol.name };
               sourceCol.nullable = isNullable;
               
               // Move FK to bottom automatically on creation
               sourceSchema.columns.splice(ERDState.drawingFkStartCol.colIndex, 1);
               sourceSchema.columns.push(sourceCol);
               
               renderNodes();
            } else {
               window.showToast("Target table has no Primary Key!", "error");
            }
         }
      } else {
         // Dropped on empty space - remove FK
         const sourceSchema = ERDState.erdData.find(s => s.table === ERDState.drawingFkStartCol.table);
         const sourceCol = sourceSchema.columns[ERDState.drawingFkStartCol.colIndex];
         if (sourceCol.fkTarget) {
            ERDState.pushUndoState();
            delete sourceCol.fkTarget;
            renderNodes();
         }
      }
      const tempPath = document.getElementById("erd-temp-path");
      if (tempPath) tempPath.remove();
      ERDState.drawingFkStartCol = null;
    }

    if (ERDState.draggingNode) {
      document.body.style.cursor = "";
      const positions = loadSavedPositions();
      
      ERDState.draggedNodesStart.forEach(info => {
        info.node.style.zIndex = "";
        positions[info.node.dataset.table] = {
           x: parseFloat(info.node.style.left),
           y: parseFloat(info.node.style.top),
        };
      });
      
      savePositions(positions);
      renderMinimap();

      ERDState.draggingNode = null;
      ERDState.draggedNodesStart = [];
    }
  });
}
