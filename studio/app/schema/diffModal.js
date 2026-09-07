import {
   fetchSchemaDiff,
   applySchemaMigration,
   downloadSchemaSnapshot,
   fetchTables,
} from '../../lib/api.js';

/**
 * Modern Interactive Schema Diff & Migration Modal for Studio.
 * Designed to strictly match Studio's unified modal design system (ORM Modal, Mock Modal, etc.).
 */
export function openSchemaDiffModal() {
   let existing = document.getElementById('schema-diff-modal');
   if (existing) existing.remove();

   const dbType = (window.AppState?.dbType || 'database').toUpperCase();
   const dbName = window.AppState?.dbName || 'Current DB';

   const modal = document.createElement('div');
   modal.id = 'schema-diff-modal';
   modal.className = 'modal-overlay';

   modal.innerHTML = /* html */ `
    <div class="diff-modal-container" id="diff-container-box">
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size: 20px;">compare_arrows</span>
          <h3 class="m-0 text-15 font-semibold">Schema Diff & Migration</h3>
          <span class="badge-type" style="font-size: 10px; padding: 2px 7px; border-radius: 4px; background: rgba(59, 130, 246, 0.12); color: var(--color-primary); font-weight: 700;">${dbType}: ${dbName}</span>
        </div>
        <button id="close-diff-modal-btn" class="modal-close-btn" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div class="diff-controls-bar">
        <div class="diff-target-tabs">
          <button type="button" id="tab-diff-file" class="diff-tab-btn active">
            <span class="material-symbols-outlined" style="font-size: 15px;">data_object</span>
            <span>Snapshot File</span>
          </button>
          <button type="button" id="tab-diff-url" class="diff-tab-btn">
            <span class="material-symbols-outlined" style="font-size: 15px;">cloud_sync</span>
            <span>Database Connection</span>
          </button>
        </div>

        <button type="button" id="btn-save-current-snapshot" class="diff-action-btn" title="Export current DB schema as portable JSON snapshot">
          <span class="material-symbols-outlined" style="font-size: 15px;">download</span>
          <span>Save Current Snapshot</span>
        </button>
      </div>

      <!-- Target Input Area -->
      <div class="diff-input-panel">
        <!-- File Input Mode -->
        <div id="diff-panel-file" class="diff-panel-section">
          <div id="diff-dropzone" class="diff-dropzone">
            <input type="file" id="diff-file-input" accept=".json" style="display: none;" />
            <span class="material-symbols-outlined" style="font-size: 28px; color: var(--color-primary); margin-bottom: 6px;">upload_file</span>
            <div id="diff-file-prompt" class="text-13" style="color: var(--color-text-secondary);">
              <span class="font-semibold" style="color: var(--color-primary); cursor: pointer;">Click to choose</span> or drag & drop a <code>schema.json</code> snapshot
            </div>
            <div id="diff-file-info" class="text-12 hidden" style="color: #10b981; font-weight: 600; margin-top: 6px;"></div>
          </div>
        </div>

        <!-- URL Input Mode -->
        <div id="diff-panel-url" class="diff-panel-section hidden">
          <div class="flex items-center gap-2">
            <input type="text" id="diff-target-url-input" class="diff-url-input" placeholder="e.g. postgres://user:pass@remote-host:5432/mydb or mysql://... or file:backup.db" />
            <button type="button" id="btn-run-diff" class="diff-run-btn" disabled>
              <span class="material-symbols-outlined" style="font-size: 16px;">play_arrow</span>
              <span>Compare</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Diff Results Container (Only displayed after comparison) -->
      <div id="diff-results-wrap" class="diff-results-wrap hidden">
        <!-- Stats Bar -->
        <div id="diff-stats-bar" class="diff-stats-bar"></div>

        <!-- Split Grid: Left Visual Diff, Right Migration SQL -->
        <div class="diff-body-split">
          <!-- Left: Changes Tree -->
          <div class="diff-tree-column">
            <div class="diff-column-header">
              <span class="material-symbols-outlined" style="font-size: 15px;">account_tree</span>
              <span>Schema Changes</span>
            </div>
            <div id="diff-tree-content" class="diff-tree-content"></div>
          </div>

          <!-- Right: Generated SQL -->
          <div class="diff-sql-column">
            <div class="diff-column-header flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size: 15px;">code</span>
                <span id="diff-sql-title">Migration SQL (Up)</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" id="btn-toggle-sql-direction" class="diff-mini-btn" title="Toggle between Forward (Up) and Rollback (Down)">
                  <span class="material-symbols-outlined" style="font-size: 13px;">swap_vert</span>
                  <span id="sql-direction-label">Rollback (Down)</span>
                </button>
                <button type="button" id="btn-copy-diff-sql" class="diff-mini-btn" title="Copy SQL">
                  <span class="material-symbols-outlined" style="font-size: 13px;">content_copy</span>
                  <span>Copy</span>
                </button>
                <button type="button" id="btn-download-diff-sql" class="diff-mini-btn" title="Download .sql">
                  <span class="material-symbols-outlined" style="font-size: 13px;">download</span>
                  <span>.sql</span>
                </button>
              </div>
            </div>
            <pre id="diff-sql-preview" class="diff-sql-pre"><code>-- SQL will appear here...</code></pre>
          </div>
        </div>
      </div>

      <!-- Standard Modal Footer -->
      <div class="modal-footer" style="justify-content: space-between; align-items: center;">
        <div class="orm-modal-footer-hint" id="diff-footer-hint">
          <span class="material-symbols-outlined" style="font-size: 15px; color: var(--color-primary);">info</span>
          <span>Select a target snapshot or connection string to compare.</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" id="close-diff-footer-btn" class="btn-secondary">Close</button>
          <button type="button" id="btn-apply-diff-migration" class="btn-primary hidden" style="background: #10b981; border-color: #10b981; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 16px;">bolt</span>
            <span>Apply Migration</span>
          </button>
        </div>
      </div>
    </div>
  `;

   document.body.appendChild(modal);

   // State
   let currentMode = 'file'; // 'file' | 'url'
   let loadedSnapshot = null;
   let diffData = null;
   let showingRollback = false;

   const containerBox = document.getElementById('diff-container-box');
   const closeBtn = document.getElementById('close-diff-modal-btn');
   const closeFooterBtn = document.getElementById('close-diff-footer-btn');
   const tabFile = document.getElementById('tab-diff-file');
   const tabUrl = document.getElementById('tab-diff-url');
   const panelFile = document.getElementById('diff-panel-file');
   const panelUrl = document.getElementById('diff-panel-url');
   const dropzone = document.getElementById('diff-dropzone');
   const fileInput = document.getElementById('diff-file-input');
   const fileInfo = document.getElementById('diff-file-info');
   const urlInput = document.getElementById('diff-target-url-input');
   const runDiffBtn = document.getElementById('btn-run-diff');
   const saveSnapshotBtn = document.getElementById('btn-save-current-snapshot');
   const resultsWrap = document.getElementById('diff-results-wrap');
   const statsBar = document.getElementById('diff-stats-bar');
   const treeContent = document.getElementById('diff-tree-content');
   const sqlPreview = document.getElementById('diff-sql-preview');
   const toggleDirectionBtn = document.getElementById(
      'btn-toggle-sql-direction',
   );
   const copySqlBtn = document.getElementById('btn-copy-diff-sql');
   const downloadSqlBtn = document.getElementById('btn-download-diff-sql');
   const applyMigrationBtn = document.getElementById(
      'btn-apply-diff-migration',
   );
   const footerHint = document.getElementById('diff-footer-hint');

   // Standard close logic with Escape key handler
   const closeFn = () => {
      document.removeEventListener('keydown', handleKeydown);
      modal.remove();
   };

   const handleKeydown = (e) => {
      if (e.key === 'Escape') closeFn();
   };
   document.addEventListener('keydown', handleKeydown);

   modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFn();
   });

   closeBtn.onclick = closeFn;
   closeFooterBtn.onclick = closeFn;

   // Save snapshot button
   saveSnapshotBtn.onclick = () => {
      downloadSchemaSnapshot();
   };

   // Tab switching
   tabFile.onclick = () => {
      currentMode = 'file';
      tabFile.classList.add('active');
      tabUrl.classList.remove('active');
      panelFile.classList.remove('hidden');
      panelUrl.classList.add('hidden');
   };

   tabUrl.onclick = () => {
      currentMode = 'url';
      tabUrl.classList.add('active');
      tabFile.classList.remove('active');
      panelUrl.classList.remove('hidden');
      panelFile.classList.add('hidden');
   };

   // File selection
   dropzone.onclick = () => fileInput.click();
   dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
   };
   dropzone.ondragleave = () => dropzone.classList.remove('dragover');
   dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
         handleFile(e.dataTransfer.files[0]);
      }
   };
   fileInput.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
         handleFile(e.target.files[0]);
      }
   };

   function handleFile(file) {
      if (!file.name.endsWith('.json')) {
         alert('Please select a valid .json schema snapshot file.');
         return;
      }

      const reader = new FileReader();
      reader.onload = async (ev) => {
         try {
            const json = JSON.parse(ev.target.result);
            if (!json.tables || !Array.isArray(json.tables)) {
               alert('Invalid schema snapshot format. Missing tables array.');
               return;
            }
            loadedSnapshot = json;
            fileInfo.textContent = `✔ Loaded "${file.name}" (${(file.size / 1024).toFixed(1)} KB, ${json.tables.length} tables)`;
            fileInfo.classList.remove('hidden');

            await executeDiff({ snapshot: loadedSnapshot });
         } catch (err) {
            alert(`Failed to parse snapshot JSON: ${err.message}`);
         }
      };
      reader.readAsText(file);
   }

   // URL Input handler
   urlInput.oninput = () => {
      runDiffBtn.disabled = !urlInput.value.trim();
   };
   urlInput.onkeydown = (e) => {
      if (e.key === 'Enter' && urlInput.value.trim()) {
         runDiffBtn.click();
      }
   };

   runDiffBtn.onclick = async () => {
      const url = urlInput.value.trim();
      if (!url) return;
      runDiffBtn.disabled = true;
      runDiffBtn.innerHTML = `<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span><span>Comparing...</span>`;
      try {
         await executeDiff({ targetUrl: url });
      } finally {
         runDiffBtn.disabled = false;
         runDiffBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">play_arrow</span><span>Compare</span>`;
      }
   };

   // Execute comparison request
   async function executeDiff(payload) {
      resultsWrap.classList.remove('hidden');
      containerBox.classList.add('has-results');
      statsBar.innerHTML = `<div class="p-2 text-13" style="color: var(--color-text-secondary);">Comparing schemas...</div>`;
      treeContent.innerHTML = `<div class="p-4 text-center text-13" style="color: var(--color-text-secondary);">Computing differences...</div>`;
      sqlPreview.textContent = '-- Computing diff...';

      try {
         const res = await fetchSchemaDiff(payload);
         if (!res.success) {
            statsBar.innerHTML = `<div class="diff-stat-error">✘ Diff Error: ${res.error}</div>`;
            treeContent.innerHTML = '';
            sqlPreview.textContent = `-- Diff failed:\n-- ${res.error}`;
            return;
         }

         diffData = res.data;
         showingRollback = false;
         renderDiffResults(diffData);
      } catch (e) {
         statsBar.innerHTML = `<div class="diff-stat-error">✘ Request failed: ${e.message}</div>`;
      }
   }

   // Render Diff Results
   function renderDiffResults(data) {
      const { diff, migrationSql, rollbackSql } = data;
      const { stats } = diff;

      // 1. Stats Bar
      if (!diff.hasChanges) {
         statsBar.innerHTML = `
          <div class="diff-stat-item clean">
            <span class="material-symbols-outlined" style="color: #10b981;">check_circle</span>
            <span>Schemas are identical! No migration required.</span>
          </div>
        `;
         treeContent.innerHTML = `<div class="p-4 text-center text-13" style="color: #10b981;">Both schemas match completely.</div>`;
         sqlPreview.textContent = '-- Schemas are identical.';
         applyMigrationBtn.classList.add('hidden');
         footerHint.innerHTML = `<span class="material-symbols-outlined" style="font-size: 15px; color: #10b981;">check_circle</span><span>No differences detected. Database is up to date.</span>`;
         return;
      }

      applyMigrationBtn.classList.remove('hidden');
      footerHint.innerHTML = `<span class="material-symbols-outlined" style="font-size: 15px; color: #f59e0b;">warning</span><span>Review changes carefully before applying to database.</span>`;

      statsBar.innerHTML = `
        <div class="diff-stat-group">
          ${stats.addedTablesCount > 0 ? `<span class="diff-stat-badge added">+${stats.addedTablesCount} Tables Added</span>` : ''}
          ${stats.droppedTablesCount > 0 ? `<span class="diff-stat-badge dropped">-${stats.droppedTablesCount} Tables Dropped</span>` : ''}
          ${stats.alteredTablesCount > 0 ? `<span class="diff-stat-badge altered">~${stats.alteredTablesCount} Tables Altered</span>` : ''}
          <span class="diff-stat-badge neutral">${stats.addedColumnsCount + stats.droppedColumnsCount + stats.modifiedColumnsCount} Column Changes</span>
          ${stats.addedIndexesCount + stats.droppedIndexesCount > 0 ? `<span class="diff-stat-badge neutral">${stats.addedIndexesCount + stats.droppedIndexesCount} Index Changes</span>` : ''}
        </div>
      `;

      // 2. Visual Diff Tree
      let treeHtml = '';
      for (const table of diff.tables) {
         if (table.type === 'added') {
            treeHtml += `
            <div class="diff-tree-table-item">
              <div class="diff-table-header added">
                <span class="material-symbols-outlined" style="font-size: 16px;">add_box</span>
                <span class="font-semibold">${table.tableName}</span>
                <span class="diff-pill added">NEW TABLE</span>
              </div>
              <div class="diff-table-details">
                ${table.addedColumns.map((c) => `<div class="diff-item added">+ ${c.name} <span class="diff-type">${c.type}</span></div>`).join('')}
              </div>
            </div>
          `;
         } else if (table.type === 'dropped') {
            treeHtml += `
            <div class="diff-tree-table-item">
              <div class="diff-table-header dropped">
                <span class="material-symbols-outlined" style="font-size: 16px;">indeterminate_check_box</span>
                <span class="font-semibold">${table.tableName}</span>
                <span class="diff-pill dropped">DROP TABLE</span>
              </div>
            </div>
          `;
         } else if (table.type === 'altered') {
            treeHtml += `
            <div class="diff-tree-table-item">
              <div class="diff-table-header altered">
                <span class="material-symbols-outlined" style="font-size: 16px;">change_circle</span>
                <span class="font-semibold">${table.tableName}</span>
                <span class="diff-pill altered">ALTER TABLE</span>
              </div>
              <div class="diff-table-details">
                ${table.addedColumns.map((c) => `<div class="diff-item added">+ ADD COLUMN ${c.name} <span class="diff-type">${c.type}</span></div>`).join('')}
                ${table.droppedColumns.map((c) => `<div class="diff-item dropped">- DROP COLUMN ${c.name}</div>`).join('')}
                ${table.modifiedColumns.map((m) => `<div class="diff-item modified">~ MODIFY ${m.name}: <span class="diff-type">${m.oldType}</span> ➔ <span class="diff-type">${m.newType}</span></div>`).join('')}
                ${table.addedIndexes.map((i) => `<div class="diff-item added">+ INDEX ${i.name || 'unnamed'} (${i.columns.join(', ')})</div>`).join('')}
                ${table.droppedIndexes.map((i) => `<div class="diff-item dropped">- DROP INDEX ${i.name || 'unnamed'}</div>`).join('')}
              </div>
            </div>
          `;
         }
      }
      treeContent.innerHTML = treeHtml;

      // 3. Migration SQL Box
      updateSqlDisplay();
   }

   function updateSqlDisplay() {
      if (!diffData) return;
      const targetSql = showingRollback
         ? diffData.rollbackSql
         : diffData.migrationSql;
      sqlPreview.textContent = targetSql;
      document.getElementById('diff-sql-title').textContent = showingRollback
         ? 'Rollback SQL (Down)'
         : 'Migration SQL (Up)';
      document.getElementById('sql-direction-label').textContent =
         showingRollback ? 'Migration (Up)' : 'Rollback (Down)';
   }

   toggleDirectionBtn.onclick = () => {
      showingRollback = !showingRollback;
      updateSqlDisplay();
   };

   copySqlBtn.onclick = async () => {
      const sql = sqlPreview.textContent;
      try {
         await navigator.clipboard.writeText(sql);
         const textNode = copySqlBtn.querySelector('span:last-child');
         const oldText = textNode.textContent;
         textNode.textContent = 'Copied!';
         setTimeout(() => {
            textNode.textContent = oldText;
         }, 1800);
      } catch {
         alert('Failed to copy to clipboard.');
      }
   };

   downloadSqlBtn.onclick = () => {
      const sql = sqlPreview.textContent;
      const blob = new Blob([sql], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `migration_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
   };

   applyMigrationBtn.onclick = async () => {
      const sql = sqlPreview.textContent;
      if (!sql || !diffData?.diff?.hasChanges) return;

      const confirmed = confirm(
         `Are you sure you want to execute this ${showingRollback ? 'ROLLBACK' : 'MIGRATION'} script against the current database?\n\nThis will execute DDL statements immediately!`,
      );
      if (!confirmed) return;

      applyMigrationBtn.disabled = true;
      applyMigrationBtn.innerHTML = `<span class="material-symbols-outlined spin" style="font-size: 16px;">sync</span><span>Applying...</span>`;

      try {
         const res = await applySchemaMigration(sql);
         if (res.success) {
            alert('✔ Migration applied successfully to the database!');
            await fetchTables();
            modal.remove();
            if (window.renderSchemaGrid) {
               window.location.reload();
            }
         } else {
            alert(`✘ Migration execution failed: ${res.error}`);
         }
      } catch (err) {
         alert(`✘ Migration failed: ${err.message}`);
      } finally {
         applyMigrationBtn.disabled = false;
         applyMigrationBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">bolt</span><span>Apply Migration</span>`;
      }
   };
}
