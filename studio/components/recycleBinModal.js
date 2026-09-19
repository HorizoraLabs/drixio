import {
   fetchTrashListApi,
   restoreTrashApi,
   purgeTrashApi,
   purgeAllTrashApi,
} from '../lib/api.js';

export async function openRecycleBinModal() {
   let modal = document.getElementById('recycle-bin-modal');
   if (modal) modal.remove();

   modal = document.createElement('div');
   modal.id = 'recycle-bin-modal';
   modal.className = 'modal-overlay';
   modal.setAttribute('role', 'dialog');
   modal.setAttribute('aria-modal', 'true');
   modal.setAttribute('aria-labelledby', 'recycle-bin-title');

   document.body.appendChild(modal);

   // Close on Esc
   const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
         closeModal();
      }
   };
   window.addEventListener('keydown', handleKeyDown);

   function closeModal() {
      window.removeEventListener('keydown', handleKeyDown);
      modal.remove();
   }

   modal.onclick = (e) => {
      if (e.target === modal) closeModal();
   };

   // Initial render with loading spinner
   modal.innerHTML = /* html */ `
      <div class="modal-dialog recycle-bin-dialog">
         <div class="modal-header">
            <div class="modal-header-info">
               <div class="modal-icon-badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">
                  <span class="material-symbols-outlined">delete</span>
               </div>
               <div>
                  <h3 id="recycle-bin-title" class="modal-title">Table Recycle Bin</h3>
                  <p class="modal-subtitle">Tables moved to trash can be restored instantly or permanently purged.</p>
               </div>
            </div>
            <button class="modal-close-btn" id="recycle-bin-close-btn" aria-label="Close modal">
               <span class="material-symbols-outlined">close</span>
            </button>
         </div>
         <div class="modal-body" id="recycle-bin-body" style="min-height: 200px; display: flex; align-items: center; justify-content: center;">
            <div style="display: flex; align-items: center; gap: 8px; color: var(--color-text-dim);">
               <span class="material-symbols-outlined animate-spin icon-20">progress_activity</span>
               <span>Loading deleted tables...</span>
            </div>
         </div>
      </div>
   `;

   document.getElementById('recycle-bin-close-btn').onclick = closeModal;

   await reloadContent();

   async function reloadContent() {
      const body = document.getElementById('recycle-bin-body');
      if (!body) return;

      const res = await fetchTrashListApi();
      const items = res.success ? res.data : [];

      // Update sidebar trash badge
      if (window.updateSidebarTrashBadge) {
         window.updateSidebarTrashBadge(items.length);
      }

      if (items.length === 0) {
         body.style.display = 'flex';
         body.innerHTML = /* html */ `
            <div class="recycle-bin-empty-state" style="text-align: center; padding: 40px 20px;">
               <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--color-bg-subtle, rgba(255,255,255,0.05)); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--color-text-dim);">
                  <span class="material-symbols-outlined" style="font-size: 28px;">delete_outline</span>
               </div>
               <h4 style="margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: var(--color-text);">Recycle Bin is Empty</h4>
               <p style="margin: 0; font-size: 13px; color: var(--color-text-dim); max-width: 320px;">
                  No tables in the trash. When you delete a table in Studio, it is safely retained here for instant recovery.
               </p>
            </div>
         `;
         return;
      }

      body.style.display = 'block';

      const showThresholdWarning = items.length >= 10;

      body.innerHTML = /* html */ `
         ${
            showThresholdWarning
               ? /* html */ `
               <div class="recycle-bin-tip-banner" style="display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: 8px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); color: #f59e0b; margin-bottom: 16px; font-size: 12.5px;">
                  <span class="material-symbols-outlined" style="font-size: 18px; margin-top: 1px;">info</span>
                  <div>
                     <strong>Notice:</strong> You have ${items.length} tables in the recycle bin. If you are using a cloud database (Supabase, RDS, PlanetScale), consider purging old tables to keep your catalog clean.
                  </div>
               </div>
            `
               : ''
         }

         <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <span style="font-size: 13px; font-weight: 500; color: var(--color-text-dim);">
               ${items.length} ${items.length === 1 ? 'table' : 'tables'} in trash
            </span>
            <button id="purge-all-btn" class="btn btn-outline-danger" style="font-size: 12px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px;">
               <span class="material-symbols-outlined icon-16">delete_forever</span>
               <span>Empty Recycle Bin</span>
            </button>
         </div>

         <div class="recycle-bin-table-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow-y: auto;">
            ${items
               .map((item) => {
                  const relativeTime = getRelativeTime(item.deletedAt);
                  return /* html */ `
                  <div class="recycle-bin-item-row" data-trash-id="${item.trashId}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 8px; background: var(--color-bg-subtle, rgba(255,255,255,0.03)); border: 1px solid var(--color-border); transition: border-color 0.2s;">
                     <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden; max-width: 65%;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                           <span class="material-symbols-outlined icon-18" style="color: var(--color-primary);">table</span>
                           <span style="font-weight: 600; font-size: 14px; color: var(--color-text); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.originalName}</span>
                           <span class="badge" style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text-dim);">
                              ${item.rowCount.toLocaleString()} rows
                           </span>
                           ${
                              item.hasLocalBackup
                                 ? /* html */ `<span class="badge" style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #10b981;" title="Local snapshot JSON exists in .drixio/backups">💾 Backup</span>`
                                 : ''
                           }
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-dim);">
                           <span>Deleted ${relativeTime}</span>
                           <span>•</span>
                           <span style="font-family: monospace; font-size: 11px; opacity: 0.7;">${item.trashId}</span>
                        </div>
                     </div>

                     <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="btn btn-primary restore-item-btn" data-trash-id="${item.trashId}" data-orig-name="${item.originalName}" style="font-size: 12px; padding: 5px 12px; display: inline-flex; align-items: center; gap: 4px;">
                           <span class="material-symbols-outlined icon-16">settings_backup_restore</span>
                           <span>Restore</span>
                        </button>
                        <button class="btn btn-ghost purge-item-btn" data-trash-id="${item.trashId}" data-orig-name="${item.originalName}" title="Permanently delete from database" style="color: #ef4444; padding: 6px 8px;">
                           <span class="material-symbols-outlined icon-18">delete_forever</span>
                        </button>
                     </div>
                  </div>
               `;
               })
               .join('')}
         </div>
      `;

      // Bind Purge All
      const purgeAllBtn = document.getElementById('purge-all-btn');
      if (purgeAllBtn) {
         purgeAllBtn.onclick = async () => {
            if (
               !confirm(
                  `Are you sure you want to PERMANENTLY delete all ${items.length} tables in the recycle bin? This will physically drop them from the database and free up storage.`,
               )
            ) {
               return;
            }

            purgeAllBtn.disabled = true;
            purgeAllBtn.innerHTML = `<span class="material-symbols-outlined animate-spin icon-16">progress_activity</span> Purging...`;

            const purgeRes = await purgeAllTrashApi();
            if (purgeRes.success) {
               if (window.showToast) {
                  window.showToast(
                     `Recycle bin emptied (${purgeRes.data.purgedCount} tables purged).`,
                     'success',
                  );
               }
               await reloadContent();
            } else {
               alert(purgeRes.error || 'Failed to empty recycle bin.');
               purgeAllBtn.disabled = false;
               purgeAllBtn.innerHTML = `<span class="material-symbols-outlined icon-16">delete_forever</span> Empty Recycle Bin`;
            }
         };
      }

      // Bind Individual Restore
      body.querySelectorAll('.restore-item-btn').forEach((btn) => {
         btn.onclick = async () => {
            const trashId = btn.dataset.trashId;
            const origName = btn.dataset.origName;

            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animate-spin icon-16">progress_activity</span> Restoring...`;

            const res = await restoreTrashApi(trashId);
            if (res.success) {
               const restoredTable = res.data.restoredTable;
               if (window.showToast) {
                  window.showToast(
                     `Table "${restoredTable}" restored successfully!`,
                     'success',
                  );
               }

               // Refresh sidebar
               if (window.refreshTableList) {
                  await window.refreshTableList(true);
               }

               // Select restored table
               if (window.AppState) {
                  window.AppState.currentTable = restoredTable;
                  if (window.renderCurrentView) {
                     window.renderCurrentView();
                  }
               }

               await reloadContent();
            } else {
               alert(res.error || 'Failed to restore table.');
               btn.disabled = false;
               btn.innerHTML = `<span class="material-symbols-outlined icon-16">settings_backup_restore</span> Restore`;
            }
         };
      });

      // Bind Individual Purge
      body.querySelectorAll('.purge-item-btn').forEach((btn) => {
         btn.onclick = async () => {
            const trashId = btn.dataset.trashId;
            const origName = btn.dataset.origName;

            if (
               !confirm(
                  `Permanently delete table "${origName}" from the database? This cannot be undone.`,
               )
            ) {
               return;
            }

            btn.disabled = true;
            const res = await purgeTrashApi(trashId);
            if (res.success) {
               if (window.showToast) {
                  window.showToast(`Table "${origName}" permanently purged.`, 'info');
               }
               await reloadContent();
            } else {
               alert(res.error || 'Failed to purge table.');
               btn.disabled = false;
            }
         };
      });
   }
}

function getRelativeTime(timestamp) {
   if (!timestamp || timestamp <= 0) return 'recently';
   const diffMs = Date.now() - timestamp;
   const diffSec = Math.floor(diffMs / 1000);
   if (diffSec < 60) return 'just now';
   const diffMin = Math.floor(diffSec / 60);
   if (diffMin < 60) return `${diffMin}m ago`;
   const diffHours = Math.floor(diffMin / 60);
   if (diffHours < 24) return `${diffHours}h ago`;
   const diffDays = Math.floor(diffHours / 24);
   if (diffDays < 30) return `${diffDays}d ago`;
   return new Date(timestamp).toLocaleDateString();
}

