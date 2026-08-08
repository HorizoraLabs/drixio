import { ERDState } from "../state.js";

export function bindMinimapEvents(wrapper) {
  const minimap = document.getElementById("erd-minimap");
  if (!minimap) return;

  let isDraggingMinimap = false;
  
  minimap.addEventListener("mousedown", (e) => {
    e.stopPropagation(); // prevent panning the wrapper
    if (e.button !== 0) return;
    isDraggingMinimap = true;

    const rect = minimap.getBoundingClientRect();
    const mapW = 180;
    const mapH = 130;
    const dataW = 4000;
    const dataH = 4000;
    const scale = Math.min(mapW / dataW, mapH / dataH);
    const offsetX = (mapW - dataW * scale) / 2;
    const offsetY = (mapH - dataH * scale) / 2;

    const updateScroll = (evt) => {
      const mx = evt.clientX - rect.left;
      const my = evt.clientY - rect.top;

      // Find center of viewport in workspace coordinates
      const wsX = (mx - offsetX) / scale;
      const wsY = (my - offsetY) / scale;

      // Scroll so this point is centered
      const vW = wrapper.clientWidth / ERDState.zoom;
      const vH = wrapper.clientHeight / ERDState.zoom;
      wrapper.scrollLeft = (wsX - vW / 2) * ERDState.zoom;
      wrapper.scrollTop = (wsY - vH / 2) * ERDState.zoom;
    };

    updateScroll(e); // scroll immediately on click

    const onMouseMove = (evt) => {
      if (!isDraggingMinimap) return;
      updateScroll(evt);
    };
    
    const onMouseUp = () => {
      isDraggingMinimap = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}
