import { fetchSchemaHealthApi } from '../lib/api.js';

export async function openHealthModal() {
   let modal = document.getElementById('schema-health-modal');
   if (modal) modal.remove();

   modal = document.createElement('div');
   modal.id = 'schema-health-modal';
   modal.className = 'modal-overlay';
   modal.setAttribute('role', 'dialog');
   modal.setAttribute('aria-modal', 'true');
   modal.setAttribute('aria-labelledby', 'health-modal-title');

   document.body.appendChild(modal);

   const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
   };
   window.addEventListener('keydown', handleKeyDown);

   function closeModal() {
      window.removeEventListener('keydown', handleKeyDown);
      modal.remove();
   }

   modal.onclick = (e) => {
      if (e.target === modal) closeModal();
   };

   // Initial skeleton
   modal.innerHTML = /* html */ `
      <div class="modal-dialog schema-health-dialog" style="max-width: 780px; width: 90vw;">
         <div class="modal-header">
            <div class="modal-header-info">
               <div class="modal-icon-badge" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
                  <span class="material-symbols-outlined">health_and_safety</span>
               </div>
               <div>
                  <h3 id="health-modal-title" class="modal-title">Schema Health Doctor</h3>
                  <p class="modal-subtitle">Automated architectural linter, foreign key index auditor, and 1-click remediation.</p>
               </div>
            </div>
            <button class="modal-close-btn" id="health-modal-close-btn" aria-label="Close modal">
               <span class="material-symbols-outlined">close</span>
            </button>
         </div>

         <div class="modal-body" id="health-modal-body" style="min-height: 280px; display: flex; align-items: center; justify-content: center;">
            <div style="display: flex; align-items: center; gap: 8px; color: var(--color-text-dim);">
               <span class="material-symbols-outlined animate-spin icon-20">progress_activity</span>
               <span>Running database health check...</span>
            </div>
         </div>
      </div>
   `;

   document.getElementById('health-modal-close-btn').onclick = closeModal;

   const res = await fetchSchemaHealthApi();
   if (!res.success) {
      const body = document.getElementById('health-modal-body');
      if (body) {
         body.innerHTML = /* html */ `
            <div style="text-align: center; color: #ef4444; padding: 20px;">
               <span class="material-symbols-outlined" style="font-size: 32px;">error</span>
               <p style="margin-top: 8px;">Health Check Failed: ${res.error}</p>
            </div>
         `;
      }
      return;
   }

   renderReport(res.data, closeModal);
}

function renderReport(report, closeModal) {
   const body = document.getElementById('health-modal-body');
   if (!body) return;

   const { score, grade, statusText, analyzedTablesCount, issuesCount, issues } = report;

   let scoreColor = '#10b981';
   let scoreBg = 'rgba(16, 185, 129, 0.1)';
   if (score < 50) {
      scoreColor = '#ef4444';
      scoreBg = 'rgba(239, 68, 68, 0.1)';
   } else if (score < 75) {
      scoreColor = '#f59e0b';
      scoreBg = 'rgba(245, 158, 11, 0.1)';
   } else if (score < 90) {
      scoreColor = '#3b82f6';
      scoreBg = 'rgba(59, 130, 246, 0.1)';
   }

   body.style.display = 'block';
   body.innerHTML = /* html */ `
      <!-- Hero Score Card -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-radius: 10px; background: ${scoreBg}; border: 1px solid ${scoreColor}33; margin-bottom: 20px;">
         <div style="display: flex; align-items: center; gap: 16px;">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--color-bg); border: 3px solid ${scoreColor}; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
               <span style="font-size: 20px; font-weight: 800; color: ${scoreColor}; line-height: 1;">${score}</span>
               <span style="font-size: 9px; font-weight: 700; color: var(--color-text-dim); text-transform: uppercase;">Grade ${grade}</span>
            </div>
            <div>
               <h4 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700; color: var(--color-text);">${statusText}</h4>
               <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--color-text-dim);">
                  <span>Analyzed ${analyzedTablesCount} tables</span>
                  <span>•</span>
                  <span>${issuesCount.total} total observations</span>
               </div>
            </div>
         </div>

         <div style="display: flex; gap: 8px;">
            <div style="text-align: center; padding: 6px 12px; border-radius: 6px; background: rgba(0,0,0,0.15);">
               <div style="font-size: 14px; font-weight: 700; color: #ef4444;">${issuesCount.critical}</div>
               <div style="font-size: 10px; color: var(--color-text-dim);">Critical</div>
            </div>
            <div style="text-align: center; padding: 6px 12px; border-radius: 6px; background: rgba(0,0,0,0.15);">
               <div style="font-size: 14px; font-weight: 700; color: #f59e0b;">${issuesCount.warning}</div>
               <div style="font-size: 10px; color: var(--color-text-dim);">Warning</div>
            </div>
            <div style="text-align: center; padding: 6px 12px; border-radius: 6px; background: rgba(0,0,0,0.15);">
               <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">${issuesCount.suggestion}</div>
               <div style="font-size: 10px; color: var(--color-text-dim);">Suggestions</div>
            </div>
         </div>
      </div>

      <!-- Filter Tabs -->
      <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--color-border); padding-bottom: 10px; margin-bottom: 16px;">
         <button class="health-tab-btn active" data-filter="all" style="font-size: 12.5px; padding: 4px 12px; border-radius: 6px; background: var(--color-primary); color: #fff; border: none; cursor: pointer; font-weight: 600;">
            All (${issuesCount.total})
         </button>
         <button class="health-tab-btn" data-filter="critical" style="font-size: 12.5px; padding: 4px 12px; border-radius: 6px; background: transparent; color: var(--color-text-dim); border: 1px solid var(--color-border); cursor: pointer; font-weight: 500;">
            🔴 Critical (${issuesCount.critical})
         </button>
         <button class="health-tab-btn" data-filter="warning" style="font-size: 12.5px; padding: 4px 12px; border-radius: 6px; background: transparent; color: var(--color-text-dim); border: 1px solid var(--color-border); cursor: pointer; font-weight: 500;">
            🟡 Warning (${issuesCount.warning})
         </button>
         <button class="health-tab-btn" data-filter="suggestion" style="font-size: 12.5px; padding: 4px 12px; border-radius: 6px; background: transparent; color: var(--color-text-dim); border: 1px solid var(--color-border); cursor: pointer; font-weight: 500;">
            🔵 Suggestions (${issuesCount.suggestion})
         </button>
      </div>

      <!-- Issues List Container -->
      <div id="health-issues-container" style="display: flex; flex-direction: column; gap: 12px; max-height: 420px; overflow-y: auto;">
         ${renderIssuesList(issues)}
      </div>
   `;

   // Tab switching
   const tabBtns = body.querySelectorAll('.health-tab-btn');
   tabBtns.forEach((btn) => {
      btn.onclick = () => {
         tabBtns.forEach((b) => {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = 'var(--color-text-dim)';
         });
         btn.classList.add('active');
         btn.style.background = 'var(--color-primary)';
         btn.style.color = '#fff';

         const filter = btn.dataset.filter;
         const filteredIssues =
            filter === 'all'
               ? issues
               : issues.filter((i) => i.severity === filter);

         const container = document.getElementById('health-issues-container');
         if (container) {
            container.innerHTML = renderIssuesList(filteredIssues);
            bindIssueActions(container, closeModal);
         }
      };
   });

   bindIssueActions(body, closeModal);
}

function renderIssuesList(issuesList) {
   if (issuesList.length === 0) {
      return /* html */ `
         <div style="text-align: center; padding: 30px; color: var(--color-text-dim);">
            <span class="material-symbols-outlined" style="font-size: 32px; color: #10b981; margin-bottom: 8px;">verified</span>
            <h4 style="margin: 0 0 4px 0; color: var(--color-text);">No Issues Found</h4>
            <p style="margin: 0; font-size: 13px;">No schema warnings or performance antipatterns in this category.</p>
         </div>
      `;
   }

   return issuesList
      .map((issue) => {
         const badgeColor =
            issue.severity === 'critical'
               ? '#ef4444'
               : issue.severity === 'warning'
                 ? '#f59e0b'
                 : '#3b82f6';
         const badgeBg =
            issue.severity === 'critical'
               ? 'rgba(239, 68, 68, 0.1)'
               : issue.severity === 'warning'
                 ? 'rgba(245, 158, 11, 0.1)'
                 : 'rgba(59, 130, 246, 0.1)';

         return /* html */ `
            <div class="health-issue-card" style="border: 1px solid var(--color-border); border-radius: 8px; padding: 14px 16px; background: var(--color-bg-subtle, rgba(255,255,255,0.02));">
               <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                     <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}33;">
                        ${issue.severity} (-${issue.deduction} pts)
                     </span>
                     <span style="font-size: 13.5px; font-weight: 600; color: var(--color-text);">${issue.title}</span>
                  </div>
                  <div style="display: flex; gap: 6px; font-size: 11px; font-family: monospace;">
                     <span class="badge" style="padding: 2px 6px; border-radius: 4px; background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text-dim);">
                        table: ${issue.tableName}
                     </span>
                     ${
                        issue.columnName
                           ? /* html */ `<span class="badge" style="padding: 2px 6px; border-radius: 4px; background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text-dim);">col: ${issue.columnName}</span>`
                           : ''
                     }
                  </div>
               </div>

               <p style="margin: 0 0 6px 0; font-size: 12.5px; color: var(--color-text-dim); line-height: 1.4;">
                  ${issue.description}
               </p>

               <div style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 10px; border-radius: 6px; background: rgba(0,0,0,0.15); margin-bottom: 10px; font-size: 11.5px; color: var(--color-text-secondary);">
                  <span class="material-symbols-outlined" style="font-size: 15px; color: #f59e0b; margin-top: 1px;">warning</span>
                  <span><strong>Performance Impact:</strong> ${issue.impact}</span>
               </div>

               ${
                  issue.remediationSql
                     ? /* html */ `
                     <div style="margin-top: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                           <span style="font-size: 11px; font-weight: 600; color: var(--color-text-dim); text-transform: uppercase;">Remediation SQL</span>
                           <div style="display: flex; gap: 6px;">
                              <button class="btn btn-ghost copy-fix-sql-btn" data-sql="${encodeURIComponent(issue.remediationSql)}" style="font-size: 11.5px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px;">
                                 <span class="material-symbols-outlined icon-14">content_copy</span>
                                 <span>Copy SQL</span>
                              </button>
                              <button class="btn btn-primary run-fix-console-btn" data-sql="${encodeURIComponent(issue.remediationSql)}" style="font-size: 11.5px; padding: 2px 10px; display: inline-flex; align-items: center; gap: 4px;">
                                 <span class="material-symbols-outlined icon-14">terminal</span>
                                 <span>Run in Console</span>
                              </button>
                           </div>
                        </div>
                        <pre style="margin: 0; padding: 8px 12px; border-radius: 6px; background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 11.5px; overflow-x: auto; white-space: pre-wrap;"><code>${issue.remediationSql}</code></pre>
                     </div>
                  `
                     : ''
               }
            </div>
         `;
      })
      .join('');
}

function bindIssueActions(rootEl, closeModal) {
   // Copy SQL
   rootEl.querySelectorAll('.copy-fix-sql-btn').forEach((btn) => {
      btn.onclick = async () => {
         const sql = decodeURIComponent(btn.dataset.sql);
         try {
            await navigator.clipboard.writeText(sql);
            if (window.showToast) window.showToast('SQL copied to clipboard', 'success');
         } catch {
            alert('Failed to copy SQL');
         }
      };
   });

   // Run in Console
   rootEl.querySelectorAll('.run-fix-console-btn').forEach((btn) => {
      btn.onclick = () => {
         const sql = decodeURIComponent(btn.dataset.sql);
         closeModal();

         // Switch to SQL Console tab
         if (window.handleSwitchTab) {
            window.handleSwitchTab('sql-btn');
         }

         // Injected into Monaco editor
         setTimeout(() => {
            if (window.editorInstance) {
               window.editorInstance.setValue(sql);
               window.editorInstance.focus();
            } else {
               const editorTextarea = document.getElementById('sql-editor');
               if (editorTextarea) {
                  editorTextarea.value = sql;
                  editorTextarea.focus();
               }
            }
            if (window.showToast) {
               window.showToast('Remediation SQL loaded into editor. Press Ctrl+Enter to execute.', 'info');
            }
         }, 150);
      };
   });
}

