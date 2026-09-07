import { createTableApi, fetchTables } from '../../lib/api.js';

/**
 * Visual Table Creation Wizard Modal
 */
export function openCreateTableModal(onSuccess) {
   let modal = document.getElementById('create-table-modal');
   if (modal) modal.remove();

   const dbType = (window.AppState?.dbType || 'sqlite').toLowerCase();

   // Default column type options based on dialect
   const defaultTypes = [
      'INTEGER',
      'VARCHAR(255)',
      'TEXT',
      'BOOLEAN',
      'TIMESTAMP',
      'NUMERIC',
      'JSON',
      'BLOB',
   ];

   let columns = [
      {
         name: 'id',
         type: 'INTEGER',
         primaryKey: true,
         nullable: false,
         defaultValue: '',
      },
      {
         name: 'name',
         type: 'VARCHAR(255)',
         primaryKey: false,
         nullable: true,
         defaultValue: '',
      },
   ];

   modal = document.createElement('div');
   modal.id = 'create-table-modal';
   modal.className = 'modal-overlay';

   modal.innerHTML = /* html */ `
    <div class="modal-container" style="width: 720px; max-width: 95vw; display: flex; flex-direction: column; background: var(--color-bg-primary); border-radius: 12px; border: 1px solid var(--color-border); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); overflow: hidden;">
      <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border);">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size: 20px; color: var(--color-primary);">add_circle</span>
          <h3 class="m-0 text-15 font-semibold" style="margin: 0; font-size: 15px; font-weight: 600; color: var(--color-text);">Create New Table</h3>
          <span class="badge-type" style="font-size: 10px; padding: 2px 7px; border-radius: 4px; background: rgba(59, 130, 246, 0.12); color: var(--color-primary); font-weight: 700; text-transform: uppercase;">${dbType}</span>
        </div>
        <button type="button" id="close-create-table-modal-btn" class="modal-close-btn" title="Close" style="background: transparent; border: none; cursor: pointer; color: var(--color-text-soft);">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="modal-body-scroll" style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: calc(85vh - 130px); overflow-y: auto;">
        <!-- Table Name Field -->
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: var(--color-text); margin-bottom: 6px;">
            Table Name <span style="color: #ef4444;">*</span>
          </label>
          <input type="text" id="new-table-name-input" class="modal-input" placeholder="e.g. users, products, orders" style="width: 100%; box-sizing: border-box; padding: 9px 12px; font-size: 13px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-bg-secondary); color: var(--color-text); outline: none;" autofocus />
          <span id="table-name-error" style="display: none; font-size: 11px; color: #ef4444; margin-top: 4px;"></span>
        </div>

        <!-- Columns Section -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <label style="font-size: 12px; font-weight: 600; color: var(--color-text);">
              Columns Definition (<span id="column-count-label">${columns.length}</span>)
            </label>
            <button type="button" id="btn-add-column-row" class="btn-secondary" style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 6px;">
              <span class="material-symbols-outlined" style="font-size: 15px;">add</span>
              <span>Add Column</span>
            </button>
          </div>

          <!-- Column Header Grid -->
          <div style="display: grid; grid-template-columns: 2fr 2fr 70px 70px 2fr 36px; gap: 8px; padding: 6px 10px; background: var(--color-bg-secondary-dark); border-radius: 6px 6px 0 0; border: 1px solid var(--color-border); font-size: 11px; font-weight: 600; color: var(--color-text-soft);">
            <div>Column Name</div>
            <div>Type</div>
            <div style="text-align: center;">Primary Key</div>
            <div style="text-align: center;">Nullable</div>
            <div>Default Value</div>
            <div></div>
          </div>

          <!-- Column Rows Container -->
          <div id="create-table-columns-container" style="border: 1px solid var(--color-border); border-top: none; border-radius: 0 0 6px 6px;">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>

      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--color-border);">
        <button type="button" id="cancel-create-table-btn" class="btn-secondary" style="padding: 7px 16px; border-radius: 6px; cursor: pointer;">Cancel</button>
        <button type="button" id="submit-create-table-btn" class="header-btn primary" style="padding: 7px 20px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 16px;">check</span>
          <span id="submit-create-table-text">Create Table</span>
        </button>
      </div>
    </div>
  `;

   document.body.appendChild(modal);

   const container = document.getElementById('create-table-columns-container');
   const nameInput = document.getElementById('new-table-name-input');
   const countLabel = document.getElementById('column-count-label');
   const submitBtn = document.getElementById('submit-create-table-btn');
   const submitText = document.getElementById('submit-create-table-text');
   const nameError = document.getElementById('table-name-error');

   function renderRows() {
      container.innerHTML = '';
      countLabel.textContent = columns.length.toString();

      columns.forEach((col, index) => {
         const row = document.createElement('div');
         row.style.cssText =
            'display: grid; grid-template-columns: 2fr 2fr 70px 70px 2fr 36px; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--color-border); align-items: center; background: var(--color-bg-primary);';

         row.innerHTML = /* html */ `
        <div>
          <input type="text" class="col-name-input" data-index="${index}" value="${col.name}" placeholder="col_name" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg-secondary); color: var(--color-text);" />
        </div>
        <div>
          <select class="col-type-select" data-index="${index}" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg-secondary); color: var(--color-text);">
            ${defaultTypes
               .map(
                  (t) =>
                     `<option value="${t}" ${t === col.type.toUpperCase() ? 'selected' : ''}>${t}</option>`,
               )
               .join('')}
          </select>
        </div>
        <div style="display: flex; justify-content: center;">
          <input type="checkbox" class="col-pk-check" data-index="${index}" ${col.primaryKey ? 'checked' : ''} title="Primary Key" />
        </div>
        <div style="display: flex; justify-content: center;">
          <input type="checkbox" class="col-null-check" data-index="${index}" ${col.nullable ? 'checked' : ''} title="Nullable" ${col.primaryKey ? 'disabled' : ''} />
        </div>
        <div>
          <input type="text" class="col-default-input" data-index="${index}" value="${col.defaultValue || ''}" placeholder="NULL or value" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg-secondary); color: var(--color-text);" />
        </div>
        <div style="display: flex; justify-content: center;">
          <button type="button" class="btn-del-col" data-index="${index}" title="Remove Column" style="background: transparent; border: none; cursor: pointer; color: var(--color-text-soft); padding: 2px;" ${columns.length <= 1 ? 'disabled' : ''}>
            <span class="material-symbols-outlined" style="font-size: 17px; color: ${columns.length <= 1 ? 'var(--color-border)' : '#ef4444'};">delete</span>
          </button>
        </div>
      `;

         // Bind row inputs
         row.querySelector('.col-name-input').oninput = (e) => {
            columns[index].name = e.target.value.trim();
         };
         row.querySelector('.col-type-select').onchange = (e) => {
            columns[index].type = e.target.value;
         };
         row.querySelector('.col-pk-check').onchange = (e) => {
            const isPk = e.target.checked;
            columns[index].primaryKey = isPk;
            if (isPk) {
               columns[index].nullable = false;
            }
            renderRows();
         };
         row.querySelector('.col-null-check').onchange = (e) => {
            columns[index].nullable = e.target.checked;
         };
         row.querySelector('.col-default-input').oninput = (e) => {
            columns[index].defaultValue = e.target.value.trim();
         };
         const delBtn = row.querySelector('.btn-del-col');
         if (delBtn && columns.length > 1) {
            delBtn.onclick = () => {
               columns.splice(index, 1);
               renderRows();
            };
         }

         container.appendChild(row);
      });
   }

   renderRows();

   // Add column button
   document.getElementById('btn-add-column-row').onclick = () => {
      columns.push({
         name: `column_${columns.length + 1}`,
         type: 'VARCHAR(255)',
         primaryKey: false,
         nullable: true,
         defaultValue: '',
      });
      renderRows();
   };

   const closeFn = () => {
      document.removeEventListener('keydown', handleKeydown);
      modal.remove();
   };

   const handleKeydown = (e) => {
      if (e.key === 'Escape') closeFn();
   };

   document.addEventListener('keydown', handleKeydown);
   document.getElementById('close-create-table-modal-btn').onclick = closeFn;
   document.getElementById('cancel-create-table-btn').onclick = closeFn;

   // Submit Create Table
   submitBtn.onclick = async () => {
      nameError.style.display = 'none';
      const tableName = nameInput.value.trim();

      if (!tableName) {
         nameError.textContent = 'Table name cannot be empty.';
         nameError.style.display = 'block';
         nameInput.focus();
         return;
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
         nameError.textContent =
            'Table name must start with a letter/underscore and contain only alphanumeric characters.';
         nameError.style.display = 'block';
         nameInput.focus();
         return;
      }

      // Check duplicate column names
      const colNames = new Set();
      for (const col of columns) {
         if (!col.name) {
            alert('All column names must be non-empty.');
            return;
         }
         const lower = col.name.toLowerCase();
         if (colNames.has(lower)) {
            alert(`Duplicate column name "${col.name}".`);
            return;
         }
         colNames.add(lower);
      }

      submitBtn.disabled = true;
      submitText.textContent = 'Creating...';

      try {
         const payloadColumns = columns.map((c) => ({
            name: c.name,
            type: c.type,
            primaryKey: !!c.primaryKey,
            nullable: c.primaryKey ? false : c.nullable !== false,
            defaultValue: c.defaultValue || undefined,
         }));

         const res = await createTableApi(tableName, payloadColumns);

         if (res.success) {
            closeFn();
            window.showToast?.(
               `Table "${tableName}" created successfully!`,
               'success',
            );

            // Refresh table list and select newly created table
            if (window.refreshTableList) {
               await window.refreshTableList(true);
               // Find and click the newly created table
               setTimeout(() => {
                  const newBtn = document.querySelector(
                     `.table-btn[data-table="${tableName}"]`,
                  );
                  if (newBtn) {
                     newBtn.click();
                  } else {
                     window.AppState.currentTable = tableName;
                     window.handleSwitchTab('schema-btn');
                  }
               }, 100);
            }

            if (onSuccess) onSuccess(tableName);
         } else {
            alert(`Failed to create table: ${res.error || 'Unknown error'}`);
         }
      } catch (err) {
         alert(`Error: ${err.message}`);
      } finally {
         submitBtn.disabled = false;
         submitText.textContent = 'Create Table';
      }
   };
}
