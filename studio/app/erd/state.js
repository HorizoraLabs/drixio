export const ERDState = {
  erdData: [],
  undoStack: [],
  
  // Selection & UI State
  selectedTables: new Set(),
  clipboard: [],
  
  // Dragging / Panning State
  draggingNode: null,
  draggingColInfo: null,
  draggedNodesStart: [],
  dragStartMouse: { x: 0, y: 0 },
  targetColForDelete: null,
  zoom: 1,
  isPanning: false,
  panStart: { x: 0, y: 0 },
  scrollStart: { left: 0, top: 0 },
  drawingFkStartCol: null,
  drawingFkStartCoords: null,
  
  // Context Menu State
  contextMenuPos: { x: 0, y: 0 },

  // Settings
  snapToGrid: true,

  pushUndoState() {
    this.undoStack.push(JSON.parse(JSON.stringify(this.erdData)));
    if (this.undoStack.length > 50) this.undoStack.shift();
  },

  undo() {
    if (this.undoStack.length > 0) {
      this.erdData = this.undoStack.pop();
      return true;
    }
    return false;
  },

  clearSelection() {
    this.selectedTables.clear();
  },

  toggleSelection(tableName) {
    if (this.selectedTables.has(tableName)) {
      this.selectedTables.delete(tableName);
    } else {
      this.selectedTables.add(tableName);
    }
  },

  setSelection(tableName) {
    this.selectedTables.clear();
    this.selectedTables.add(tableName);
  }
};
