import { updateSchemaCell } from './core.js';

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

   const fkMatch = effectiveVal.match(
      /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i,
   );
   if (fkMatch) {
      fkTable = fkMatch[1];
      fkCol = fkMatch[2];
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
              <div class="key-select-wrapper">
                <select id="modal-fk-table" class="key-select">
                  <option value="">Loading tables...</option>
                </select>
                <span class="material-symbols-outlined key-select-arrow">expand_more</span>
              </div>
            </div>

            <div class="key-field-group">
              <label class="key-field-label">Target Column</label>
              <div class="key-select-wrapper">
                <select id="modal-fk-col" class="key-select" ${!fkTable ? 'disabled' : ''}>
                  <option value="">Select a table first</option>
                </select>
                <span class="material-symbols-outlined key-select-arrow">expand_more</span>
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
         if (!tableSelect.value && availableTables.length > 0) {
            const firstTable = availableTables[0];
            tableSelect.value = firstTable;
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
         const currentTable = window.AppState?.currentTable;
         // Exclude current table so FK cannot reference columns within its own table
         availableTables = json.data.filter((t) => t !== currentTable);

         tableSelect.innerHTML =
            (availableTables.length === 0
               ? '<option value="">No other tables available</option>'
               : '<option value="">-- Select Table --</option>') +
            availableTables
               .map(
                  (t) =>
                     `<option value="${t}" ${t === fkTable ? 'selected' : ''}>${t}</option>`,
               )
               .join('');

         if (fkTable && availableTables.includes(fkTable)) {
            loadColumnsForTable(fkTable, fkCol);
         }
      }
   } catch (err) {
      tableSelect.innerHTML = '<option value="">Error loading tables</option>';
   }

   async function loadColumnsForTable(tName, selectedCol = '') {
      colSelect.disabled = true;
      colSelect.innerHTML = '<option value="">Loading columns...</option>';
      try {
         const res = await fetch(`/api/tables/${tName}/schema`);
         const json = await res.json();
         if (json.success && json.data) {
            const currentTable = window.AppState?.currentTable;
            const cols =
               tName === currentTable
                  ? json.data.filter((c) => c.name !== colName)
                  : json.data;

            let defaultCol = selectedCol;
            if (!defaultCol || !cols.some((c) => c.name === defaultCol)) {
               const idCol = cols.find(
                  (c) => c.isPk || c.name.toLowerCase() === 'id',
               );
               defaultCol = idCol ? idCol.name : cols[0]?.name || '';
            }

            colSelect.innerHTML =
               '<option value="">-- Select Column --</option>' +
               cols
                  .map(
                     (c) =>
                        `<option value="${c.name}" ${c.name === defaultCol ? 'selected' : ''}>${c.name}</option>`,
                  )
                  .join('');
            colSelect.disabled = false;
         }
      } catch (err) {
         colSelect.innerHTML =
            '<option value="">Error loading columns</option>';
      }
   }

   tableSelect.addEventListener('change', (e) => {
      const t = e.target.value;
      if (t) {
         loadColumnsForTable(t);
      } else {
         colSelect.innerHTML = '<option value="">Select a table first</option>';
         colSelect.disabled = true;
      }
   });

   document.getElementById('save-pkfk-btn').onclick = () => {
      const pkChecked = pkCheckbox.checked;
      const fkChecked = fkCheckbox.checked;

      const t = tableSelect.value;
      const c = colSelect.value;

      if (
         pkChecked === isPk &&
         fkChecked === isFk &&
         (!fkChecked || (t === fkTable && c === fkCol))
      ) {
         closeFn();
         return;
      }

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
         newVal = `PFK: ${t}.${c}`;
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
         newVal = `FK: ${t}.${c}`;
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
