/**
 * SQL Console Safe Mode Modal & Utility
 * Intercepts dangerous SQL queries (DELETE/UPDATE without WHERE, DROP, TRUNCATE)
 */

export const isSafeModeEnabled = () => {
   return localStorage.getItem('drixio_safe_mode_disabled') !== 'true';
};

export const setSafeModeEnabled = (enabled) => {
   if (enabled) {
      localStorage.removeItem('drixio_safe_mode_disabled');
   } else {
      localStorage.setItem('drixio_safe_mode_disabled', 'true');
   }
   window.dispatchEvent(
      new CustomEvent('drixio-safemode-changed', { detail: { enabled } }),
   );
};

export const analyzeDangerousQuery = async (rawSql) => {
   if (!rawSql) return { isDangerous: false };
   
   try {
      const res = await fetch('/api/query/analyze', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ sql: rawSql }),
      });
      const data = await res.json();
      if (data.success) {
         return {
            isDangerous: data.isDangerous,
            type: data.type,
            title: data.title,
            description: data.description,
            sql: data.sql
         };
      }
      return { isDangerous: false };
   } catch (e) {
      console.error(e);
      return { isDangerous: false };
   }
};

/**
 * Shows confirmation modal for dangerous queries
 */
export const showSafeQueryModal = ({
   dangerInfo,
   fullSql,
   onConfirm,
   onCancel,
}) => {
   let existingModal = document.getElementById('safe-mode-modal');
   if (existingModal) existingModal.remove();

   const modal = document.createElement('div');
   modal.id = 'safe-mode-modal';
   modal.className = 'modal-overlay';

   const displaySql = (dangerInfo?.sql || fullSql || '').trim();

   modal.innerHTML = /* html */ `
    <div class="modal-container safe-modal-container">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <div class="modal-icon-badge warning">
            <span class="material-symbols-outlined">warning</span>
          </div>
          <div class="modal-title-col">
            <div class="modal-title-row">
              <h3 class="modal-title-text">${dangerInfo.title || 'Destructive Operation Warning'}</h3>
              <span class="modal-title-badge" style="color: var(--color-error); border-color: rgba(239, 68, 68, 0.3);">${dangerInfo.type || 'HIGH RISK'}</span>
            </div>
            <p class="modal-subtitle-text">Destructive queries require confirmation under Safe Mode</p>
          </div>
        </div>
        <button id="safe-modal-close-btn" class="modal-close-btn" title="Cancel (Esc)">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="safe-modal-body">
        <p class="safe-modal-desc">${dangerInfo.description}</p>
        
        <div class="safe-sql-preview-label">Statement to be executed:</div>
        <div class="safe-sql-preview">
          <code>${displaySql.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>
        </div>

        <div class="safe-modal-preference">
          <label class="safe-checkbox-label">
            <input type="checkbox" id="safe-dont-warn-checkbox" />
            <span class="safe-checkbox-text">不再提示 (Don't warn me again)</span>
          </label>
          <span class="safe-preference-hint">You can re-enable Safe Mode anytime from the Console toolbar.</span>
        </div>
      </div>

      <div class="safe-modal-footer">
        <button type="button" id="safe-modal-cancel-btn" class="btn-secondary">
          Cancel
        </button>
        <button type="button" id="safe-modal-confirm-btn" class="safe-btn-confirm">
          <span class="material-symbols-outlined" style="font-size: 16px;">gavel</span>
          <span>Confirm & Run</span>
        </button>
      </div>
    </div>
  `;

   document.body.appendChild(modal);

   const closeFn = () => {
      document.removeEventListener('keydown', handleKeydown);
      modal.remove();
   };

   const handleKeydown = (e) => {
      if (e.key === 'Escape') {
         closeFn();
         if (onCancel) onCancel();
      }
   };
   document.addEventListener('keydown', handleKeydown);

   modal.addEventListener('click', (e) => {
      if (e.target === modal) {
         closeFn();
         if (onCancel) onCancel();
      }
   });

   document.getElementById('safe-modal-close-btn').onclick = () => {
      closeFn();
      if (onCancel) onCancel();
   };

   document.getElementById('safe-modal-cancel-btn').onclick = () => {
      closeFn();
      if (onCancel) onCancel();
   };

   document.getElementById('safe-modal-confirm-btn').onclick = () => {
      const dontWarn = document.getElementById(
         'safe-dont-warn-checkbox',
      )?.checked;
      if (dontWarn) {
         setSafeModeEnabled(false);
         if (window.showToast) {
            window.showToast(
               'Safe Mode disabled. Future queries will run without confirmation.',
               'info',
            );
         }
      }
      closeFn();
      if (onConfirm) onConfirm();
   };
};
