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
    <div class="orm-modal-container" style="width: 720px; max-width: 95vw; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);">
      <div class="modal-header" style="padding: 16px 24px;">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size: 22px;">${isEdit ? 'edit_note' : 'bookmark_add'}</span>
          <h3 class="m-0 text-16 font-semibold">${isEdit ? 'Edit Query Snippet' : 'Save Query as Snippet'}</h3>
        </div>
        <button id="close-save-snippet-btn" class="modal-close-btn" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div style="padding: 24px 28px; display: flex; flex-direction: column; gap: 18px; background: var(--color-bg-primary);">
        <div class="flex flex-col gap-1.5">
          <label style="font-size: 13.5px; font-weight: 600; color: var(--color-text);">Title</label>
          <input type="text" id="save-snippet-title" class="snippet-form-input" placeholder="e.g. Active Users by Status" value="${defaultTitle}" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label style="font-size: 13.5px; font-weight: 600; color: var(--color-text);">Description <span style="font-weight: 400; color: var(--color-text-soft); font-size: 12.5px;">(Optional)</span></label>
          <input type="text" id="save-snippet-desc" class="snippet-form-input" placeholder="e.g. Summarizes user counts with role filter" value="${defaultDescription}" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label style="font-size: 13.5px; font-weight: 600; color: var(--color-text);">Tags <span style="font-weight: 400; color: var(--color-text-soft); font-size: 12.5px;">(Comma separated)</span></label>
          <input type="text" id="save-snippet-tags" class="snippet-form-input" placeholder="e.g. users, metrics, cleanup" value="${defaultTags.join(', ')}" />
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label style="font-size: 13.5px; font-weight: 600; color: var(--color-text);">SQL Query</label>
            <span id="save-snippet-param-badges" class="text-12" style="color: var(--color-primary); font-family: var(--font-mono); font-weight: 500;">
              ${detectedParams.length > 0 ? `Variables detected: ${detectedParams.map((p) => `:${p}`).join(', ')}` : ''}
            </span>
          </div>
          <textarea id="save-snippet-sql" class="snippet-form-textarea" placeholder="SELECT * FROM table...">${defaultSql}</textarea>
        </div>
      </div>

      <div class="modal-footer" style="padding: 14px 24px; justify-content: flex-end; gap: 10px;">
        <button type="button" id="cancel-save-snippet-btn" class="btn-secondary" style="height: 38px; padding: 0 18px; font-size: 13px; border-radius: 6px;">Cancel</button>
        <button type="button" id="confirm-save-snippet-btn" class="btn-primary" style="height: 38px; padding: 0 20px; font-size: 13px; border-radius: 6px; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 17px;">check</span>
          <span>${isEdit ? 'Update Snippet' : 'Save Snippet'}</span>
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

   sqlTextarea.oninput = () => {
      const params = extractVariables(sqlTextarea.value);
      paramBadges.textContent =
         params.length > 0
            ? `Variables: ${params.map((p) => `:${p}`).join(', ')}`
            : '';
   };

   confirmBtn.onclick = async () => {
      const title = titleInput.value.trim();
      const sql = sqlTextarea.value.trim();
      if (!sql) {
         alert('SQL query cannot be empty.');
         return;
      }

      const description = descInput.value.trim();
      const tags = tagsInput.value
         .split(',')
         .map((t) => t.trim())
         .filter(Boolean);

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Saving...';

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
            alert(`Failed to save snippet: ${res.error}`);
         }
      } catch (err) {
         alert(`Error saving snippet: ${err.message}`);
      } finally {
         confirmBtn.disabled = false;
         confirmBtn.textContent = isEdit ? 'Update Snippet' : 'Save Snippet';
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
    <div class="orm-modal-container" style="width: 660px; max-width: 95vw; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);">
      <div class="modal-header" style="padding: 16px 24px;">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size: 22px;">tune</span>
          <h3 class="m-0 text-16 font-semibold">Run Query with Parameters</h3>
        </div>
        <button id="close-param-modal-btn" class="modal-close-btn" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; background: var(--color-bg-primary);">
        <div class="text-13 font-medium" style="color: var(--color-text-secondary);">
          Query: <b style="color: var(--color-text);">${snippet.title}</b>
        </div>

        <div id="param-fields-container" style="display: flex; flex-direction: column; gap: 12px;">
          ${params
             .map(
                (p) => /* html */ `
            <div class="flex items-center gap-3">
              <label style="width: 140px; font-size: 13px; font-family: var(--font-mono); font-weight: 600; color: var(--color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">:${p}</label>
              <input type="text" class="snippet-form-input param-input" data-param="${p}" placeholder="Enter value for :${p}" style="height: 42px; font-size: 13.5px; flex: 1;" />
            </div>
          `,
             )
             .join('')}
        </div>

        <div class="flex flex-col gap-1" style="margin-top: 6px;">
          <label style="font-size: 12px; font-weight: 600; color: var(--color-text-soft); text-transform: uppercase;">Preview SQL</label>
          <pre id="param-preview-sql" class="diff-sql-pre" style="min-height: 120px; height: 140px; border: 1px solid var(--color-border); border-radius: 8px; padding: 12px 14px; font-size: 13px; line-height: 1.55; font-family: var(--font-mono); overflow-y: auto;"></pre>
        </div>
      </div>

      <div class="modal-footer" style="padding: 14px 24px; justify-content: flex-end; gap: 10px;">
        <button type="button" id="cancel-param-btn" class="btn-secondary" style="height: 38px; padding: 0 18px; font-size: 13px; border-radius: 6px;">Cancel</button>
        <button type="button" id="confirm-run-param-btn" class="btn-primary" style="height: 38px; padding: 0 20px; font-size: 13px; border-radius: 6px; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 17px;">play_arrow</span>
          <span>Execute Query</span>
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
