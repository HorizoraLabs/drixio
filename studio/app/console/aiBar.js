/**
 * AI Inline Prompt Bar for Drixio Studio SQL Console
 * Enables Text-to-SQL generation directly inside the SQL Editor with Ctrl+I.
 */

import { generateSqlApi, fixSqlApi } from '../../lib/api.js';
import { getStoredAiConfig, openAiConfigModal } from '../../components/aiConfigModal.js';

let activeAiBarEl = null;
let docKeyHandler = null;

export function toggleAiPromptBar({
   editorTextarea,
   highlightLayer,
   currentTable,
   onRunQuery,
   onInsertSql,
}) {
   if (activeAiBarEl) {
      closeAiPromptBar();
      return;
   }
   openAiPromptBar({
      editorTextarea,
      highlightLayer,
      currentTable,
      onRunQuery,
      onInsertSql,
   });
}

export function closeAiPromptBar() {
   if (docKeyHandler) {
      document.removeEventListener('keydown', docKeyHandler);
      docKeyHandler = null;
   }
   if (activeAiBarEl) {
      activeAiBarEl.remove();
      activeAiBarEl = null;
   }
}

export function openAiPromptBar({
   editorTextarea,
   highlightLayer,
   currentTable,
   onRunQuery,
   onInsertSql,
   initialPrompt = '',
}) {
   closeAiPromptBar();

   const wrapper = document.querySelector('.sql-editor-wrapper');
   if (!wrapper) return;

   const bar = document.createElement('div');
   bar.id = 'console-ai-prompt-bar';
   bar.className = 'console-ai-prompt-bar';

   bar.innerHTML = /* html */ `
     <div class="ai-bar-inner">
       <div class="ai-bar-input-row">
         <span class="material-symbols-outlined ai-sparkle-icon">auto_awesome</span>
         <input
           type="text"
           id="ai-prompt-input"
           class="ai-prompt-input"
           placeholder="Ask AI to generate SQL... (e.g. Find users who registered last week with > 3 orders)"
           value="${initialPrompt ? escapeAttr(initialPrompt) : ''}"
           autocomplete="off"
           spellcheck="false"
         />
         <div class="ai-bar-input-actions">
           <button type="button" id="btn-ai-open-settings" class="ai-bar-icon-btn" title="AI Settings (Provider, Key, Model)">
             <span class="material-symbols-outlined" style="font-size: 15px;">tune</span>
           </button>
           <button type="button" id="btn-ai-generate-submit" class="ai-bar-generate-btn" title="Generate SQL (Enter)">
             <span class="material-symbols-outlined" style="font-size: 14px;">arrow_forward</span>
             <span>Generate</span>
           </button>
           <button type="button" id="btn-ai-close-bar" class="ai-bar-icon-btn" title="Close (Esc)">
             <span class="material-symbols-outlined" style="font-size: 15px;">close</span>
           </button>
         </div>
       </div>

       <!-- Preview / Result Area -->
       <div id="ai-bar-result-area" class="ai-bar-result-area hidden">
         <div class="ai-bar-loading hidden" id="ai-bar-loading">
           <span class="material-symbols-outlined animate-spin" style="font-size: 16px;">progress_activity</span>
           <span id="ai-loading-text">Generating SQL query...</span>
         </div>

         <div class="ai-bar-preview-box hidden" id="ai-bar-preview-box">
           <div class="ai-preview-meta">
             <span class="ai-badge-model" id="ai-preview-model">DEEPSEEK</span>
             <span class="ai-preview-explanation" id="ai-preview-explanation"></span>
           </div>
           <pre class="ai-sql-preview font-mono" id="ai-sql-preview"></pre>
           <div class="ai-preview-actions">
             <button type="button" class="btn-secondary" id="btn-ai-preview-discard">Discard (Esc)</button>
             <button type="button" class="btn-secondary" id="btn-ai-preview-insert">Insert to Editor</button>
             <button type="button" class="btn-primary flex items-center gap-1" id="btn-ai-preview-run">
               <span class="material-symbols-outlined" style="font-size: 15px;">play_arrow</span>
               <span>Run Directly (Ctrl+↵)</span>
             </button>
           </div>
         </div>
       </div>
     </div>
   `;

   wrapper.prepend(bar);
   activeAiBarEl = bar;

   const input = document.getElementById('ai-prompt-input');
   const submitBtn = document.getElementById('btn-ai-generate-submit');
   const closeBtn = document.getElementById('btn-ai-close-bar');
   const settingsBtn = document.getElementById('btn-ai-open-settings');
   const resultArea = document.getElementById('ai-bar-result-area');
   const loadingEl = document.getElementById('ai-bar-loading');
   const previewBox = document.getElementById('ai-bar-preview-box');
   const previewModel = document.getElementById('ai-preview-model');
   const previewExp = document.getElementById('ai-preview-explanation');
   const previewSql = document.getElementById('ai-sql-preview');
   const discardBtn = document.getElementById('btn-ai-preview-discard');
   const insertBtn = document.getElementById('btn-ai-preview-insert');
   const runBtn = document.getElementById('btn-ai-preview-run');

   setTimeout(() => input?.focus(), 50);

   closeBtn.onclick = closeAiPromptBar;
   discardBtn.onclick = closeAiPromptBar;

   settingsBtn.onclick = () => {
      openAiConfigModal();
   };

   let currentGeneratedSql = '';

   const doGenerate = async () => {
      const promptText = input.value.trim();
      if (!promptText) return;

      const aiCfg = getStoredAiConfig();
      if (!aiCfg.apiKey && aiCfg.provider !== 'ollama') {
         openAiConfigModal(() => {
            doGenerate();
         });
         return;
      }

      resultArea.classList.remove('hidden');
      loadingEl.classList.remove('hidden');
      previewBox.classList.add('hidden');
      submitBtn.disabled = true;

      try {
         const res = await generateSqlApi({
            prompt: promptText,
            currentTable: currentTable || window.AppState?.currentTable,
            config: aiCfg,
         });

         loadingEl.classList.add('hidden');
         submitBtn.disabled = false;

         if (res.success && res.data) {
            currentGeneratedSql = res.data.sql;
            previewModel.textContent = (res.data.model || aiCfg.model || 'AI').toUpperCase();
            previewExp.textContent = res.data.explanation || '';
            previewSql.textContent = currentGeneratedSql;
            previewBox.classList.remove('hidden');
         } else {
            window.showToast?.(res.error || 'Failed to generate SQL', 'error');
            resultArea.classList.add('hidden');
         }
      } catch (err) {
         loadingEl.classList.add('hidden');
         submitBtn.disabled = false;
         window.showToast?.(err.message || 'Network error', 'error');
         resultArea.classList.add('hidden');
      }
   };

   submitBtn.onclick = doGenerate;

   input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
         e.preventDefault();
         doGenerate();
      } else if (e.key === 'Escape') {
         closeAiPromptBar();
      }
   };

   insertBtn.onclick = () => {
      if (!currentGeneratedSql) return;
      if (onInsertSql) {
         onInsertSql(currentGeneratedSql);
      } else if (editorTextarea) {
         editorTextarea.value = currentGeneratedSql;
         editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      closeAiPromptBar();
   };

   runBtn.onclick = () => {
      if (!currentGeneratedSql) return;
      if (editorTextarea) {
         editorTextarea.value = currentGeneratedSql;
         editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      closeAiPromptBar();
      if (onRunQuery) {
         onRunQuery(currentGeneratedSql);
      }
   };

   docKeyHandler = (e) => {
      if (e.key === 'Escape' && activeAiBarEl) {
         closeAiPromptBar();
      }
   };
   document.addEventListener('keydown', docKeyHandler);

   if (initialPrompt) {
      doGenerate();
   }
}

function escapeAttr(str) {
   if (!str) return '';
   return String(str).replace(/"/g, '&quot;');
}

export async function triggerAiFix({
   sql,
   error,
   editorTextarea,
   highlightLayer,
   currentTable,
   onRunQuery,
   onInsertSql,
}) {
   const aiCfg = getStoredAiConfig();
   if (!aiCfg.apiKey && aiCfg.provider !== 'ollama') {
      openAiConfigModal(() => {
         triggerAiFix({
            sql,
            error,
            editorTextarea,
            highlightLayer,
            currentTable,
            onRunQuery,
            onInsertSql,
         });
      });
      return;
   }

   openAiPromptBar({
      editorTextarea,
      highlightLayer,
      currentTable,
      onRunQuery,
      onInsertSql,
   });

   const input = document.getElementById('ai-prompt-input');
   if (input) {
      input.value = `Fix SQL Error: ${error ? error.replace(/\s+/g, ' ').slice(0, 80) : ''}`;
   }
   const resultArea = document.getElementById('ai-bar-result-area');
   const loadingEl = document.getElementById('ai-bar-loading');
   const loadingText = document.getElementById('ai-loading-text');
   const previewBox = document.getElementById('ai-bar-preview-box');
   const previewModel = document.getElementById('ai-preview-model');
   const previewExp = document.getElementById('ai-preview-explanation');
   const previewSql = document.getElementById('ai-sql-preview');
   const submitBtn = document.getElementById('btn-ai-generate-submit');

   if (resultArea && loadingEl) {
      resultArea.classList.remove('hidden');
      loadingEl.classList.remove('hidden');
      if (loadingText) loadingText.textContent = 'Diagnosing error and generating fix...';
      if (previewBox) previewBox.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = true;
   }

   try {
      const res = await fixSqlApi({
         sql,
         error,
         currentTable: currentTable || window.AppState?.currentTable,
         config: aiCfg,
      });

      if (loadingEl) loadingEl.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;

      if (res.success && res.data) {
         const fixedSql = res.data.fixedSql;
         if (previewModel) previewModel.textContent = (res.data.model || aiCfg.model || 'AI').toUpperCase();
         if (previewExp) previewExp.textContent = res.data.explanation || 'Fixed query error.';
         if (previewSql) previewSql.textContent = fixedSql;
         if (previewBox) previewBox.classList.remove('hidden');

         const insertBtn = document.getElementById('btn-ai-preview-insert');
         const runBtn = document.getElementById('btn-ai-preview-run');
         if (insertBtn) {
            insertBtn.onclick = () => {
               if (onInsertSql) {
                  onInsertSql(fixedSql);
               } else if (editorTextarea) {
                  editorTextarea.value = fixedSql;
                  editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
               }
               closeAiPromptBar();
               window.showToast?.('Applied fix to editor', 'success');
            };
         }
         if (runBtn) {
            runBtn.onclick = () => {
               if (editorTextarea) {
                  editorTextarea.value = fixedSql;
                  editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
               }
               closeAiPromptBar();
               if (onRunQuery) {
                  onRunQuery(fixedSql);
               }
            };
         }
      } else {
         window.showToast?.(res.error || 'Failed to fix SQL error', 'error');
         if (resultArea) resultArea.classList.add('hidden');
      }
   } catch (err) {
      if (loadingEl) loadingEl.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
      window.showToast?.(err.message || 'Network error', 'error');
      if (resultArea) resultArea.classList.add('hidden');
   }
}

