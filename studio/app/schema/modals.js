import { updateSchemaCell } from './core.js';
import { fetchDatabaseEnums, renameTableApi } from '../../lib/api.js';
import { openDropdownPicker } from '../../components/dropdownPicker.js';

export function openIndexModal() {
   const sg = window.SchemaGrid;
   if (!sg) return;

   let modal = document.getElementById('index-modal');
   if (modal) modal.remove();

   const existingIndexes = [...sg.indexes];
   const added = [...sg.pendingIndexEdits.added];
   const dropped = new Set(sg.pendingIndexEdits.dropped);

   let activeIndexes = existingIndexes
      .filter((i) => !dropped.has(i.name))
      .concat(added);

   const schemaCols = sg.schema.map((c) => c.name);
   sg.pendingInserts.forEach((row) => {
      if (row.name && row.name.trim() !== '') {
         schemaCols.push(row.name.trim());
      }
   });

   let selectedCols = [];

   modal = document.createElement('div');
   modal.id = 'index-modal';
   modal.className = 'modal-overlay';
   modal.innerHTML = /* html */ `
    <div class="modal-container idx-modal-container">
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size:20px;">key</span>
          <h3 class="m-0 text-15 font-semibold">Manage Indexes</h3>
        </div>
        <button id="close-idx-modal" class="modal-close-btn" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div class="modal-body-scroll" style="max-height: 220px; padding: 16px;">
        <div class="idx-section-title">Current Indexes</div>
        <div id="idx-list-container"></div>
      </div>

      <div class="modal-section-bg" style="padding: 16px 20px;">
        <div class="idx-section-title" style="margin-bottom: 24px;">+ Create New Index</div>
        <div class="flex flex-col gap-3">
          <div>
            <label class="text-11 text-secondary block mb-1.5">Index Name</label>
            <input type="text" id="new-idx-name" placeholder="Optional (auto-generated if empty)" class="modal-input w-full" style="padding: 8px 12px; font-size: 13px;" />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-11 text-secondary">Columns (click to select in order)</label>
              <button type="button" id="btn-clear-selected-cols" class="idx-clear-btn hidden" title="Clear column selection">
                <span class="material-symbols-outlined" style="font-size:12px; line-height:1;">close</span>
                <span>Clear selection</span>
              </button>
            </div>
            <div id="idx-chips-container" class="idx-chips-container"></div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <label class="flex items-center gap-2 cursor-pointer select-none text-13">
              <input type="checkbox" id="new-idx-unique" style="accent-color: var(--color-primary);" />
              <span>Unique Index</span>
            </label>
            <button type="button" id="add-idx-btn" class="btn-add-idx">
              <span class="material-symbols-outlined">add</span>
              <span>Add to List</span>
            </button>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button id="cancel-idx-btn" class="btn-secondary">Cancel</button>
        <button id="save-idx-btn" class="btn-primary">Save Changes</button>
      </div>
    </div>
  `;
   document.body.appendChild(modal);

   const closeFn = () => modal.remove();
   document.getElementById('close-idx-modal').onclick = closeFn;
   document.getElementById('cancel-idx-btn').onclick = closeFn;

   const renderChips = () => {
      const chipsContainer = document.getElementById('idx-chips-container');
      const clearBtn = document.getElementById('btn-clear-selected-cols');
      if (!chipsContainer) return;

      if (clearBtn) {
         if (selectedCols.length > 0) {
            clearBtn.classList.remove('hidden');
            clearBtn.onclick = () => {
               selectedCols = [];
               renderChips();
            };
         } else {
            clearBtn.classList.add('hidden');
         }
      }

      chipsContainer.innerHTML = schemaCols
         .map((col) => {
            const orderIdx = selectedCols.indexOf(col);
            const isSelected = orderIdx !== -1;
            const badge = isSelected
               ? `<span class="idx-chip-badge">${orderIdx + 1}</span>`
               : '';
            return `
          <div class="idx-chip ${isSelected ? 'selected' : ''}" data-col="${col}">
            ${badge}
            <span>${col}</span>
          </div>
        `;
         })
         .join('');

      chipsContainer.querySelectorAll('.idx-chip').forEach((chip) => {
         chip.onclick = () => {
            const col = chip.dataset.col;
            const idx = selectedCols.indexOf(col);
            if (idx !== -1) {
               selectedCols.splice(idx, 1);
            } else {
               selectedCols.push(col);
            }
            renderChips();
         };
      });
   };

   renderChips();

   const renderList = () => {
      const container = document.getElementById('idx-list-container');
      if (!container) return;

      if (activeIndexes.length === 0) {
         container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 24px 0; color: var(--color-text-soft);">
          <span class="material-symbols-outlined" style="font-size:32px; opacity:0.4; margin-bottom:6px;">dataset</span>
          <div style="font-size:12px;">No indexes defined for this table yet.</div>
        </div>
      `;
         return;
      }

      container.innerHTML = activeIndexes
         .map(
            (idx, i) => `
        <div class="idx-card">
          <div class="idx-card-info">
            <div class="idx-card-header">
              <span class="idx-name">${idx.name || 'unnamed_idx'}</span>
              ${
                 idx.isUnique
                    ? `<span class="badge-unique" style="font-size:10px; padding:1px 6px; line-height:14px;">UNIQUE</span>`
                    : ''
              }
            </div>
            <div class="idx-cols-tags">
              ${idx.columns.map((c) => `<span class="idx-col-pill">${c}</span>`).join('')}
            </div>
          </div>
          <button type="button" class="idx-del-btn delete-idx-btn" data-idx="${i}" title="Remove index">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      `,
         )
         .join('');

      container.querySelectorAll('.delete-idx-btn').forEach((btn) => {
         btn.onclick = (e) => {
            const i = parseInt(e.currentTarget.dataset.idx, 10);
            activeIndexes.splice(i, 1);
            renderList();
         };
      });
   };

   renderList();

   document.getElementById('add-idx-btn').onclick = () => {
      if (selectedCols.length === 0) {
         if (window.showToast) {
            window.showToast(
               'Please select at least one column for the index.',
               'warning',
            );
         } else {
            alert('Please select at least one column for the index.');
         }
         return;
      }

      const t = window.AppState?.currentTable || 'table';
      const rawName = document.getElementById('new-idx-name').value.trim();
      const name = rawName || `idx_${t}_${selectedCols.join('_')}`;
      const unique = document.getElementById('new-idx-unique').checked;

      activeIndexes.push({
         name,
         columns: [...selectedCols],
         isUnique: unique,
      });
      document.getElementById('new-idx-name').value = '';
      document.getElementById('new-idx-unique').checked = false;
      selectedCols = [];
      renderChips();
      renderList();
   };

   document.getElementById('save-idx-btn').onclick = () => {
      const newAdded = [];
      const newDropped = new Set();

      existingIndexes.forEach((idx) => {
         const found = activeIndexes.find(
            (a) =>
               a.name === idx.name &&
               JSON.stringify(a.columns) === JSON.stringify(idx.columns),
         );
         if (!found) {
            newDropped.add(idx.name);
         }
      });

      activeIndexes.forEach((idx) => {
         const found = existingIndexes.find(
            (e) =>
               e.name === idx.name &&
               JSON.stringify(e.columns) === JSON.stringify(idx.columns),
         );
         if (!found) {
            newAdded.push(idx);
         }
      });

      sg.pendingIndexEdits.added = newAdded;
      sg.pendingIndexEdits.dropped = Array.from(newDropped);

      window.updateSidebarDirtyState?.();
      window.renderSchemaGrid();
      closeFn();
   };
}

export async function openPkFkModal(td, currentText) {
   const sg = window.SchemaGrid;
   if (!sg) return;

   let modal = document.getElementById('pkfk-modal');
   if (modal) modal.remove();

   const isNewRow = td.dataset.insertIndex !== undefined;
   const insertIdx = isNewRow ? parseInt(td.dataset.insertIndex, 10) : null;
   const colName =
      td.dataset.pk ||
      td.parentElement
         ?.querySelector('[data-col-key="name"]')
         ?.textContent?.trim() ||
      '';

   // Get the current effective value (pending edits take precedence over original attribute)
   let effectiveVal = '';
   if (
      isNewRow &&
      insertIdx !== null &&
      window.SchemaGrid?.pendingInserts?.[insertIdx]
   ) {
      effectiveVal = window.SchemaGrid.pendingInserts[insertIdx].isPk || '';
   } else if (
      colName &&
      window.SchemaGrid?.pendingEdits?.[colName]?.isPk !== undefined
   ) {
      effectiveVal = window.SchemaGrid.pendingEdits[colName].isPk || '';
   } else {
      effectiveVal =
         currentText || td.textContent?.trim() || td.dataset.original || '';
   }

   let isPk = effectiveVal.includes('PK') || effectiveVal.includes('PFK');
   let isFk = false;
   let fkTable = '';
   let fkCol = '';
   let fkOnDelete = 'NO ACTION';
   let fkOnUpdate = 'NO ACTION';

   const origCol = (window.SchemaGrid?.schema || []).find(
      (c) => c.name === colName,
   );
   if (origCol?.fkTarget) {
      fkTable = origCol.fkTarget.table || '';
      fkCol = origCol.fkTarget.column || '';
      if (origCol.fkTarget.onDelete) fkOnDelete = origCol.fkTarget.onDelete;
      if (origCol.fkTarget.onUpdate) fkOnUpdate = origCol.fkTarget.onUpdate;
      isFk = true;
   }

   const pendingFk =
      isNewRow && insertIdx !== null
         ? window.SchemaGrid?.pendingInserts?.[insertIdx]?.fkTarget
         : colName
           ? window.SchemaGrid?.pendingEdits?.[colName]?.fkTarget
           : undefined;
   if (pendingFk) {
      if (pendingFk.table) fkTable = pendingFk.table;
      if (pendingFk.column) fkCol = pendingFk.column;
      if (pendingFk.onDelete) fkOnDelete = pendingFk.onDelete;
      if (pendingFk.onUpdate) fkOnUpdate = pendingFk.onUpdate;
      isFk = true;
   }

   const fkMatch = effectiveVal.match(
      /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)(?:\s*\((CASCADE|SET NULL|RESTRICT|NO ACTION)\))?/i,
   );
   if (fkMatch) {
      fkTable = fkMatch[1];
      fkCol = fkMatch[2];
      if (fkMatch[3]) fkOnDelete = fkMatch[3].toUpperCase();
      isFk = true;
   } else if (effectiveVal.includes('FK') || effectiveVal.includes('PFK')) {
      isFk = true;
   }

   modal = document.createElement('div');
   modal.id = 'pkfk-modal';
   modal.className = 'modal-overlay';

   modal.innerHTML = /* html */ `
    <div class="keys-modal-container">
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size:20px;">vpn_key</span>
          <h3 class="m-0 text-15 font-semibold">Manage Keys</h3>
          ${colName ? `<span class="keys-col-badge">${colName}</span>` : ''}
        </div>
        <button id="close-pkfk-modal" class="modal-close-btn" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div class="key-cards-list">
        <!-- Primary Key Card -->
        <div class="key-card ${isPk ? 'active' : ''}" id="pk-card">
          <div class="key-card-header" id="pk-card-toggle">
            <div class="key-card-icon pk">
              <span class="material-symbols-outlined">key</span>
            </div>
            <div class="key-card-content">
              <div class="key-card-title">Primary Key (PK)</div>
              <div class="key-card-desc">Uniquely identifies each record in this table</div>
            </div>
            <label class="key-switch" id="pk-switch-label">
              <input type="checkbox" id="modal-is-pk" ${isPk ? 'checked' : ''} />
              <span class="key-slider"></span>
            </label>
          </div>
        </div>

        <!-- Foreign Key Card -->
        <div class="key-card ${isFk ? 'active' : ''}" id="fk-card">
          <div class="key-card-header" id="fk-card-toggle">
            <div class="key-card-icon fk">
              <span class="material-symbols-outlined">link</span>
            </div>
            <div class="key-card-content">
              <div class="key-card-title">Foreign Key (FK)</div>
              <div class="key-card-desc">Reference a column in another table</div>
            </div>
            <label class="key-switch" id="fk-switch-label">
              <input type="checkbox" id="modal-is-fk" ${isFk ? 'checked' : ''} />
              <span class="key-slider"></span>
            </label>
          </div>

          <!-- FK Configuration Drawer -->
          <div id="fk-settings-container" class="key-fk-drawer ${isFk ? 'open' : ''}">
            <div class="key-field-group">
              <label class="key-field-label">Target Table</label>
              <button type="button" id="modal-fk-table" class="key-select" style="display: flex; justify-content: space-between; align-items: center; width: 100%; height: 32px; cursor: pointer; text-align: left; padding: 0 10px;">
                <span id="modal-fk-table-display" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fkTable || 'Select a table...'}</span>
                <span class="material-symbols-outlined key-select-arrow" style="font-size: 16px;">expand_more</span>
              </button>
            </div>

            <div class="key-field-group">
              <label class="key-field-label">Target Column</label>
              <button type="button" id="modal-fk-col" class="key-select" ${!fkTable ? 'disabled' : ''} style="display: flex; justify-content: space-between; align-items: center; width: 100%; height: 32px; cursor: pointer; text-align: left; padding: 0 10px;">
                <span id="modal-fk-col-display" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fkCol || (fkTable ? 'Select column...' : 'Select a table first')}</span>
                <span class="material-symbols-outlined key-select-arrow" style="font-size: 16px;">expand_more</span>
              </button>
            </div>

            <div class="key-field-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label class="key-field-label">On Delete</label>
                <button type="button" id="modal-fk-ondelete" class="key-select" style="display: flex; justify-content: space-between; align-items: center; width: 100%; height: 32px; cursor: pointer; text-align: left; padding: 0 10px;">
                  <span id="modal-fk-ondelete-display">${fkOnDelete || 'NO ACTION'}</span>
                  <span class="material-symbols-outlined key-select-arrow" style="font-size: 16px;">expand_more</span>
                </button>
              </div>
              <div>
                <label class="key-field-label">On Update</label>
                <button type="button" id="modal-fk-onupdate" class="key-select" style="display: flex; justify-content: space-between; align-items: center; width: 100%; height: 32px; cursor: pointer; text-align: left; padding: 0 10px;">
                  <span id="modal-fk-onupdate-display">${fkOnUpdate || 'NO ACTION'}</span>
                  <span class="material-symbols-outlined key-select-arrow" style="font-size: 16px;">expand_more</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button id="cancel-pkfk-btn" class="btn-secondary">Cancel</button>
        <button id="save-pkfk-btn" class="btn-primary flex items-center gap-1.5">
          <span class="material-symbols-outlined" style="font-size:16px;">check</span>
          <span>Save Changes</span>
        </button>
      </div>
    </div>
  `;
   document.body.appendChild(modal);

   const handleKeydown = (e) => {
      if (e.key === 'Escape') {
         closeFn();
      }
   };
   document.addEventListener('keydown', handleKeydown);

   const closeFn = () => {
      document.removeEventListener('keydown', handleKeydown);
      modal.remove();
   };

   document.getElementById('close-pkfk-modal').onclick = closeFn;
   document.getElementById('cancel-pkfk-btn').onclick = closeFn;
   modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFn();
   });

   const pkCard = document.getElementById('pk-card');
   const pkCheckbox = document.getElementById('modal-is-pk');
   const fkCard = document.getElementById('fk-card');
   const fkCheckbox = document.getElementById('modal-is-fk');
   const fkContainer = document.getElementById('fk-settings-container');
   const tableSelect = document.getElementById('modal-fk-table');
   const colSelect = document.getElementById('modal-fk-col');

   // Toggle PK on card header click
   document.getElementById('pk-card-toggle').addEventListener('click', (e) => {
      if (e.target.closest('.key-switch')) return;
      pkCheckbox.checked = !pkCheckbox.checked;
      pkCheckbox.dispatchEvent(new Event('change'));
   });

   pkCheckbox.addEventListener('change', () => {
      pkCard.classList.toggle('active', pkCheckbox.checked);
   });

   // Toggle FK on card header click
   document.getElementById('fk-card-toggle').addEventListener('click', (e) => {
      if (e.target.closest('.key-switch')) return;
      fkCheckbox.checked = !fkCheckbox.checked;
      fkCheckbox.dispatchEvent(new Event('change'));
   });

   let availableTables = [];

   let currentFkTable = fkTable || '';
   let currentFkCol = fkCol || '';
   let currentOnDelete = fkOnDelete || 'NO ACTION';
   let currentOnUpdate = fkOnUpdate || 'NO ACTION';
   let availableColumns = [];

   fkCheckbox.addEventListener('change', () => {
      const checked = fkCheckbox.checked;
      if (checked && availableTables.length === 0) {
         fkCheckbox.checked = false;
         fkCard.classList.remove('active');
         fkContainer.classList.remove('open');
         if (window.showToast) {
            window.showToast(
               'No other tables available in the database to link as a foreign key.',
               'warning',
            );
         } else {
            alert(
               'No other tables available in the database to link as a foreign key.',
            );
         }
         return;
      }

      fkCard.classList.toggle('active', checked);
      if (checked) {
         fkContainer.classList.add('open');
         // Auto-select first available table if none selected yet
         if (!currentFkTable && availableTables.length > 0) {
            const firstTable = availableTables[0];
            currentFkTable = firstTable;
            const disp = document.getElementById('modal-fk-table-display');
            if (disp) disp.textContent = firstTable;
            loadColumnsForTable(firstTable);
         }
      } else {
         fkContainer.classList.remove('open');
      }
   });

   // Load tables dynamically using fetch (avoids circular deps with api.js)
   try {
      const res = await fetch('/api/tables');
      const json = await res.json();
      if (json.success && json.data) {
         // Allow all tables including current table for self-referencing FKs (e.g. parent_id -> id)
         availableTables = json.data;

         if (currentFkTable && availableTables.includes(currentFkTable)) {
            loadColumnsForTable(currentFkTable, currentFkCol);
         }
      }
   } catch (err) {
      // ignore
   }

   async function loadColumnsForTable(tName, selectedCol = '') {
      colSelect.disabled = true;
      const colDisplay = document.getElementById('modal-fk-col-display');
      if (colDisplay) colDisplay.textContent = 'Loading columns...';
      try {
         const res = await fetch(`/api/tables/${encodeURIComponent(tName)}/schema`);
         const json = await res.json();
         if (json.success && json.data) {
            const currentTable = window.AppState?.currentTable;
            const cols =
               tName === currentTable
                  ? json.data.filter((c) => c.name !== colName)
                  : json.data;

            availableColumns = cols;

            let defaultCol = selectedCol;
            if (!defaultCol || !cols.some((c) => c.name === defaultCol)) {
               const idCol = cols.find(
                  (c) => c.isPk || c.name.toLowerCase() === 'id',
               );
               defaultCol = idCol ? idCol.name : cols[0]?.name || '';
            }

            currentFkCol = defaultCol;
            if (colDisplay)
               colDisplay.textContent = defaultCol || 'Select column...';
            colSelect.disabled = false;
         }
      } catch (err) {
         if (colDisplay) colDisplay.textContent = 'Error loading columns';
      }
   }

   tableSelect.onclick = (e) => {
      e.stopPropagation();
      openDropdownPicker({
         anchorEl: tableSelect,
         title: 'Select Target Table',
         searchable: true,
         placeholder: 'Search tables...',
         initialValue: currentFkTable,
         items: availableTables.map((t) => ({
            name: t,
            value: t,
            icon: 'table_chart',
         })),
         onSelect: (chosen) => {
            currentFkTable = chosen;
            const disp = document.getElementById('modal-fk-table-display');
            if (disp) disp.textContent = chosen;
            loadColumnsForTable(chosen);
         },
      });
   };

   colSelect.onclick = (e) => {
      e.stopPropagation();
      if (!currentFkTable || availableColumns.length === 0) return;
      openDropdownPicker({
         anchorEl: colSelect,
         title: `Columns in ${currentFkTable}`,
         searchable: true,
         placeholder: 'Search columns...',
         initialValue: currentFkCol,
         items: availableColumns.map((c) => ({
            name: c.name,
            value: c.name,
            icon: 'tag',
            desc: c.type || '',
         })),
         onSelect: (chosen) => {
            currentFkCol = chosen;
            const disp = document.getElementById('modal-fk-col-display');
            if (disp) disp.textContent = chosen;
         },
      });
   };

   const onDeleteBtn = document.getElementById('modal-fk-ondelete');
   const onUpdateBtn = document.getElementById('modal-fk-onupdate');

   if (onDeleteBtn) {
      onDeleteBtn.onclick = (e) => {
         e.stopPropagation();
         openDropdownPicker({
            anchorEl: onDeleteBtn,
            title: 'ON DELETE Action',
            searchable: false,
            initialValue: currentOnDelete,
            items: ['NO ACTION', 'CASCADE', 'RESTRICT', 'SET NULL'],
            onSelect: (val) => {
               currentOnDelete = val;
               const disp = document.getElementById(
                  'modal-fk-ondelete-display',
               );
               if (disp) disp.textContent = val;
            },
         });
      };
   }

   if (onUpdateBtn) {
      onUpdateBtn.onclick = (e) => {
         e.stopPropagation();
         openDropdownPicker({
            anchorEl: onUpdateBtn,
            title: 'ON UPDATE Action',
            searchable: false,
            initialValue: currentOnUpdate,
            items: ['NO ACTION', 'CASCADE', 'RESTRICT', 'SET NULL'],
            onSelect: (val) => {
               currentOnUpdate = val;
               const disp = document.getElementById(
                  'modal-fk-onupdate-display',
               );
               if (disp) disp.textContent = val;
            },
         });
      };
   }

   document.getElementById('save-pkfk-btn').onclick = () => {
      const pkChecked = pkCheckbox.checked;
      const fkChecked = fkCheckbox.checked;

      const t = currentFkTable;
      const c = currentFkCol;
      const chosenOnDelete = currentOnDelete || 'NO ACTION';
      const chosenOnUpdate = currentOnUpdate || 'NO ACTION';

      if (
         pkChecked === isPk &&
         fkChecked === isFk &&
         (!fkChecked ||
            (t === fkTable &&
               c === fkCol &&
               chosenOnDelete === fkOnDelete &&
               chosenOnUpdate === fkOnUpdate))
      ) {
         closeFn();
         return;
      }

      const actionTag =
         chosenOnDelete && chosenOnDelete !== 'NO ACTION'
            ? ` (${chosenOnDelete})`
            : '';

      let newVal = '';
      if (pkChecked && fkChecked) {
         if (!t || !c) {
            if (window.showToast) {
               window.showToast(
                  'Please select both Target Table and Target Column for the Foreign Key.',
                  'warning',
               );
            } else {
               alert(
                  'Please select both Target Table and Target Column for the Foreign Key.',
               );
            }
            return;
         }
         newVal = `PFK: ${t}.${c}${actionTag}`;
      } else if (pkChecked) {
         newVal = 'PK';
      } else if (fkChecked) {
         if (!t || !c) {
            if (window.showToast) {
               window.showToast(
                  'Please select both Target Table and Target Column for the Foreign Key.',
                  'warning',
               );
            } else {
               alert(
                  'Please select both Target Table and Target Column for the Foreign Key.',
               );
            }
            return;
         }
         newVal = `FK: ${t}.${c}${actionTag}`;
      }

      const fkObj =
         fkChecked && t && c
            ? {
                 table: t,
                 column: c,
                 onDelete:
                    chosenOnDelete !== 'NO ACTION' ? chosenOnDelete : undefined,
                 onUpdate:
                    chosenOnUpdate !== 'NO ACTION' ? chosenOnUpdate : undefined,
              }
            : null;

      if (isNewRow && insertIdx !== null) {
         if (!window.SchemaGrid.pendingInserts[insertIdx])
            window.SchemaGrid.pendingInserts[insertIdx] = {};
         window.SchemaGrid.pendingInserts[insertIdx].fkTarget = fkObj;
         window.SchemaGrid.pendingInserts[insertIdx].isPk = pkChecked;
      } else if (colName) {
         if (!window.SchemaGrid.pendingEdits[colName])
            window.SchemaGrid.pendingEdits[colName] = {};
         window.SchemaGrid.pendingEdits[colName].fkTarget = fkObj;
         window.SchemaGrid.pendingEdits[colName].isPk = pkChecked;
      }

      window.SchemaGrid.currentTransaction = [];
      const columns = [
         'name',
         'type',
         'isPk',
         'nullable',
         'defaultValue',
         'indexing',
      ];
      updateSchemaCell(td, newVal, columns);
      if (window.SchemaGrid.currentTransaction.length > 0)
         window.SchemaGrid.history.push(window.SchemaGrid.currentTransaction);
      window.SchemaGrid.currentTransaction = null;

      closeFn();
   };
}

export async function openEnumModal(td, origCol) {
   const sg = window.SchemaGrid;
   if (!sg) return;

   let modal = document.getElementById('enum-modal');
   if (modal) modal.remove();

   const isNewRow = td.dataset.insertIndex !== undefined;
   const insertIdx = isNewRow ? parseInt(td.dataset.insertIndex, 10) : null;
   const colName =
      td.dataset.pk ||
      td.parentElement
         ?.querySelector('[data-col-key="name"]')
         ?.textContent?.trim() ||
      'column';

   const dbType = (window.AppState?.dbType || 'sqlite').toLowerCase();

   // Retrieve existing values
   let currentValues = [];
   let currentTypeName = '';
   let isNewEnum = true;

   const pendingObj = isNewRow
      ? sg.pendingInserts?.[insertIdx]
      : sg.pendingEdits?.[colName];

   if (pendingObj?.enumValues && pendingObj.enumValues.length > 0) {
      currentValues = [...pendingObj.enumValues];
      currentTypeName = pendingObj.type || '';
      isNewEnum = pendingObj.isNewEnum !== false;
   } else if (origCol?.enumValues && origCol.enumValues.length > 0) {
      currentValues = [...origCol.enumValues];
      currentTypeName = origCol.type || '';
      isNewEnum = !origCol.isExistingEnum;
   }

   if (!currentTypeName) {
      currentTypeName =
         colName && colName !== 'column'
            ? colName.charAt(0).toUpperCase() + colName.slice(1) + 'Enum'
            : 'CustomEnum';
   }

   let cachedEnums = [];
   try {
      const res = await fetchDatabaseEnums();
      if (res?.success && Array.isArray(res.data)) {
         cachedEnums = res.data;
      }
   } catch (e) {
      console.warn('Failed to load database enums:', e);
   }

   modal = document.createElement('div');
   modal.id = 'enum-modal';
   modal.className = 'modal-overlay';

   const dialectInfo =
      dbType === 'sqlite'
         ? 'SQLite enforces enums using a <code>CHECK(col IN (...))</code> table constraint.'
         : dbType === 'postgres'
           ? 'PostgreSQL creates custom ENUM types using <code>CREATE TYPE ... AS ENUM (...)</code>.'
           : 'MySQL stores enums as native <code>ENUM(...)</code> column types.';

   const hasExistingEnums = cachedEnums.length > 0;
   let selectedExistingEnum = cachedEnums.find(
      (e) => e.name.toLowerCase() === currentTypeName.toLowerCase(),
   );

   modal.innerHTML = /* html */ `
    <div class="keys-modal-container" style="width: 520px;">
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size:20px;">list_alt</span>
          <h3 class="m-0 text-15 font-semibold">Configure ENUM Column</h3>
          <span class="keys-col-badge">${colName}</span>
          <span class="snippet-param-badge">${dbType}</span>
        </div>
        <button id="close-enum-modal" class="modal-close-btn" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div class="key-cards-list" style="gap: 14px;">
        <div style="font-size: 11.5px; color: var(--color-text-secondary); line-height: 1.5; background: var(--color-bg-secondary-dark); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--color-border);">
          ${dialectInfo}
        </div>

        ${
           hasExistingEnums
              ? `
        <div class="table-fk-popover-field">
          <label style="font-size: 11px; font-weight: 500; color: var(--color-text-secondary);">Enum Source</label>
          <button type="button" id="modal-enum-source" class="table-col-select" style="display: flex; justify-content: space-between; align-items: center; width: 100%; height: 32px; cursor: pointer; text-align: left; padding: 0 10px;">
            <span id="modal-enum-source-display" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${selectedExistingEnum ? selectedExistingEnum.name : '+ Define New Enum...'}</span>
            <span class="material-symbols-outlined table-col-select-arrow" style="font-size: 16px;">expand_more</span>
          </button>
        </div>
        `
              : ''
        }

        <div id="modal-enum-custom-fields" class="flex flex-col gap-3">
          <div>
            <label style="font-size: 11px; font-weight: 500; color: var(--color-text-secondary); display: block; margin-bottom: 5px;">
              Enum Name ${dbType === 'postgres' ? '<span style="color: var(--color-error);">*</span>' : '(Optional)'}
            </label>
            <input type="text" id="modal-enum-name" class="modal-input w-full" style="padding: 7px 10px; font-size: 12px; font-family: var(--font-mono);" placeholder="e.g. OrderStatus" value="${currentTypeName}" />
          </div>

          <div>
            <label style="font-size: 11px; font-weight: 500; color: var(--color-text-secondary); display: block; margin-bottom: 5px;">
              Allowed Values (comma separated) <span style="color: var(--color-error);">*</span>
            </label>
            <input type="text" id="modal-enum-values" class="modal-input w-full" style="padding: 7px 10px; font-size: 12px; font-family: var(--font-mono);" placeholder="e.g. PENDING, PAID, CANCELLED, REFUNDED" value="${currentValues.join(', ')}" />
            <span style="font-size: 10.5px; color: var(--color-text-soft); margin-top: 4px; display: block;">Separate values with commas. Quotes are optional.</span>
          </div>
        </div>

        <!-- SQL DDL Preview -->
        <div>
          <label style="font-size: 11px; font-weight: 500; color: var(--color-text-secondary); display: block; margin-bottom: 5px;">
            Preview
          </label>
          <div style="background: var(--color-bg-secondary-dark); border: 1px solid var(--color-border); border-radius: 6px; padding: 10px 12px; font-family: var(--font-mono); font-size: 11.5px; color: var(--color-text); word-break: break-all; min-height: 38px; display: flex; align-items: center;" id="modal-enum-preview">
            -
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button id="cancel-enum-btn" class="btn-secondary">Cancel</button>
        <button id="save-enum-btn" class="btn-primary flex items-center gap-1.5">
          <span class="material-symbols-outlined" style="font-size:16px;">check</span>
          <span>Apply Enum</span>
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
      if (e.key === 'Escape') closeFn();
   };
   document.addEventListener('keydown', handleKeydown);

   document.getElementById('close-enum-modal').onclick = closeFn;
   document.getElementById('cancel-enum-btn').onclick = closeFn;
   modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFn();
   });

   const sourceSel = document.getElementById('modal-enum-source');
   const customFields = document.getElementById('modal-enum-custom-fields');
   const nameInp = document.getElementById('modal-enum-name');
   const valuesInp = document.getElementById('modal-enum-values');
   const previewEl = document.getElementById('modal-enum-preview');

   let currentEnumSource = selectedExistingEnum
      ? selectedExistingEnum.name
      : '__NEW__';

   function getParsedValues() {
      if (sourceSel && currentEnumSource !== '__NEW__') {
         const found = cachedEnums.find((e) => e.name === currentEnumSource);
         return found ? [...found.values] : [];
      }
      return valuesInp.value
         .split(',')
         .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
         .filter(Boolean);
   }

   function updatePreview() {
      const vals = getParsedValues();
      const rawName = (
         nameInp.value.trim() ||
         currentTypeName ||
         'CustomEnum'
      ).trim();
      const valsJoined = vals
         .map((v) => `'${v.replace(/'/g, "''")}'`)
         .join(', ');

      if (vals.length === 0) {
         previewEl.textContent = 'Enter enum values above to see SQL preview';
         return;
      }

      if (dbType === 'sqlite') {
         previewEl.textContent = `TEXT CHECK("${colName}" IN (${valsJoined}))`;
      } else if (dbType === 'postgres') {
         if (sourceSel && currentEnumSource !== '__NEW__') {
            previewEl.textContent = `Type: "${currentEnumSource}" (Values: ${valsJoined})`;
         } else {
            previewEl.textContent = `CREATE TYPE "${rawName}" AS ENUM (${valsJoined});`;
         }
      } else {
         previewEl.textContent = `ENUM(${valsJoined})`;
      }
   }

   if (sourceSel) {
      sourceSel.onclick = (e) => {
         e.stopPropagation();
         const items = [
            {
               name: '+ Define New Enum...',
               value: '__NEW__',
               icon: 'add_circle',
            },
            ...cachedEnums.map((ce) => ({
               name: ce.name,
               value: ce.name,
               desc:
                  ce.values.slice(0, 3).join(', ') +
                  (ce.values.length > 3 ? '...' : ''),
               icon: 'list',
               group: 'Existing Database Enums',
            })),
         ];

         openDropdownPicker({
            anchorEl: sourceSel,
            title: 'Select Enum Source',
            searchable: true,
            placeholder: 'Search enum types...',
            initialValue: currentEnumSource,
            items,
            onSelect: (val) => {
               currentEnumSource = val;
               const disp = document.getElementById(
                  'modal-enum-source-display',
               );
               if (disp)
                  disp.textContent =
                     val === '__NEW__' ? '+ Define New Enum...' : val;
               if (val === '__NEW__') {
                  customFields.style.display = 'flex';
               } else {
                  customFields.style.display = 'none';
               }
               updatePreview();
            },
         });
      };
      if (currentEnumSource !== '__NEW__') {
         customFields.style.display = 'none';
      }
   }

   nameInp.oninput = updatePreview;
   valuesInp.oninput = updatePreview;
   updatePreview();

   document.getElementById('save-enum-btn').onclick = () => {
      const vals = getParsedValues();
      if (vals.length === 0) {
         if (window.showToast) {
            window.showToast(
               'Please specify at least one enum value.',
               'error',
            );
         } else {
            alert('Please specify at least one enum value.');
         }
         valuesInp.focus();
         return;
      }

      let chosenName = '';
      let isNew = true;

      if (sourceSel && currentEnumSource !== '__NEW__') {
         chosenName = currentEnumSource;
         isNew = false;
      } else {
         chosenName = (
            nameInp.value.trim() ||
            currentTypeName ||
            'CustomEnum'
         ).trim();
         isNew = true;
      }

      const effectiveType =
         dbType === 'postgres' ? chosenName : chosenName || 'ENUM';

      if (isNewRow && insertIdx !== null) {
         if (!sg.pendingInserts[insertIdx]) sg.pendingInserts[insertIdx] = {};
         sg.pendingInserts[insertIdx].type = effectiveType;
         sg.pendingInserts[insertIdx].enumValues = vals;
         sg.pendingInserts[insertIdx].isNewEnum = isNew;
      } else if (colName) {
         if (!sg.pendingEdits[colName]) sg.pendingEdits[colName] = {};
         sg.pendingEdits[colName].type = effectiveType;
         sg.pendingEdits[colName].enumValues = vals;
         sg.pendingEdits[colName].isNewEnum = isNew;
      }

      window.SchemaGrid.currentTransaction = [];
      const columns = [
         'name',
         'type',
         'isPk',
         'nullable',
         'isUnique',
         'defaultValue',
         'indexing',
      ];
      updateSchemaCell(td, effectiveType, columns);
      if (window.SchemaGrid.currentTransaction.length > 0)
         window.SchemaGrid.history.push(window.SchemaGrid.currentTransaction);
      window.SchemaGrid.currentTransaction = null;

      closeFn();
      window.updateSidebarDirtyState?.();
      window.showToast?.('Enum column configured!', 'success');
   };
}

export function openRenameTableModal(tableName) {
   if (!tableName) return;

   let modal = document.getElementById('rename-table-modal');
   if (modal) modal.remove();

   modal = document.createElement('div');
   modal.id = 'rename-table-modal';
   modal.className = 'modal-overlay';
   modal.innerHTML = /* html */ `
     <div class="keys-modal-container" style="max-width: 440px; width: 100%;">
       <div class="modal-header">
         <div class="flex items-center gap-2">
           <span class="material-symbols-outlined text-primary" style="font-size: 20px;">edit_note</span>
           <h3 class="m-0 text-15 font-semibold">Rename Table</h3>
         </div>
         <button id="close-rename-modal" class="modal-close-btn" title="Close">
           <span class="material-symbols-outlined">close</span>
         </button>
       </div>

       <div style="padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px;">
         <div style="font-size: 13px; color: var(--color-text-soft);">
           Rename table <code style="font-family: monospace; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: var(--color-text-main); font-weight: 600;">${tableName}</code> to a new name.
         </div>

         <div>
           <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: var(--color-text-main);">
             New Table Name
           </label>
           <input
             type="text"
             id="input-rename-table"
             class="key-select"
             style="width: 100%; height: 36px; padding: 0 12px; font-size: 13px; font-family: monospace; outline: none;"
             value="${tableName}"
             placeholder="e.g. new_table_name"
             autocomplete="off"
             spellcheck="false"
           />
           <div id="rename-table-error" style="color: #ef4444; font-size: 12px; margin-top: 6px; display: none;"></div>
         </div>
       </div>

       <div class="modal-footer" style="padding: 12px 20px;">
         <button id="cancel-rename-btn" class="btn-secondary">Cancel</button>
         <button id="submit-rename-btn" class="btn-primary flex items-center gap-1.5">
           <span class="material-symbols-outlined" style="font-size: 16px;">check</span>
           <span>Rename</span>
         </button>
       </div>
     </div>
   `;

   document.body.appendChild(modal);

   const input = document.getElementById('input-rename-table');
   const errorEl = document.getElementById('rename-table-error');
   const submitBtn = document.getElementById('submit-rename-btn');
   const closeBtn = document.getElementById('close-rename-modal');
   const cancelBtn = document.getElementById('cancel-rename-btn');

   const closeFn = () => {
      document.removeEventListener('keydown', handleKeydown);
      modal.remove();
   };

   const handleKeydown = (e) => {
      if (e.key === 'Escape') closeFn();
      if (e.key === 'Enter') handleRename();
   };
   document.addEventListener('keydown', handleKeydown);

   closeBtn.onclick = closeFn;
   cancelBtn.onclick = closeFn;
   modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFn();
   });

   const showError = (msg) => {
      if (errorEl) {
         errorEl.textContent = msg;
         errorEl.style.display = 'block';
      }
   };

   const handleRename = async () => {
      const newName = input.value.trim();
      if (!newName) {
         showError('Table name cannot be empty');
         input.focus();
         return;
      }
      if (newName === tableName) {
         showError('New table name must be different');
         input.focus();
         return;
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
         showError('Table name must start with a letter or underscore and contain only letters, numbers, and underscores');
         input.focus();
         return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-symbols-outlined spin" style="font-size:16px;">progress_activity</span><span>Renaming...</span>';

      try {
         const res = await renameTableApi(tableName, newName);
         if (res.success) {
            closeFn();
            window.showToast?.(`Table "${tableName}" renamed to "${newName}" successfully!`, 'success');

            // Update AppState and cached states
            if (window.AppState.currentTable === tableName) {
               window.AppState.currentTable = newName;
            }
            if (window.TableStates?.[tableName]) {
               window.TableStates[newName] = window.TableStates[tableName];
               delete window.TableStates[tableName];
            }

            if (window.refreshTableList) {
               await window.refreshTableList(true);
               setTimeout(() => {
                  const newBtn = document.querySelector(`.table-btn[data-table="${newName}"]`);
                  if (newBtn) {
                     newBtn.click();
                  } else {
                     window.AppState.currentTable = newName;
                     window.renderCurrentView?.();
                  }
               }, 40);
            }
         } else {
            showError(res.error || 'Failed to rename table');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">check</span><span>Rename</span>';
         }
      } catch (err) {
         showError(err.message || 'Network error');
         submitBtn.disabled = false;
         submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">check</span><span>Rename</span>';
      }
   };

   submitBtn.onclick = handleRename;

   setTimeout(() => {
      input.focus();
      input.select();
   }, 50);
}

window.openRenameTableModal = openRenameTableModal;

export function openCascadeConfirmModal({
   tableName,
   colName,
   oldType,
   newType,
   dependents = [],
   needsReindexing = false,
   onConfirm,
}) {
   let modal = document.getElementById('cascade-confirm-modal');
   if (modal) modal.remove();

   modal = document.createElement('div');
   modal.id = 'cascade-confirm-modal';
   modal.className = 'modal-overlay';

   const depsRowsHtml = dependents
      .map(
         (d) => `
      <tr style="border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.06)); font-size: 12px;">
        <td style="padding: 8px 10px; font-family: monospace; font-weight: 600; color: var(--color-text-main);">
          ${d.table}.${d.column}
        </td>
        <td style="padding: 8px 10px; color: var(--color-text-soft);">
          <span style="font-family: monospace; background: rgba(255,255,255,0.06); padding: 2px 5px; border-radius: 3px;">${d.currentType || 'UNKNOWN'}</span>
          <span style="margin: 0 4px; color: var(--color-text-subtle);">→</span>
          <span style="font-family: monospace; background: rgba(99,102,241,0.15); color: #818cf8; padding: 2px 5px; border-radius: 3px; font-weight: 600;">${newType}</span>
        </td>
      </tr>
   `,
      )
      .join('');

   const reindexNoticeHtml = needsReindexing
      ? `
      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 10px 12px; display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: #fbbf24;">
        <span class="material-symbols-outlined" style="font-size: 18px; margin-top: 1px; flex-shrink: 0;">swap_vertical_circle</span>
        <div>
          <div style="font-weight: 600; margin-bottom: 2px;">Smart Sequential Re-indexing Required</div>
          <div style="color: var(--color-text-soft); line-height: 1.4;">
            Existing rows contain non-numeric string values. Drixio will safely map them to sequential IDs (1, 2, 3...) across both <code>${tableName}</code> and all referencing tables in a single transaction before modifying column types.
          </div>
        </div>
      </div>
   `
      : '';

   modal.innerHTML = /* html */ `
     <div class="modal-container" style="max-width: 520px; width: 90vw; background: var(--color-surface, #1e1e24); border-radius: 8px; border: 1px solid var(--color-border, #333); box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; display: flex; flex-direction: column;">
       <div class="modal-header" style="padding: 14px 20px; border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.06)); display: flex; justify-content: space-between; align-items: center;">
         <div class="flex items-center gap-2">
           <span class="material-symbols-outlined text-warning" style="font-size: 20px; color: #f59e0b;">sync_alt</span>
           <h3 class="m-0 text-15 font-semibold">Cascade Foreign Key Type Migration</h3>
         </div>
         <button id="close-cascade-modal" class="modal-close-btn" title="Close">
           <span class="material-symbols-outlined">close</span>
         </button>
       </div>

       <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; max-height: 400px; overflow-y: auto;">
         <div style="font-size: 13px; color: var(--color-text-main); line-height: 1.5;">
           Changing primary key <code style="font-family: monospace; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-weight: 600;">${tableName}.${colName}</code> from 
           <span style="font-family: monospace; color: #ef4444;">${oldType}</span> to <span style="font-family: monospace; color: #10b981; font-weight: 600;">${newType}</span>
           will automatically cascade and update foreign keys in <strong>${dependents.length}</strong> referencing table(s):
         </div>

         <div style="border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.08)); border-radius: 6px; overflow: hidden;">
           <table style="width: 100%; border-collapse: collapse; text-align: left;">
             <thead>
               <tr style="background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.08)); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-subtle);">
                 <th style="padding: 8px 10px;">Referencing Foreign Key</th>
                 <th style="padding: 8px 10px;">Type Update</th>
               </tr>
             </thead>
             <tbody>
               ${depsRowsHtml}
             </tbody>
           </table>
         </div>

         ${reindexNoticeHtml}
       </div>

       <div class="modal-footer" style="padding: 12px 20px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--color-border-subtle, rgba(255,255,255,0.06)); background: rgba(0,0,0,0.1);">
         <button id="cancel-cascade-btn" class="btn-secondary">Cancel</button>
         <button id="submit-cascade-btn" class="btn-primary flex items-center gap-1.5" style="background: #4f46e5;">
           <span class="material-symbols-outlined" style="font-size: 16px;">bolt</span>
           <span>Confirm & Cascade Migration</span>
         </button>
       </div>
     </div>
   `;

   document.body.appendChild(modal);

   const closeBtn = document.getElementById('close-cascade-modal');
   const cancelBtn = document.getElementById('cancel-cascade-btn');
   const submitBtn = document.getElementById('submit-cascade-btn');

   const closeFn = () => modal.remove();

   closeBtn.onclick = closeFn;
   cancelBtn.onclick = closeFn;
   modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFn();
   });

   submitBtn.onclick = () => {
      closeFn();
      if (onConfirm) onConfirm();
   };
}

window.openCascadeConfirmModal = openCascadeConfirmModal;

