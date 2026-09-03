import { ERDState } from '../state.js';
import { getMinimapMetrics } from '../render.js';

export function bindMinimapEvents(wrapper) {
   const minimap = document.getElementById('erd-minimap');
   if (!minimap) return;

   let isDraggingMinimap = false;

   const updateScrollFromMinimap = (evt) => {
      const rect = minimap.getBoundingClientRect();
      const mx = evt.clientX - rect.left;
      const my = evt.clientY - rect.top;

      const nodes = Array.from(document.querySelectorAll('.erd-node'));
      const { scale, offsetX, offsetY, minX, minY, vW, vH } = getMinimapMetrics(
         wrapper,
         nodes,
      );

      const wsX = minX + (mx - offsetX) / scale;
      const wsY = minY + (my - offsetY) / scale;

      wrapper.scrollLeft = (wsX - vW / 2) * ERDState.zoom;
      wrapper.scrollTop = (wsY - vH / 2) * ERDState.zoom;
   };

   minimap.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      isDraggingMinimap = true;
      updateScrollFromMinimap(e);

      const onMouseMove = (evt) => {
         if (!isDraggingMinimap) return;
         updateScrollFromMinimap(evt);
      };

      const onMouseUp = () => {
         isDraggingMinimap = false;
         document.removeEventListener('mousemove', onMouseMove);
         document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
   });
}
