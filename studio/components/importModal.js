/**
 * Import Modal Component for Drixio Studio
 * Provides a modern, Supabase-grade modal with drag & drop support for:
 * 1. Table Records (CSV / JSON)
 * 2. ERD Canvas Layout (.json)
 * 3. Database Restore (.sql / .json)
 */

let modalOverlay = null;
let currentType = 'records'; // 'records' | 'erd' | 'database'
let currentFile = null;

export function openImportModal(initialType = 'records') {
   currentType = initialType;
   currentFile = null;

   if (!modalOverlay) {
      createModalDOM();
   }

   updateModalState();
   modalOverlay.classList.remove('hidden');
}

export function closeImportModal() {
   if (modalOverlay) {
      modalOverlay.classList.add('hidden');
      currentFile = null;
      resetFileInput();
   }
}

function resetFileInput() {
   const input = document.getElementById('import-file-input');
   if (input) input.value = '';
   const preview = document.getElementById('import-file-preview');
   if (preview) preview.classList.add('hidden');
   const dropzone = document.getElementById('import-dropzone');
   if (dropzone) dropzone.classList.remove('has-file', 'drag-over');
   const submitBtn = document.getElementById('import-modal-submit-btn');
   if (submitBtn) submitBtn.disabled = true;
}

function updateModalState() {
   const currentTable = window.AppState?.currentTable || '';
   const tableBadgeWrap = document.getElementById('import-target-table-wrap');
   const targetTableEl = document.getElementById('import-target-table-name');
   const dropzoneHint = document.getElementById('import-format-hint');
   const fileInput = document.getElementById('import-file-input');
   const submitBtn = document.getElementById('import-modal-submit-btn');

   // Update Type Tabs
   document.querySelectorAll('.import-type-tab').forEach((tab) => {
      const type = tab.getAttribute('data-type');
      if (type === currentType) {
         tab.classList.add('active');
      } else {
         tab.classList.remove('active');
      }
   });

   // Target Table Visibility & Format Hints
   if (currentType === 'records') {
      if (tableBadgeWrap) tableBadgeWrap.style.display = 'flex';
      if (targetTableEl) {
         targetTableEl.textContent = currentTable || 'No table selected';
         if (!currentTable) {
            targetTableEl.classList.add('empty');
         } else {
            targetTableEl.classList.remove('empty');
         }
      }
      if (dropzoneHint)
         dropzoneHint.textContent = 'Accepts .csv or .json files';
      if (fileInput) fileInput.accept = '.csv,.json';
   } else if (currentType === 'erd') {
      if (tableBadgeWrap) tableBadgeWrap.style.display = 'none';
      if (dropzoneHint)
         dropzoneHint.textContent = 'Accepts canvas layout JSON files (.json)';
      if (fileInput) fileInput.accept = '.json';
   } else if (currentType === 'database') {
      if (tableBadgeWrap) tableBadgeWrap.style.display = 'none';
      if (dropzoneHint)
         dropzoneHint.textContent = 'Accepts SQL dumps (.sql) or schema JSON';
      if (fileInput) fileInput.accept = '.sql,.json';
   }

   // Enable / disable submit button
   if (submitBtn) {
      submitBtn.disabled = !currentFile;
   }
}

function handleFileSelection(file) {
   if (!file) return;

   const ext = file.name.split('.').pop()?.toLowerCase();
   const validExtensions = {
      records: ['csv', 'json'],
      erd: ['json'],
      database: ['sql', 'json'],
   };

   const allowed = validExtensions[currentType] || [];
   if (!allowed.includes(ext)) {
      if (typeof window.showToast === 'function') {
         window.showToast(
            `Invalid file format for ${currentType}. Please select a .${allowed.join(' or .')} file.`,
            'error',
         );
      }
      return;
   }

   currentFile = file;

   // Update preview UI
   const fileNameEl = document.getElementById('import-file-name');
   const fileSizeEl = document.getElementById('import-file-size');
   const preview = document.getElementById('import-file-preview');
   const dropzone = document.getElementById('import-dropzone');
   const submitBtn = document.getElementById('import-modal-submit-btn');

   if (fileNameEl) fileNameEl.textContent = file.name;
   if (fileSizeEl) {
      const kb = file.size / 1024;
      fileSizeEl.textContent =
         kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
   }

   if (preview) preview.classList.remove('hidden');
   if (dropzone) dropzone.classList.add('has-file');
   if (submitBtn) submitBtn.disabled = false;
}

async function executeImport() {
   if (!currentFile) return;

   const submitBtn = document.getElementById('import-modal-submit-btn');
   const originalText = submitBtn?.innerHTML;

   if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
         <span class="material-symbols-outlined icon-spin" style="font-size: 16px;">progress_activity</span>
         <span>Importing...</span>
      `;
   }

   try {
      if (currentType === 'records') {
         const tableName = window.AppState?.currentTable;
         if (!tableName) {
            window.showToast?.(
               'Please select a table from the sidebar first.',
               'error',
            );
            return;
         }

         const ext = currentFile.name.split('.').pop()?.toLowerCase();
         const format = ext === 'json' ? 'json' : 'csv';

         const formData = new FormData();
         formData.append('file', currentFile);
         formData.append('format', format);

         window.showToast?.(
            `Importing ${currentFile.name} into '${tableName}'...`,
            'success',
         );

         const res = await fetch(
            `/api/tables/${encodeURIComponent(tableName)}/import`,
            {
               method: 'POST',
               body: formData,
            },
         );
         const result = await res.json();

         if (result.success) {
            window.showToast?.(
               result.message || 'Import completed successfully',
               'success',
            );
            // Refresh table view if open
            if (window.AppState?.currentTab === 'data-btn') {
               const viewId = `view-data-btn-${tableName}`;
               const container = document.getElementById(viewId);
               if (container) container.innerHTML = '';
               window.renderCurrentView?.('', true);
            }
            closeImportModal();
         } else {
            window.showToast?.(result.error || 'Import failed', 'error');
         }
      } else if (currentType === 'erd') {
         const text = await currentFile.text();
         const parsed = JSON.parse(text);
         if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('Invalid ERD layout JSON structure.');
         }

         const positions = parsed.positions || parsed;
         localStorage.setItem(
            'drixio-erd-positions',
            JSON.stringify(positions),
         );
         window.showToast?.('ERD layout imported successfully!', 'success');

         const erdContainer = document.getElementById('view-erd-btn');
         if (erdContainer) {
            erdContainer.innerHTML = '';
            if (window.AppState?.currentTab === 'erd-btn') {
               window.renderCurrentView?.();
            }
         }
         closeImportModal();
      } else if (currentType === 'database') {
         const confirmed = confirm(
            `🚨 HIGH RISK ACTION: DATABASE RESTORE\n\n` +
               `File: ${currentFile.name} (${(currentFile.size / 1024).toFixed(1)} KB)\n\n` +
               `Executing this SQL script directly against the database may modify, truncate, or drop existing tables.\n\n` +
               `Are you sure you want to proceed?`,
         );
         if (!confirmed) return;

         const formData = new FormData();
         formData.append('file', currentFile);

         window.showToast?.(
            `Executing ${currentFile.name} on database...`,
            'success',
         );

         const res = await fetch('/api/database/import', {
            method: 'POST',
            body: formData,
         });
         const result = await res.json();

         if (result.success) {
            window.showToast?.(
               result.message || 'Database restored successfully',
               'success',
            );
            closeImportModal();
            setTimeout(() => location.reload(), 1500);
         } else {
            window.showToast?.(result.error || 'Import failed', 'error');
         }
      }
   } catch (err) {
      window.showToast?.(`Import error: ${err.message}`, 'error');
   } finally {
      if (submitBtn && originalText) {
         submitBtn.disabled = !currentFile;
         submitBtn.innerHTML = originalText;
      }
   }
}

function createModalDOM() {
   modalOverlay = document.createElement('div');
   modalOverlay.id = 'import-modal-overlay';
   modalOverlay.className = 'modal-overlay hidden';

   modalOverlay.innerHTML = /* html */ `
      <div class="modal-container import-modal-card">
         <div class="modal-header">
            <div class="import-modal-title-wrap">
               <div class="import-icon-badge">
                  <span class="material-symbols-outlined">upload_file</span>
               </div>
               <div>
                  <h3 class="import-modal-title">Import Data</h3>
                  <p class="import-modal-subtitle">Upload records, ERD layouts, or restore your database</p>
               </div>
            </div>
            <button type="button" id="import-modal-close-btn" class="modal-close-btn" aria-label="Close modal">✕</button>
         </div>

         <div class="import-modal-body">
            <!-- Tabs -->
            <div class="import-type-tabs" role="tablist">
               <button type="button" class="import-type-tab active" data-type="records">
                  <span class="material-symbols-outlined">table_chart</span>
                  <span>Table Records</span>
               </button>
               <button type="button" class="import-type-tab" data-type="erd">
                  <span class="material-symbols-outlined">account_tree</span>
                  <span>ERD Layout</span>
               </button>
               <button type="button" class="import-type-tab" data-type="database">
                  <span class="material-symbols-outlined">database</span>
                  <span>Database Restore</span>
               </button>
            </div>

            <!-- Target Table Banner (Only for records) -->
            <div id="import-target-table-wrap" class="import-target-banner">
               <span class="material-symbols-outlined banner-icon">pin_drop</span>
               <span class="banner-label">Target Table:</span>
               <span id="import-target-table-name" class="target-table-badge">users</span>
            </div>

            <!-- Drag & Drop Zone -->
            <div id="import-dropzone" class="import-dropzone">
               <span class="material-symbols-outlined dropzone-icon">cloud_upload</span>
               <div class="dropzone-info">
                  <p class="dropzone-text">Drag & drop your file here, or <span class="dropzone-browse">browse files</span></p>
                  <span id="import-format-hint" class="dropzone-hint">Accepts .csv or .json files</span>
               </div>
               <input type="file" id="import-file-input" class="hidden-file-input" />
            </div>

            <!-- File Preview Card -->
            <div id="import-file-preview" class="import-file-preview hidden">
               <div class="preview-left">
                  <span class="material-symbols-outlined preview-icon">description</span>
                  <div class="preview-text">
                     <span id="import-file-name" class="preview-filename">file.csv</span>
                     <span id="import-file-size" class="preview-filesize">0 KB</span>
                  </div>
               </div>
               <button type="button" id="import-file-remove-btn" class="preview-remove-btn" title="Remove selected file">✕</button>
            </div>
         </div>

         <div class="modal-footer import-modal-footer">
            <button type="button" id="import-modal-cancel-btn" class="import-cancel-btn">Cancel</button>
            <button type="button" id="import-modal-submit-btn" class="import-submit-btn" disabled>
               <span class="material-symbols-outlined btn-icon">upload</span>
               <span>Import File</span>
            </button>
         </div>
      </div>
   `;

   document.body.appendChild(modalOverlay);
   bindModalEvents();
}

function bindModalEvents() {
   if (!modalOverlay) return;

   const closeBtn = document.getElementById('import-modal-close-btn');
   const cancelBtn = document.getElementById('import-modal-cancel-btn');
   const submitBtn = document.getElementById('import-modal-submit-btn');
   const dropzone = document.getElementById('import-dropzone');
   const fileInput = document.getElementById('import-file-input');
   const removeBtn = document.getElementById('import-file-remove-btn');

   // Close / Cancel
   closeBtn?.addEventListener('click', closeImportModal);
   cancelBtn?.addEventListener('click', closeImportModal);

   // Click overlay outside card
   modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
         closeImportModal();
      }
   });

   // Escape key listener
   document.addEventListener('keydown', (e) => {
      if (
         e.key === 'Escape' &&
         modalOverlay &&
         !modalOverlay.classList.contains('hidden')
      ) {
         closeImportModal();
      }
   });

   // Type Tabs
   document.querySelectorAll('.import-type-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
         const type = tab.getAttribute('data-type');
         if (type && type !== currentType) {
            currentType = type;
            currentFile = null;
            resetFileInput();
            updateModalState();
         }
      });
   });

   // Browse click
   dropzone?.addEventListener('click', (e) => {
      if (e.target !== removeBtn) {
         fileInput?.click();
      }
   });

   // File Input Change
   fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelection(file);
   });

   // Drag & Drop
   dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
   });

   dropzone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
   });

   dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileSelection(file);
   });

   // Remove File
   removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentFile = null;
      resetFileInput();
      updateModalState();
   });

   // Submit
   submitBtn?.addEventListener('click', executeImport);
}
