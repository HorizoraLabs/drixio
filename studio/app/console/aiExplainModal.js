/**
 * AI Query Explain & Performance Optimizer Modal
 * Analyzes SQL against live schema, highlights potential bottlenecks,
 * and proposes optimized rewrites with 1-click apply.
 */

import { explainSqlApi } from '../../lib/api.js';
import { getStoredAiConfig, openAiConfigModal } from '../../components/aiConfigModal.js';
import { createModal } from '../../components/modal.js';

export function openAiExplainModal({
   sql,
   currentTable,
   onApplyOptimized,
}) {
   const cleanSql = (sql || '').trim();
   if (!cleanSql) {
      window.showToast?.('Please enter or select a SQL query first', 'warning');
      return;
   }

   const aiCfg = getStoredAiConfig();
   if (!aiCfg.apiKey && aiCfg.provider !== 'ollama') {
      openAiConfigModal(() => {
         openAiExplainModal({ sql, currentTable, onApplyOptimized });
      });
      return;
   }

   let isDisposed = false;

   const modalInstance = createModal({
      id: 'ai-explain-modal-overlay',
      className: 'ai-explain-modal',
      icon: 'auto_awesome',
      iconColor: 'primary',
      title: 'AI Query Explain & Optimize',
      subtitle: 'Analyzing execution logic, index utilization, and performance bottlenecks',
      badge: (aiCfg.model || aiCfg.provider || 'AI').toUpperCase(),
      width: '680px',
      onClose: () => {
         isDisposed = true;
      },
      body: /* html */ `
         <div class="ai-explain-loading" id="ai-explain-loading">
            <div class="ai-loading-spinner-wrap">
               <span class="material-symbols-outlined animate-spin" style="font-size: 28px; color: var(--primary, #2563eb);">progress_activity</span>
            </div>
            <div class="ai-loading-text">
               <h4>Analyzing query with ${escapeHtml(aiCfg.model || 'AI')}...</h4>
               <p>Inspecting table schema, unindexed scans, and potential rewrites.</p>
            </div>
         </div>
         <div class="ai-explain-content hidden" id="ai-explain-content"></div>
      `,
      footer: /* html */ `
         <div class="flex items-center justify-between w-full">
            <div class="ai-explain-footer-meta text-xs text-muted">
               Target Dialect: <strong>${escapeHtml(window.AppState?.dialect || 'sqlite').toUpperCase()}</strong>
            </div>
            <div class="flex items-center gap-2">
               <button type="button" class="btn-secondary" id="btn-ai-explain-close">Close</button>
               <button type="button" class="btn-primary hidden" id="btn-ai-explain-apply">
                  <span class="material-symbols-outlined icon-14">check</span>
                  <span>Apply Optimized Query</span>
               </button>
            </div>
         </div>
      `,
   });

   const closeBtn = document.getElementById('btn-ai-explain-close');
   const applyBtn = document.getElementById('btn-ai-explain-apply');
   const loadingEl = document.getElementById('ai-explain-loading');
   const contentEl = document.getElementById('ai-explain-content');

   if (closeBtn) {
      closeBtn.onclick = () => modalInstance.close();
   }

   // Fetch explanation
   explainSqlApi({
      sql: cleanSql,
      currentTable: currentTable || window.AppState?.currentTable,
      config: aiCfg,
   })
      .then((res) => {
         if (isDisposed) return;
         if (!loadingEl || !contentEl) return;
         loadingEl.classList.add('hidden');
         contentEl.classList.remove('hidden');

         if (!res.success || !res.data) {
            contentEl.innerHTML = /* html */ `
               <div class="ai-explain-error">
                  <span class="material-symbols-outlined" style="color: var(--color-error, #ef4444); font-size: 22px;">error</span>
                  <div>
                     <div class="font-semibold text-sm">Failed to analyze query</div>
                     <div class="text-xs text-muted mt-0.5">${escapeHtml(res.error || 'Unknown error occurred')}</div>
                  </div>
               </div>
            `;
            return;
         }

         const { explanation, performanceTips, optimizedSql } = res.data;

         const tipsHtml = Array.isArray(performanceTips) && performanceTips.length > 0
            ? performanceTips.map((tip) => `
               <li class="ai-tip-item">
                  <span class="material-symbols-outlined ai-tip-icon">lightbulb</span>
                  <span>${escapeHtml(tip)}</span>
               </li>
            `).join('')
            : '<li class="ai-tip-item text-muted">No obvious performance bottlenecks detected.</li>';

         let optimizedHtml = '';
         if (optimizedSql && optimizedSql.trim() !== cleanSql) {
            optimizedHtml = /* html */ `
               <div class="ai-explain-section">
                  <div class="ai-explain-section-title flex items-center justify-between">
                     <span class="flex items-center gap-1.5 font-semibold text-xs text-primary">
                        <span class="material-symbols-outlined icon-14">tune</span>
                        <span>Optimized Query</span>
                     </span>
                     <button type="button" class="btn-copy-code" id="btn-copy-optimized" title="Copy SQL">
                        <span class="material-symbols-outlined icon-12">content_copy</span>
                        <span>Copy</span>
                     </button>
                  </div>
                  <pre class="ai-optimized-sql font-mono">${escapeHtml(optimizedSql)}</pre>
               </div>
            `;

            if (applyBtn) {
               applyBtn.classList.remove('hidden');
               applyBtn.onclick = () => {
                  if (onApplyOptimized) {
                     onApplyOptimized(optimizedSql);
                  }
                  modalInstance.close();
                  window.showToast?.('Applied optimized SQL to editor', 'success');
               };
            }
         }

         contentEl.innerHTML = /* html */ `
            <div class="ai-explain-section">
               <div class="ai-explain-section-title font-semibold text-xs text-muted uppercase tracking-wider">
                  Query Explanation
               </div>
               <div class="ai-explain-body-text">
                  ${escapeHtml(explanation || 'Analyzed query based on current schema.')}
               </div>
            </div>

            <div class="ai-explain-section">
               <div class="ai-explain-section-title font-semibold text-xs text-muted uppercase tracking-wider">
                  Performance Diagnostics
               </div>
               <ul class="ai-tips-list">
                  ${tipsHtml}
               </ul>
            </div>

            ${optimizedHtml}
         `;

         const copyBtn = document.getElementById('btn-copy-optimized');
         if (copyBtn) {
            copyBtn.onclick = async () => {
               try {
                  await navigator.clipboard.writeText(optimizedSql);
                  window.showToast?.('Optimized SQL copied to clipboard', 'success');
               } catch {
                  window.showToast?.('Failed to copy SQL', 'error');
               }
            };
         }
      })
      .catch((err) => {
         if (isDisposed) return;
         if (!loadingEl || !contentEl) return;
         loadingEl.classList.add('hidden');
         contentEl.classList.remove('hidden');
         contentEl.innerHTML = /* html */ `
            <div class="ai-explain-error">
               <span class="material-symbols-outlined" style="color: var(--color-error, #ef4444); font-size: 22px;">error</span>
               <div>
                  <div class="font-semibold text-sm">Network or service error</div>
                  <div class="text-xs text-muted mt-0.5">${escapeHtml(err.message || 'Check your AI connection or API key')}</div>
               </div>
            </div>
         `;
      });
}

function escapeHtml(str) {
   if (!str) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

