export const initToast = () => {
   const lastToastMap = new Map();
   const MAX_TOASTS = 3;

   window.showToast = function (message, type = 'success') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      // Deduplicate identical toast within 1500ms
      const now = Date.now();
      const key = `${type}:${message}`;
      const lastTime = lastToastMap.get(key);
      if (lastTime && now - lastTime < 1500) {
         return;
      }
      lastToastMap.set(key, now);

      // Prune stale cache entries
      if (lastToastMap.size > 50) {
         for (const [k, time] of lastToastMap.entries()) {
            if (now - time > 10000) lastToastMap.delete(k);
         }
      }

      // Limit maximum visible toasts
      while (container.children.length >= MAX_TOASTS) {
         const oldest = container.firstElementChild;
         if (oldest) oldest.remove();
      }

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      let icon = 'check_circle';
      if (type === 'error') icon = 'error';
      else if (type === 'warning') icon = 'warning';
      else if (type === 'info') icon = 'info';

      toast.innerHTML = /* html */ `<span class="material-symbols-outlined">${icon}</span> <span>${message}</span>`;

      container.appendChild(toast);

      setTimeout(() => {
         if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
         }
      }, 3000); // 0.3s slide in + 2.4s show + 0.3s fade out
   };
};
