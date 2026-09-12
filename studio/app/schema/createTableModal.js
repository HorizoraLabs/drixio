import {
   createTableApi,
   fetchTables,
   fetchTableSchema,
   fetchDatabaseEnums,
} from '../../lib/api.js';
import {
   STANDARD_DATA_TYPES,
   formatSqlDefaultValue,
} from '../../lib/dataTypes.js';

/**
 * Visual Table Creation Wizard Modal with Foreign Key, Unique, Presets & Live SQL Preview
 */
export function openCreateTableModal(onSuccess) {
   let modal = document.getElementById('create-table-modal');
   if (modal) modal.remove();

   const dbType = (window.AppState?.dbType || 'sqlite').toLowerCase();

   // Default column type options based on dialect
   const defaultTypes = STANDARD_DATA_TYPES;

   let columns = [
      {
         name: 'id',
         type: 'INTEGER',
         primaryKey: true,
         nullable: false,
         isUnique: false,
         defaultValue: '',
         fkTarget: null,
      },
      {
         name: 'name',
         type: 'VARCHAR(255)',
         primaryKey: false,
         nullable: true,
         isUnique: false,
         defaultValue: '',
         fkTarget: null,
      },
   ];

   let cachedTables = [];
   let cachedEnums = [];
   let tableColumnsCache = {};
   let activeFkIndex = null;

   // Preload available database tables for Foreign Key selection
   fetchTables()
      .then((tables) => {
         if (Array.isArray(tables)) {
            cachedTables = tables;
         }
      })
      .catch((e) => console.warn('Failed to preload tables for FK:', e));

   // Preload existing user-defined enums for reuse
   fetchDatabaseEnums()
      .then((res) => {
         if (res?.success && Array.isArray(res.data)) {
            cachedEnums = res.data;
            renderRows();
            updateSqlPreview();
         }
      })
      .catch((e) => console.warn('Failed to preload enums:', e));

   modal = document.createElement('div');
   modal.id = 'create-table-modal';
   modal.className = 'modal-overlay';

   modal.innerHTML = /* html */ `
    <div class="modal-container create-table-modal-container">
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size: 20px;">add_circle</span>
          <h3 class="m-0 text-15 font-semibold">Create New Table</h3>
          <span class="snippet-param-badge">${dbType}</span>
        </div>
        <button type="button" id="close-create-table-modal-btn" class="modal-close-btn" title="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="create-table-modal-body" id="create-table-modal-body">
        <!-- Table Name Field -->
        <div class="table-form-group">
          <label class="table-form-label">
            <span>Table Name <span style="color: var(--color-error);">*</span></span>
          </label>
          <input type="text" id="new-table-name-input" class="table-name-input" placeholder="e.g. users, products, orders" autofocus />
          <span id="table-name-error" style="display: none; font-size: 11px; color: var(--color-error); margin-top: 4px;"></span>
        </div>

        <!-- Quick Presets -->
        <div class="table-presets-bar">
          <span class="table-preset-label">Quick Add:</span>
          <button type="button" id="preset-add-timestamps" class="table-preset-btn" title="Add created_at and updated_at timestamp columns">
            <span class="material-symbols-outlined" style="font-size: 13px;">schedule</span>
            <span>+ Timestamps</span>
          </button>
          <button type="button" id="preset-add-softdelete" class="table-preset-btn" title="Add deleted_at nullable timestamp column">
            <span class="material-symbols-outlined" style="font-size: 13px;">delete_sweep</span>
            <span>+ Soft Delete</span>
          </button>
          <button type="button" id="preset-add-uuid-pk" class="table-preset-btn" title="Change primary key to UUID">
            <span class="material-symbols-outlined" style="font-size: 13px;">fingerprint</span>
            <span>+ UUID PK</span>
          </button>
        </div>

        <!-- Columns Section -->
        <div class="table-form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <label class="table-form-label">
              <span>Columns Definition (<span id="column-count-label">${columns.length}</span>)</span>
            </label>
            <button type="button" id="btn-add-column-row" class="btn-secondary" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11.5px; border-radius: 6px; cursor: pointer;">
              <span class="material-symbols-outlined" style="font-size: 14px;">add</span>
              <span>Add Column</span>
            </button>
          </div>

          <!-- Column Header Grid -->
          <div class="table-columns-header-grid">
            <div>Column Name</div>
            <div>Type</div>
            <div style="text-align: center;">PK</div>
            <div style="text-align: center;">Null</div>
            <div style="text-align: center;">Unique</div>
            <div>Default</div>
            <div>Foreign Key</div>
            <div style="text-align: center;">Actions</div>
          </div>

          <!-- Column Rows Container -->
          <div id="create-table-columns-container" class="table-columns-body-container">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- Live SQL Preview Section -->
        <div class="table-sql-preview-section" id="table-sql-preview-section">
          <div class="table-sql-preview-header" id="table-sql-preview-toggle">
            <div class="table-sql-preview-title">
              <span class="material-symbols-outlined text-primary">terminal</span>
              <span>SQL Preview (DDL)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="material-symbols-outlined" id="table-sql-preview-arrow" style="font-size: 16px; color: var(--color-text-soft);">expand_less</span>
            </div>
          </div>
          <div class="table-sql-code-container">
            <button type="button" id="copy-table-sql-btn" class="table-sql-copy-btn">
              <span class="material-symbols-outlined" style="font-size: 13px;">content_copy</span>
              <span>Copy</span>
            </button>
            <pre id="table-sql-preview-code" class="table-sql-code-block"></pre>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" id="cancel-create-table-btn" class="btn-secondary">Cancel</button>
        <button type="button" id="submit-create-table-btn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 6px;">
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
   const sqlCodeBlock = document.getElementById('table-sql-preview-code');
   const sqlSection = document.getElementById('table-sql-preview-section');
   const sqlToggle = document.getElementById('table-sql-preview-toggle');
   const sqlArrow = document.getElementById('table-sql-preview-arrow');
   const copySqlBtn = document.getElementById('copy-table-sql-btn');

   // Toggle preview collapse
   sqlToggle.onclick = () => {
      const isCollapsed = sqlSection.classList.toggle('collapsed');
      sqlArrow.textContent = isCollapsed ? 'expand_more' : 'expand_less';
   };

   copySqlBtn.onclick = () => {
      if (sqlCodeBlock.textContent) {
         navigator.clipboard.writeText(sqlCodeBlock.textContent);
         window.showToast?.('SQL copied to clipboard!', 'success');
      }
   };

   function quoteIdent(name) {
      if (dbType === 'mysql') return `\`${name}\``;
      return `"${name}"`;
   }

   function updateSqlPreview() {
      const tableName = (nameInput.value.trim() || 'table_name').trim();
      const lines = [];
      const createTypeLines = [];

      // Pre-create any new PostgreSQL ENUM types
      if (dbType === 'postgres') {
         columns.forEach((col) => {
            if (col.isNewEnum && col.enumValues && col.enumValues.length > 0) {
               const eName = (
                  col.newEnumName ||
                  col.type ||
                  'CustomEnum'
               ).trim();
               const vals = col.enumValues
                  .map((v) => `'${v.replace(/'/g, "''")}'`)
                  .join(', ');
               createTypeLines.push(
                  `CREATE TYPE ${quoteIdent(eName)} AS ENUM (${vals});`,
               );
            }
         });
      }

      columns.forEach((col) => {
         const colName = col.name ? quoteIdent(col.name) : '"column"';
         const tLower = (col.type || 'VARCHAR(255)').toLowerCase();
         let typeStr = col.type || 'VARCHAR(255)';
         const hasEnumValues = col.enumValues && col.enumValues.length > 0;

         if (dbType === 'sqlite') {
            if (hasEnumValues) {
               const vals = col.enumValues
                  .map((v) => `'${v.replace(/'/g, "''")}'`)
                  .join(', ');
               typeStr = `TEXT CHECK(${colName} IN (${vals}))`;
            } else if (tLower === 'integer' || tLower === 'int')
               typeStr = 'INTEGER';
            else if (tLower === 'text' || tLower === 'string') typeStr = 'TEXT';
            else if (tLower.startsWith('varchar'))
               typeStr = col.type.toUpperCase();
            else if (tLower === 'boolean' || tLower === 'bool')
               typeStr = 'BOOLEAN';
            else if (
               ['decimal', 'numeric', 'float', 'double', 'real'].includes(
                  tLower,
               ) ||
               tLower.startsWith('decimal')
            )
               typeStr = 'REAL';
            else if (tLower === 'date') typeStr = 'DATE';
            else if (tLower === 'datetime' || tLower === 'timestamp')
               typeStr = 'DATETIME';
            else if (tLower === 'blob') typeStr = 'BLOB';
            else if (tLower === 'json') typeStr = 'TEXT';
            else if (tLower === 'uuid') typeStr = 'TEXT';

            if (
               col.primaryKey &&
               (tLower.includes('int') || typeStr === 'INTEGER')
            ) {
               typeStr = 'INTEGER PRIMARY KEY AUTOINCREMENT';
            } else if (col.primaryKey) {
               typeStr += ' PRIMARY KEY';
            } else {
               if (!col.nullable) typeStr += ' NOT NULL';
               if (col.isUnique) typeStr += ' UNIQUE';
            }
         } else if (dbType === 'postgres') {
            if (col.primaryKey && (tLower === 'integer' || tLower === 'int')) {
               typeStr = 'SERIAL PRIMARY KEY';
            } else {
               if (hasEnumValues || col.isExistingEnum || col.isNewEnum) {
                  const eName = col.isNewEnum
                     ? col.newEnumName || col.type || 'CustomEnum'
                     : col.type;
                  typeStr = quoteIdent(eName);
               } else if (tLower === 'integer' || tLower === 'int')
                  typeStr = 'INTEGER';
               else if (tLower === 'text' || tLower === 'string')
                  typeStr = 'TEXT';
               else if (tLower.startsWith('varchar'))
                  typeStr = col.type.toUpperCase();
               else if (tLower === 'boolean' || tLower === 'bool')
                  typeStr = 'BOOLEAN';
               else if (
                  tLower === 'decimal' ||
                  tLower === 'numeric' ||
                  tLower.startsWith('decimal')
               )
                  typeStr = col.type.toUpperCase().includes('(')
                     ? col.type.toUpperCase()
                     : 'NUMERIC';
               else if (tLower === 'datetime' || tLower === 'timestamp')
                  typeStr = 'TIMESTAMP';
               else if (tLower === 'date') typeStr = 'DATE';
               else if (tLower === 'real') typeStr = 'REAL';
               else if (tLower === 'json') typeStr = 'JSONB';
               else if (tLower === 'blob') typeStr = 'BYTEA';
               else if (tLower === 'uuid') typeStr = 'UUID';

               if (col.primaryKey) typeStr += ' PRIMARY KEY';
               if (!col.nullable && !col.primaryKey) typeStr += ' NOT NULL';
               if (col.isUnique && !col.primaryKey) typeStr += ' UNIQUE';
            }
         } else {
            // MySQL
            if (hasEnumValues) {
               const vals = col.enumValues
                  .map((v) => `'${v.replace(/'/g, "''")}'`)
                  .join(', ');
               typeStr = `ENUM(${vals})`;
            } else if (tLower === 'integer' || tLower === 'int')
               typeStr = 'INT';
            else if (tLower === 'text' || tLower === 'string') typeStr = 'TEXT';
            else if (tLower.startsWith('varchar'))
               typeStr = col.type.toUpperCase();
            else if (tLower === 'boolean' || tLower === 'bool')
               typeStr = 'BOOLEAN';
            else if (
               tLower === 'decimal' ||
               tLower === 'numeric' ||
               tLower.startsWith('decimal')
            )
               typeStr = col.type.toUpperCase().includes('(')
                  ? col.type.toUpperCase()
                  : 'DECIMAL(10,2)';
            else if (tLower === 'datetime' || tLower === 'timestamp')
               typeStr = 'DATETIME';
            else if (tLower === 'date') typeStr = 'DATE';
            else if (tLower === 'real') typeStr = 'FLOAT';
            else if (tLower === 'json') typeStr = 'JSON';
            else if (tLower === 'blob') typeStr = 'BLOB';
            else if (tLower === 'uuid') typeStr = 'VARCHAR(36)';

            if (
               col.primaryKey &&
               (tLower.includes('int') || typeStr === 'INT')
            ) {
               typeStr += ' AUTO_INCREMENT PRIMARY KEY';
            } else if (col.primaryKey) {
               typeStr += ' PRIMARY KEY';
            }

            if (!col.nullable && !col.primaryKey) typeStr += ' NOT NULL';
            if (col.isUnique && !col.primaryKey) typeStr += ' UNIQUE';
         }

         if (col.defaultValue && !col.defaultValue.startsWith('FK ->')) {
            const formattedDef = formatSqlDefaultValue(col.defaultValue);
            if (formattedDef !== null) {
               typeStr += ` DEFAULT ${formattedDef}`;
            }
         }

         lines.push(`  ${colName} ${typeStr}`);
      });

      // Foreign Keys
      columns.forEach((col) => {
         if (col.fkTarget && col.fkTarget.table && col.fkTarget.column) {
            let fkStr = `  FOREIGN KEY (${quoteIdent(col.name || 'col')}) REFERENCES ${quoteIdent(col.fkTarget.table)}(${quoteIdent(col.fkTarget.column)})`;
            if (
               col.fkTarget.onDelete &&
               col.fkTarget.onDelete !== 'NO ACTION'
            ) {
               fkStr += ` ON DELETE ${col.fkTarget.onDelete}`;
            }
            if (
               col.fkTarget.onUpdate &&
               col.fkTarget.onUpdate !== 'NO ACTION'
            ) {
               fkStr += ` ON UPDATE ${col.fkTarget.onUpdate}`;
            }
            lines.push(fkStr);
         }
      });

      let ddl = '';
      if (createTypeLines.length > 0) {
         ddl += createTypeLines.join('\n') + '\n\n';
      }
      ddl += `CREATE TABLE ${quoteIdent(tableName)} (\n${lines.join(',\n')}\n);`;
      sqlCodeBlock.textContent = ddl;
   }

   function renderRows() {
      container.innerHTML = '';
      countLabel.textContent = columns.length.toString();

      columns.forEach((col, index) => {
         const row = document.createElement('div');
         row.className = 'table-column-row';

         const hasFk = !!(
            col.fkTarget &&
            col.fkTarget.table &&
            col.fkTarget.column
         );
         const actionTag =
            hasFk &&
            col.fkTarget.onDelete &&
            col.fkTarget.onDelete !== 'NO ACTION'
               ? ` (${col.fkTarget.onDelete})`
               : '';
         const fkLabel = hasFk
            ? `${col.fkTarget.table}.${col.fkTarget.column}${actionTag}`
            : '+ FK';

         let existingEnumsHtml = '';
         if (cachedEnums && cachedEnums.length > 0) {
            existingEnumsHtml = `
              <optgroup label="Existing Enums">
                ${cachedEnums
                   .map((ce) => {
                      const isSel = !col.isNewEnum && col.type === ce.name;
                      const preview =
                         ce.values.slice(0, 3).join(', ') +
                         (ce.values.length > 3 ? '...' : '');
                      return `<option value="__ENUM_EXISTING__:${ce.name}" ${isSel ? 'selected' : ''}>${ce.name} (${preview})</option>`;
                   })
                   .join('')}
              </optgroup>`;
         }

         const standardOptionsHtml = `
              <optgroup label="Standard Types">
                ${defaultTypes
                   .map((t) => {
                      if (t === 'ENUM') {
                         return `<option value="__NEW_ENUM__" ${col.isNewEnum ? 'selected' : ''}>ENUM (Custom...)</option>`;
                      }
                      const isSel =
                         !col.isNewEnum &&
                         !col.isExistingEnum &&
                         t === (col.type || '').toUpperCase();
                      return `<option value="${t}" ${isSel ? 'selected' : ''}>${t}</option>`;
                   })
                   .join('')}
              </optgroup>`;

         const customEnumOptionHtml = '';

         let newEnumPanelHtml = '';
         if (col.isNewEnum) {
            const eName = col.newEnumName || col.type || '';
            const eValues =
               col.newEnumValuesStr ||
               (col.enumValues ? col.enumValues.join(', ') : '');
            newEnumPanelHtml = `
            <div class="col-new-enum-panel" data-index="${index}">
              <div class="col-new-enum-field">
                <span class="col-new-enum-label">
                  <span class="material-symbols-outlined" style="font-size: 14px;">label</span>
                  <span>Enum Name:</span>
                </span>
                <input type="text" class="table-col-input new-enum-name-input" data-index="${index}" placeholder="e.g. OrderStatus" value="${eName}" />
              </div>
              <div class="col-new-enum-field" style="flex: 1;">
                <span class="col-new-enum-label">
                  <span class="material-symbols-outlined" style="font-size: 14px;">list</span>
                  <span>Values:</span>
                </span>
                <input type="text" class="table-col-input new-enum-values-input" data-index="${index}" placeholder="e.g. PENDING, PAID, CANCELLED" value="${eValues}" />
              </div>
            </div>`;
         }

         row.innerHTML = /* html */ `
        <div>
          <input type="text" class="table-col-input col-name-input" data-index="${index}" value="${col.name}" placeholder="column_name" />
        </div>
        <div>
          <div class="table-col-select-wrap">
            <select class="table-col-select col-type-select" data-index="${index}">
              ${standardOptionsHtml}
              ${existingEnumsHtml}
              ${customEnumOptionHtml}
            </select>
            <span class="material-symbols-outlined table-col-select-arrow">expand_more</span>
          </div>
        </div>
        <div style="display: flex; justify-content: center; align-items: center;">
          <input type="checkbox" class="table-col-checkbox col-pk-check" data-index="${index}" ${col.primaryKey ? 'checked' : ''} title="Primary Key" />
        </div>
        <div style="display: flex; justify-content: center; align-items: center;">
          <input type="checkbox" class="table-col-checkbox col-null-check" data-index="${index}" ${col.nullable ? 'checked' : ''} title="Nullable" ${col.primaryKey ? 'disabled' : ''} />
        </div>
        <div style="display: flex; justify-content: center; align-items: center;">
          <input type="checkbox" class="table-col-checkbox col-unique-check" data-index="${index}" ${col.isUnique ? 'checked' : ''} title="Unique" ${col.primaryKey ? 'disabled' : ''} />
        </div>
        <div>
          <input type="text" class="table-col-input col-default-input" data-index="${index}" value="${col.defaultValue || ''}" placeholder="NULL, 'val'..." />
        </div>
        <div class="table-col-fk-wrap" data-index="${index}">
          <button type="button" class="table-col-fk-btn col-fk-btn ${hasFk ? 'is-active' : ''}" data-index="${index}" title="${hasFk ? `Foreign Key: ${fkLabel}` : 'Configure Foreign Key'}">
            <span class="material-symbols-outlined">${hasFk ? 'link' : 'add_link'}</span>
            <span style="overflow: hidden; text-overflow: ellipsis;">${fkLabel}</span>
          </button>
          <div class="table-fk-popover" id="fk-popover-${index}" style="display: ${activeFkIndex === index ? 'flex' : 'none'};">
            <div class="table-fk-popover-title">
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-primary" style="font-size: 15px;">link</span>
                <span>Foreign Key Target</span>
              </span>
              <button type="button" class="modal-close-btn fk-popover-close" style="width: 20px; height: 20px;" title="Close">
                <span class="material-symbols-outlined" style="font-size: 14px;">close</span>
              </button>
            </div>
            <div class="table-fk-popover-field">
              <label>Target Table</label>
              <div class="table-col-select-wrap">
                <select class="table-col-select fk-target-table-select">
                  <option value="">-- Select Table --</option>
                  ${cachedTables
                     .map(
                        (tbl) =>
                           `<option value="${tbl}" ${col.fkTarget?.table === tbl ? 'selected' : ''}>${tbl}</option>`,
                     )
                     .join('')}
                </select>
                <span class="material-symbols-outlined table-col-select-arrow">expand_more</span>
              </div>
            </div>
            <div class="table-fk-popover-field">
              <label>Target Column</label>
              <div class="table-col-select-wrap">
                <select class="table-col-select fk-target-column-select" ${!col.fkTarget?.table ? 'disabled' : ''}>
                  <option value="">-- Select Column --</option>
                </select>
                <span class="material-symbols-outlined table-col-select-arrow">expand_more</span>
              </div>
            </div>
            <div class="table-fk-popover-grid-2">
              <div class="table-fk-popover-field">
                <label>On Delete</label>
                <div class="table-col-select-wrap">
                  <select class="table-col-select fk-on-delete-select">
                    <option value="NO ACTION" ${!col.fkTarget?.onDelete || col.fkTarget?.onDelete === 'NO ACTION' ? 'selected' : ''}>NO ACTION</option>
                    <option value="CASCADE" ${col.fkTarget?.onDelete === 'CASCADE' ? 'selected' : ''}>CASCADE</option>
                    <option value="SET NULL" ${col.fkTarget?.onDelete === 'SET NULL' ? 'selected' : ''}>SET NULL</option>
                    <option value="RESTRICT" ${col.fkTarget?.onDelete === 'RESTRICT' ? 'selected' : ''}>RESTRICT</option>
                  </select>
                  <span class="material-symbols-outlined table-col-select-arrow">expand_more</span>
                </div>
              </div>
              <div class="table-fk-popover-field">
                <label>On Update</label>
                <div class="table-col-select-wrap">
                  <select class="table-col-select fk-on-update-select">
                    <option value="NO ACTION" ${!col.fkTarget?.onUpdate || col.fkTarget?.onUpdate === 'NO ACTION' ? 'selected' : ''}>NO ACTION</option>
                    <option value="CASCADE" ${col.fkTarget?.onUpdate === 'CASCADE' ? 'selected' : ''}>CASCADE</option>
                    <option value="RESTRICT" ${col.fkTarget?.onUpdate === 'RESTRICT' ? 'selected' : ''}>RESTRICT</option>
                    <option value="SET NULL" ${col.fkTarget?.onUpdate === 'SET NULL' ? 'selected' : ''}>SET NULL</option>
                  </select>
                  <span class="material-symbols-outlined table-col-select-arrow">expand_more</span>
                </div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
              <button type="button" class="btn-secondary fk-clear-btn" style="padding: 3px 8px; font-size: 11px; color: var(--color-error);" ${!hasFk ? 'disabled' : ''}>Clear FK</button>
              <button type="button" class="btn-primary fk-done-btn" style="padding: 3px 10px; font-size: 11px;">Done</button>
            </div>
          </div>
        </div>
        <div style="display: flex; justify-content: center; align-items: center; gap: 3px;">
          <button type="button" class="table-col-action-btn btn-move-up" data-index="${index}" title="Move Column Up" ${index === 0 ? 'disabled' : ''}>
            <span class="material-symbols-outlined">arrow_upward</span>
          </button>
          <button type="button" class="table-col-action-btn btn-move-down" data-index="${index}" title="Move Column Down" ${index === columns.length - 1 ? 'disabled' : ''}>
            <span class="material-symbols-outlined">arrow_downward</span>
          </button>
          <button type="button" class="table-col-action-btn btn-del-col" data-index="${index}" title="Remove Column" ${columns.length <= 1 ? 'disabled' : ''}>
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
        ${newEnumPanelHtml}
      `;

         // Bind row inputs
         const nameInp = row.querySelector('.col-name-input');
         nameInp.oninput = (e) => {
            columns[index].name = e.target.value.trim();
            updateSqlPreview();
         };

         const typeSel = row.querySelector('.col-type-select');
         typeSel.onchange = (e) => {
            const val = e.target.value;
            if (val === '__NEW_ENUM__') {
               columns[index].isNewEnum = true;
               columns[index].isExistingEnum = false;
               if (!columns[index].newEnumName) {
                  const guessed = columns[index].name
                     ? columns[index].name.charAt(0).toUpperCase() +
                       columns[index].name.slice(1) +
                       'Enum'
                     : 'CustomEnum';
                  columns[index].newEnumName = guessed;
                  columns[index].type = guessed;
               }
               if (!columns[index].enumValues) columns[index].enumValues = [];
            } else if (val.startsWith('__ENUM_EXISTING__:')) {
               const eName = val.slice('__ENUM_EXISTING__:'.length);
               columns[index].isNewEnum = false;
               columns[index].isExistingEnum = true;
               columns[index].type = eName;
               const found = cachedEnums.find((ce) => ce.name === eName);
               columns[index].enumValues = found ? [...found.values] : [];
            } else {
               columns[index].isNewEnum = false;
               columns[index].isExistingEnum = false;
               columns[index].type = val;
               columns[index].enumValues = undefined;
            }
            renderRows();
            updateSqlPreview();
         };

         const enumNameInp = row.querySelector('.new-enum-name-input');
         if (enumNameInp) {
            enumNameInp.oninput = (e) => {
               const nameVal = e.target.value.trim();
               columns[index].newEnumName = nameVal;
               columns[index].type = nameVal || 'CustomEnum';
               updateSqlPreview();
            };
         }

         const enumValuesInp = row.querySelector('.new-enum-values-input');
         if (enumValuesInp) {
            enumValuesInp.oninput = (e) => {
               const raw = e.target.value;
               columns[index].newEnumValuesStr = raw;
               columns[index].enumValues = raw
                  .split(',')
                  .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
                  .filter(Boolean);
               updateSqlPreview();
            };
         }

         const pkChk = row.querySelector('.col-pk-check');
         pkChk.onchange = (e) => {
            const isPk = e.target.checked;
            columns[index].primaryKey = isPk;
            if (isPk) {
               columns[index].nullable = false;
               columns[index].isUnique = false;
            }
            renderRows();
            updateSqlPreview();
         };

         const nullChk = row.querySelector('.col-null-check');
         nullChk.onchange = (e) => {
            columns[index].nullable = e.target.checked;
            updateSqlPreview();
         };

         const uniqChk = row.querySelector('.col-unique-check');
         uniqChk.onchange = (e) => {
            columns[index].isUnique = e.target.checked;
            updateSqlPreview();
         };

         const defInp = row.querySelector('.col-default-input');
         defInp.oninput = (e) => {
            columns[index].defaultValue = e.target.value.trim();
            updateSqlPreview();
         };

         // FK Popover Interactions
         const fkBtn = row.querySelector('.col-fk-btn');
         const fkPopover = row.querySelector('.table-fk-popover');
         const fkTableSelect = row.querySelector('.fk-target-table-select');
         const fkColSelect = row.querySelector('.fk-target-column-select');
         const fkOnDeleteSelect = row.querySelector('.fk-on-delete-select');
         const fkOnUpdateSelect = row.querySelector('.fk-on-update-select');
         const fkCloseBtn = row.querySelector('.fk-popover-close');
         const fkClearBtn = row.querySelector('.fk-clear-btn');
         const fkDoneBtn = row.querySelector('.fk-done-btn');

         async function loadTableColumns(tableName, selectCol) {
            if (!tableName) {
               fkColSelect.innerHTML =
                  '<option value="">-- Select Column --</option>';
               fkColSelect.disabled = true;
               return;
            }

            fkColSelect.disabled = false;
            fkColSelect.innerHTML =
               '<option value="">Loading columns...</option>';

            if (tableColumnsCache[tableName]) {
               populateColOptions(tableColumnsCache[tableName], selectCol);
               return;
            }

            try {
               const schema = await fetchTableSchema(tableName);
               if (Array.isArray(schema)) {
                  tableColumnsCache[tableName] = schema.map((c) => c.name);
               } else if (schema && Array.isArray(schema.columns)) {
                  tableColumnsCache[tableName] = schema.columns.map(
                     (c) => c.name,
                  );
               } else {
                  tableColumnsCache[tableName] = ['id'];
               }
               populateColOptions(tableColumnsCache[tableName], selectCol);
            } catch (err) {
               fkColSelect.innerHTML = '<option value="id">id</option>';
            }
         }

         function populateColOptions(cols, selectCol) {
            fkColSelect.innerHTML =
               '<option value="">-- Select Column --</option>';
            cols.forEach((colName) => {
               const opt = document.createElement('option');
               opt.value = colName;
               opt.textContent = colName;
               if (selectCol && selectCol === colName) {
                  opt.selected = true;
               } else if (!selectCol && colName.toLowerCase() === 'id') {
                  opt.selected = true;
               }
               fkColSelect.appendChild(opt);
            });
         }

         fkBtn.onclick = (e) => {
            e.stopPropagation();
            if (activeFkIndex === index) {
               activeFkIndex = null;
               fkPopover.style.display = 'none';
            } else {
               activeFkIndex = index;
               renderRows();
               const openedPopover = document.getElementById(
                  `fk-popover-${index}`,
               );
               if (openedPopover) {
                  const targetTbl = col.fkTarget?.table || '';
                  const targetCol = col.fkTarget?.column || '';
                  if (targetTbl) {
                     loadTableColumns(targetTbl, targetCol);
                  }
                  const curBtn = document.querySelector(
                     `.col-fk-btn[data-index="${index}"]`,
                  );
                  if (curBtn) {
                     const rect = curBtn.getBoundingClientRect();
                     openedPopover.style.top = `${rect.bottom + 4}px`;
                     openedPopover.style.left = `${Math.max(10, Math.min(rect.right - 270, window.innerWidth - 280))}px`;
                  }
               }
            }
         };

         fkCloseBtn.onclick = (e) => {
            e.stopPropagation();
            activeFkIndex = null;
            fkPopover.style.display = 'none';
         };

         fkTableSelect.onchange = (e) => {
            const chosenTable = e.target.value;
            loadTableColumns(chosenTable, null);
         };

         fkClearBtn.onclick = (e) => {
            e.stopPropagation();
            columns[index].fkTarget = null;
            activeFkIndex = null;
            renderRows();
            updateSqlPreview();
         };

         fkDoneBtn.onclick = (e) => {
            e.stopPropagation();
            const chosenTable = fkTableSelect.value;
            const chosenCol = fkColSelect.value;
            const chosenOnDelete = fkOnDeleteSelect?.value;
            const chosenOnUpdate = fkOnUpdateSelect?.value;
            if (chosenTable && chosenCol) {
               columns[index].fkTarget = {
                  table: chosenTable,
                  column: chosenCol,
                  onDelete:
                     chosenOnDelete !== 'NO ACTION'
                        ? chosenOnDelete
                        : undefined,
                  onUpdate:
                     chosenOnUpdate !== 'NO ACTION'
                        ? chosenOnUpdate
                        : undefined,
               };
            } else {
               columns[index].fkTarget = null;
            }
            activeFkIndex = null;
            renderRows();
            updateSqlPreview();
         };

         // Move Up Button
         const upBtn = row.querySelector('.btn-move-up');
         if (upBtn && index > 0) {
            upBtn.onclick = (e) => {
               e.stopPropagation();
               const temp = columns[index];
               columns[index] = columns[index - 1];
               columns[index - 1] = temp;
               if (activeFkIndex !== null) activeFkIndex = null;
               renderRows();
               updateSqlPreview();
            };
         }

         // Move Down Button
         const downBtn = row.querySelector('.btn-move-down');
         if (downBtn && index < columns.length - 1) {
            downBtn.onclick = (e) => {
               e.stopPropagation();
               const temp = columns[index];
               columns[index] = columns[index + 1];
               columns[index + 1] = temp;
               if (activeFkIndex !== null) activeFkIndex = null;
               renderRows();
               updateSqlPreview();
            };
         }

         // Delete Column Button
         const delBtn = row.querySelector('.btn-del-col');
         if (delBtn && columns.length > 1) {
            delBtn.onclick = (e) => {
               e.stopPropagation();
               columns.splice(index, 1);
               if (activeFkIndex === index) activeFkIndex = null;
               renderRows();
               updateSqlPreview();
            };
         }

         container.appendChild(row);
      });
   }

   renderRows();
   updateSqlPreview();

   nameInput.oninput = () => {
      updateSqlPreview();
   };

   container.onscroll = () => {
      if (activeFkIndex !== null) {
         activeFkIndex = null;
         renderRows();
      }
   };

   // Add column button
   document.getElementById('btn-add-column-row').onclick = () => {
      columns.push({
         name: `column_${columns.length + 1}`,
         type: 'VARCHAR(255)',
         primaryKey: false,
         nullable: true,
         isUnique: false,
         defaultValue: '',
         fkTarget: null,
      });
      renderRows();
      updateSqlPreview();
      setTimeout(() => {
         container.scrollTop = container.scrollHeight;
      }, 20);
   };

   // Quick Presets Handlers
   document.getElementById('preset-add-timestamps').onclick = () => {
      const names = columns.map((c) => c.name.toLowerCase());
      if (!names.includes('created_at')) {
         columns.push({
            name: 'created_at',
            type: 'TIMESTAMP',
            primaryKey: false,
            nullable: false,
            isUnique: false,
            defaultValue: 'CURRENT_TIMESTAMP',
            fkTarget: null,
         });
      }
      if (!names.includes('updated_at')) {
         columns.push({
            name: 'updated_at',
            type: 'TIMESTAMP',
            primaryKey: false,
            nullable: false,
            isUnique: false,
            defaultValue: 'CURRENT_TIMESTAMP',
            fkTarget: null,
         });
      }
      renderRows();
      updateSqlPreview();
      setTimeout(() => {
         container.scrollTop = container.scrollHeight;
      }, 20);
   };

   document.getElementById('preset-add-softdelete').onclick = () => {
      const names = columns.map((c) => c.name.toLowerCase());
      if (!names.includes('deleted_at')) {
         columns.push({
            name: 'deleted_at',
            type: 'TIMESTAMP',
            primaryKey: false,
            nullable: true,
            isUnique: false,
            defaultValue: '',
            fkTarget: null,
         });
      }
      renderRows();
      updateSqlPreview();
      setTimeout(() => {
         container.scrollTop = container.scrollHeight;
      }, 20);
   };

   document.getElementById('preset-add-uuid-pk').onclick = () => {
      const pkIndex = columns.findIndex((c) => c.primaryKey);
      if (pkIndex !== -1) {
         columns[pkIndex].name = 'id';
         columns[pkIndex].type = 'VARCHAR(36)';
      } else {
         columns.unshift({
            name: 'id',
            type: 'VARCHAR(36)',
            primaryKey: true,
            nullable: false,
            isUnique: false,
            defaultValue: '',
            fkTarget: null,
         });
      }
      renderRows();
      updateSqlPreview();
   };

   // Close popover when clicking outside
   const handleDocumentClick = (e) => {
      if (activeFkIndex !== null && !e.target.closest('.table-col-fk-wrap')) {
         activeFkIndex = null;
         renderRows();
      }
   };
   document.addEventListener('click', handleDocumentClick);

   const closeFn = () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('click', handleDocumentClick);
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

      // Check new enum values
      for (const col of columns) {
         if (col.isNewEnum) {
            if (!col.enumValues || col.enumValues.length === 0) {
               alert(
                  `Please specify at least one enum value for column "${col.name || 'column'}".`,
               );
               return;
            }
         }
      }

      submitBtn.disabled = true;
      submitText.textContent = 'Creating...';

      try {
         const payloadColumns = columns.map((c) => ({
            name: c.name,
            type: c.isNewEnum
               ? (c.newEnumName || c.type || 'CustomEnum').trim()
               : c.type,
            isPk: !!c.primaryKey,
            primaryKey: !!c.primaryKey,
            nullable: c.primaryKey ? false : c.nullable !== false,
            isUnique: !c.primaryKey && !!c.isUnique,
            defaultValue: c.defaultValue || undefined,
            enumValues:
               c.enumValues && c.enumValues.length > 0
                  ? c.enumValues
                  : undefined,
            isNewEnum: !!c.isNewEnum,
            fkTarget:
               c.fkTarget && c.fkTarget.table && c.fkTarget.column
                  ? {
                       table: c.fkTarget.table,
                       column: c.fkTarget.column,
                       onDelete: c.fkTarget.onDelete,
                       onUpdate: c.fkTarget.onUpdate,
                    }
                  : undefined,
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
