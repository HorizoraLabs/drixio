import { createSnippetApi, updateSnippetApi } from '../../lib/api.js';

/**
 * Extract parameter tokens from SQL text (:param or {{param}}).
 */
export function extractVariables(sql) {
   if (!sql) return [];
   const params = new Set();

   const mustacheRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
   let m;
   while ((m = mustacheRegex.exec(sql)) !== null) {
      if (m[1]) params.add(m[1]);
   }

   const colonRegex = /(?:^|[^:]):([a-zA-Z0-9_]+)/g;
   while ((m = colonRegex.exec(sql)) !== null) {
      if (m[1]) params.add(m[1]);
   }

   return Array.from(params);
}

/**
 * Substitute variables into SQL template.
 */
export function substituteVariables(sql, params) {
   if (!sql) return '';
   let result = sql;

   for (const [key, rawValue] of Object.entries(params)) {
      const valStr =
         rawValue !== undefined && rawValue !== null ? String(rawValue) : '';
      const isNumber = !isNaN(Number(valStr)) && valStr.trim() !== '';

      const quotedMustache = new RegExp(`'\\{\\{\\s*${key}\\s*\\}\\}'`, 'g');
      const quotedColon = new RegExp(`':${key}'`, 'g');
      const escaped = valStr.replace(/'/g, "''");

      result = result.replace(quotedMustache, `'${escaped}'`);
      result = result.replace(quotedColon, `'${escaped}'`);

      const rawMustache = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(rawMustache, valStr);

      const rawColon = new RegExp(`(^|[^:]):${key}\\b`, 'g');
      result = result.replace(rawColon, (_match, prefix) => {
         return `${prefix}${valStr}`;
      });
   }

   return result;
}

/**
 * Modal to save or edit a query snippet.
 */
export function openSaveSnippetModal({
   snippetId = null,
   defaultTitle = '',
   defaultSql = '',
   defaultDescription = '',
   defaultTags = [],
   onSaved = null,
}) {
   let existing = document.getElementById('snippet-save-modal');
   if (existing) existing.remove();

   const modal = document.createElement('div');
   modal.id = 'snippet-save-modal';
   modal.className = 'modal-overlay';

   const isEdit = !!snippetId;
   const detectedParams = extractVariables(defaultSql);

   modal.innerHTML = /* html */ `
    <div class="modal-container snippet-modal-container">
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size: 20px;">${isEdit ? 'edit_note' : 'bookmark_add'}</span>
          <h3 class="m-0 text-15 font-semibold">${isEdit ? 'Edit Query Snippet' : 'Save Query as Snippet'}</h3>
        </div>
        <button type="button" id="close-save-snippet-btn" class="modal-close-btn" title="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="snippet-modal-body">
        <div class="snippet-field-group">
          <div class="snippet-field-label">
            <span>Title <span style="color: var(--color-error); font-size: 11px;">*</span></span>
          </div>
          <input type="text" id="save-snippet-title" class="snippet-input" placeholder="e.g. Active Users by Status" value="${defaultTitle}" autofocus />
        </div>

        <div class="snippet-field-group">
          <div class="snippet-field-label">
            <span>Description</span>
            <span class="snippet-field-hint">Optional</span>
          </div>
          <input type="text" id="save-snippet-desc" class="snippet-input" placeholder="e.g. Summarizes user counts with role filter" value="${defaultDescription}" />
        </div>

        <div class="snippet-field-group">
          <div class="snippet-field-label">
            <span>Tags</span>
            <span class="snippet-field-hint">Comma separated</span>
          </div>
          <input type="text" id="save-snippet-tags" class="snippet-input" placeholder="e.g. users, metrics, cleanup" value="${defaultTags.join(', ')}" />
        </div>

        <div class="snippet-field-group">
          <div class="snippet-field-label">
            <span>SQL Query <span style="color: var(--color-error); font-size: 11px;">*</span></span>
            <div id="save-snippet-param-badges" class="snippet-badges-wrap">
              ${detectedParams.map((p) => `<span class="snippet-param-badge">:${p}</span>`).join('')}
            </div>
          </div>
          <textarea id="save-snippet-sql" class="snippet-textarea" placeholder="SELECT * FROM table...">${defaultSql}</textarea>
        </div>
      </div>

      <div class="modal-footer">
        <div class="text-11 text-soft flex items-center gap-1" style="user-select: none;">
          <span class="material-symbols-outlined" style="font-size: 14px;">keyboard</span>
          <span>Ctrl + Enter to save</span>
        </div>
        <div class="snippet-footer-actions">
          <button type="button" id="cancel-save-snippet-btn" class="btn-secondary">Cancel</button>
          <button type="button" id="confirm-save-snippet-btn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 16px;">check</span>
            <span id="confirm-save-snippet-btn-text">${isEdit ? 'Update Snippet' : 'Save Snippet'}</span>
          </button>
        </div>
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
         e.preventDefault();
         confirmBtn.click();
      }
   };
   document.addEventListener('keydown', handleKeydown);

   modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFn();
   });

   document.getElementById('close-save-snippet-btn').onclick = closeFn;
   document.getElementById('cancel-save-snippet-btn').onclick = closeFn;

   const titleInput = document.getElementById('save-snippet-title');
   const descInput = document.getElementById('save-snippet-desc');
   const tagsInput = document.getElementById('save-snippet-tags');
   const sqlTextarea = document.getElementById('save-snippet-sql');
   const paramBadges = document.getElementById('save-snippet-param-badges');
   const confirmBtn = document.getElementById('confirm-save-snippet-btn');
   const confirmBtnText = document.getElementById(
      'confirm-save-snippet-btn-text',
   );

   sqlTextarea.oninput = () => {
      const params = extractVariables(sqlTextarea.value);
      paramBadges.innerHTML = params
         .map((p) => `<span class="snippet-param-badge">:${p}</span>`)
         .join('');
   };

   confirmBtn.onclick = async () => {
      const title = titleInput.value.trim();
      const sql = sqlTextarea.value.trim();
      if (!sql) {
         if (window.showToast) {
            window.showToast('SQL query cannot be empty.', 'error');
         } else {
            alert('SQL query cannot be empty.');
         }
         sqlTextarea.focus();
         return;
      }

      const description = descInput.value.trim();
      const tags = tagsInput.value
         .split(',')
         .map((t) => t.trim())
         .filter(Boolean);

      confirmBtn.disabled = true;
      if (confirmBtnText) confirmBtnText.textContent = 'Saving...';

      try {
         let res;
         if (isEdit) {
            res = await updateSnippetApi(snippetId, {
               title: title || 'Untitled Snippet',
               sql,
               description,
               tags,
            });
         } else {
            res = await createSnippetApi({
               title: title || 'Untitled Snippet',
               sql,
               description,
               tags,
            });
         }

         if (res.success) {
            if (window.showToast) {
               window.showToast(
                  isEdit
                     ? 'Snippet updated'
                     : 'Snippet saved to .drixio/snippets.json',
                  'success',
               );
            }
            if (onSaved) onSaved(res.data);
            closeFn();
         } else {
            if (window.showToast) {
               window.showToast(
                  `Failed to save snippet: ${res.error}`,
                  'error',
               );
            } else {
               alert(`Failed to save snippet: ${res.error}`);
            }
         }
      } catch (err) {
         if (window.showToast) {
            window.showToast(`Error saving snippet: ${err.message}`, 'error');
         } else {
            alert(`Error saving snippet: ${err.message}`);
         }
      } finally {
         confirmBtn.disabled = false;
         if (confirmBtnText) {
            confirmBtnText.textContent = isEdit
               ? 'Update Snippet'
               : 'Save Snippet';
         }
      }
   };

   titleInput.focus();
}

/**
 * Modal to prompt user for parameter values before running a snippet.
 */
export function openParametricQueryModal({ snippet, onExecute }) {
   const params = extractVariables(snippet.sql);
   if (params.length === 0) {
      onExecute(snippet.sql);
      return;
   }

   let existing = document.getElementById('snippet-param-modal');
   if (existing) existing.remove();

   const modal = document.createElement('div');
   modal.id = 'snippet-param-modal';
   modal.className = 'modal-overlay';

   modal.innerHTML = /* html */ `
    <div class="modal-container snippet-modal-container" style="width: 600px;">
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size: 20px;">tune</span>
          <h3 class="m-0 text-15 font-semibold">Run Query with Parameters</h3>
        </div>
        <button type="button" id="close-param-modal-btn" class="modal-close-btn" title="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="snippet-modal-body" style="gap: 14px;">
        <div class="flex items-center gap-2 text-12" style="color: var(--color-text-secondary); background: var(--color-bg-secondary); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--color-border);">
          <span class="material-symbols-outlined text-primary" style="font-size: 16px;">bookmark</span>
          <span>Query: <b style="color: var(--color-text);">${snippet.title}</b></span>
        </div>

        <div class="snippet-field-group">
          <div class="snippet-field-label">
            <span>Parameters (${params.length})</span>
            <span class="snippet-field-hint">Fill values for placeholders</span>
          </div>
          <div id="param-fields-container" style="display: flex; flex-direction: column; gap: 8px;">
            ${params
               .map(
                  (p) => /* html */ `
              <div class="flex items-center gap-2">
                <span class="snippet-param-badge" style="width: 100px; justify-content: center; height: 32px; box-sizing: border-box; font-size: 12px;">:${p}</span>
                <input type="text" class="snippet-input param-input" data-param="${p}" placeholder="Enter value for :${p}" style="flex: 1; height: 32px; font-size: 12.5px;" />
              </div>
            `,
               )
               .join('')}
          </div>
        </div>

        <div class="snippet-field-group">
          <div class="snippet-field-label">
            <span>Preview SQL</span>
          </div>
          <pre id="param-preview-sql" class="diff-sql-pre" style="min-height: 100px; height: 120px; border: 1px solid var(--color-border); border-radius: 6px; padding: 10px 12px; font-size: 12px; line-height: 1.5; font-family: var(--font-mono); overflow-y: auto; background: var(--color-bg-secondary-dark);"></pre>
        </div>
      </div>

      <div class="modal-footer">
        <div class="text-11 text-soft flex items-center gap-1" style="user-select: none;">
          <span class="material-symbols-outlined" style="font-size: 14px;">keyboard</span>
          <span>Enter to execute</span>
        </div>
        <div class="snippet-footer-actions">
          <button type="button" id="cancel-param-btn" class="btn-secondary">Cancel</button>
          <button type="button" id="confirm-run-param-btn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 16px;">play_arrow</span>
            <span>Execute Query</span>
          </button>
        </div>
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

   modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFn();
   });

   document.getElementById('close-param-modal-btn').onclick = closeFn;
   document.getElementById('cancel-param-btn').onclick = closeFn;

   const previewBox = document.getElementById('param-preview-sql');
   const inputs = modal.querySelectorAll('.param-input');

   const updatePreview = () => {
      const currentVals = {};
      inputs.forEach((inp) => {
         const key = inp.getAttribute('data-param');
         currentVals[key] = inp.value || `:${key}`;
      });
      previewBox.textContent = substituteVariables(snippet.sql, currentVals);
   };

   inputs.forEach((inp) => {
      inp.oninput = updatePreview;
      inp.onkeydown = (e) => {
         if (e.key === 'Enter') {
            document.getElementById('confirm-run-param-btn').click();
         }
      };
   });

   updatePreview();
   if (inputs.length > 0) inputs[0].focus();

   document.getElementById('confirm-run-param-btn').onclick = () => {
      const finalVals = {};
      inputs.forEach((inp) => {
         const key = inp.getAttribute('data-param');
         finalVals[key] = inp.value;
      });
      const resolvedSql = substituteVariables(snippet.sql, finalVals);
      closeFn();
      onExecute(resolvedSql);
   };
}
