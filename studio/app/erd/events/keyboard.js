import { ERDState } from "../state.js";
import { saveErdDrafts, loadSavedPositions, savePositions } from "../core.js";
import { renderNodes, renderMinimap } from "../render.js";
import { loadErd } from "../view.js";

export function handleCopy() {
  if (ERDState.selectedTables.size === 0) return;
  const toCopy = [];
  ERDState.selectedTables.forEach(tableName => {
    const schema = ERDState.erdData.find(s => s.table === tableName);
    if (schema) {
      // Deep clone, then strip out FKs
      const clone = JSON.parse(JSON.stringify(schema));
      clone.columns.forEach(c => {
         if (c.fkTarget) delete c.fkTarget;
      });
      toCopy.push(clone);
    }
  });
  ERDState.clipboard = toCopy;
  window.showToast(`Copied ${toCopy.length} table(s)`, "success");
}

export function handleDelete() {
  if (ERDState.selectedTables.size === 0) return;
  ERDState.pushUndoState();
  
  // Remove FKs pointing to these tables
  ERDState.erdData.forEach(schema => {
    schema.columns.forEach(col => {
       if (col.fkTarget && ERDState.selectedTables.has(col.fkTarget.table)) {
          delete col.fkTarget;
       }
    });
  });

  // Remove the tables
  ERDState.erdData = ERDState.erdData.filter(schema => !ERDState.selectedTables.has(schema.table));
  
  ERDState.clearSelection();
  renderNodes();
  window.showToast("Deleted selected table(s)", "success");
}

export function handlePaste() {
  if (!ERDState.clipboard || ERDState.clipboard.length === 0) return;
  ERDState.pushUndoState();
  ERDState.clearSelection();

  const savedPositions = loadSavedPositions();
  
  ERDState.clipboard.forEach((schemaObj, index) => {
    const clone = JSON.parse(JSON.stringify(schemaObj));
    // Make name unique
    let copySuffix = "_copy";
    let newName = clone.table + copySuffix;
    let attempt = 1;
    while(ERDState.erdData.some(s => s.table === newName)) {
      attempt++;
      newName = clone.table + copySuffix + attempt;
    }
    clone.table = newName;
    clone.isDraft = true;
    clone.columns.forEach(c => c.isDraft = true);
    
    // Offset position for paste
    if (savedPositions[schemaObj.table]) {
       savedPositions[newName] = {
          x: savedPositions[schemaObj.table].x + 40 + (index * 20),
          y: savedPositions[schemaObj.table].y + 40 + (index * 20)
       };
    } else {
       savedPositions[newName] = { x: 100 + index*20, y: 100 + index*20 };
    }

    ERDState.erdData.push(clone);
    ERDState.selectedTables.add(newName);
  });
  
  savePositions(savedPositions);
  renderNodes();
  window.showToast(`Pasted ${ERDState.clipboard.length} table(s)`, "success");
}

export function bindKeyboardEvents() {
  // Global Save, Undo & Clipboard Shortcuts
  document.addEventListener("keydown", async (e) => {
    // Only handle if ERD is active tab
    if (window.AppState && window.AppState.currentTab !== "erd-btn") return;
    
    // Ignore if input is focused
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      const success = await saveErdDrafts(ERDState.erdData);
      if (success) {
        window.showToast("ERD Schema saved successfully!", "success");
        loadErd(document.getElementById("main-content")); // Reload from DB
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      if (ERDState.undo()) {
        renderNodes();
        window.showToast("Undid last action", "success");
      } else {
        window.showToast("Nothing to undo", "info");
      }
    }

    if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      handleCopy();
    }
    if (e.ctrlKey && e.key === "v") {
      e.preventDefault();
      handlePaste();
    }
    if (e.key === "Delete") {
      e.preventDefault();
      handleDelete();
    }
  });
}
