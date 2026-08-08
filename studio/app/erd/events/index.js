import { bindNodeEvents, bindNodeGlobalEvents } from "./node.js";
import { bindCanvasEvents } from "./canvas.js";
import { bindMinimapEvents } from "./minimap.js";
import { bindKeyboardEvents, handleCopy, handlePaste, handleDelete } from "./keyboard.js";

let _eventsBound = false;

export { bindNodeEvents, handleCopy, handlePaste, handleDelete };

export function bindGlobalEvents() {
  if (_eventsBound) return;
  const wrapper = document.getElementById("erd-wrapper");
  if (!wrapper) return;
  
  bindCanvasEvents(wrapper);
  bindMinimapEvents(wrapper);
  bindKeyboardEvents();
  bindNodeGlobalEvents();
  
  _eventsBound = true;
}
