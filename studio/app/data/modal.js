/**
 * Data view modals (Mock Data Generator dialog, etc.)
 * Interfaces with backend seeder API (/api/tables/:name/mock)
 */

export async function openMockDataModal(tableName, schema, onComplete) {
   let modalOverlay = document.getElementById('mock-data-modal-overlay');
   if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'mock-data-modal-overlay';
      modalOverlay.className = 'mock-modal-overlay';
      document.body.appendChild(modalOverlay);
   }

   // Show loading skeleton while preview is fetched from backend
   modalOverlay.innerHTML = /* html */ `
    <div class="mock-modal-container">
      <div class="mock-modal-header">
        <div class="mock-modal-title">
          <span class="material-symbols-outlined" style="color: var(--color-primary);">auto_fix_high</span>
          <h3>Generate Mock Data</h3>
          <span class="mock-target-badge">${tableName}</span>
        </div>
        <button type="button" class="mock-modal-close" id="btn-mock-close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="mock-modal-body" style="padding: 40px; text-align: center;">
        <div style="display: inline-flex; align-items: center; gap: 8px; color: var(--color-text-soft);">
          <span class="material-symbols-outlined animate-spin icon-18">progress_activity</span>
          <span>Analyzing schema and preparing preview...</span>
        </div>
      </div>
    </div>
  `;

   modalOverlay
      .querySelector('#btn-mock-close')
      ?.addEventListener('click', closeModal);
   modalOverlay.classList.add('visible');

   function closeModal() {
      modalOverlay.classList.remove('visible');
   }

   let selectedCount = 10;
   let previewData = null;

   try {
      const res = await fetch(
         `/api/tables/${encodeURIComponent(tableName)}/mock/preview`,
      );
      const json = await res.json();
      if (!json.success || !json.data) {
         throw new Error(json.error || 'Failed to load preview');
      }
      previewData = json.data;
   } catch (err) {
      modalOverlay.innerHTML = /* html */ `
      <div class="mock-modal-container">
        <div class="mock-modal-header">
          <div class="mock-modal-title">
            <span class="material-symbols-outlined" style="color: #ef4444;">error</span>
            <h3>Failed to Load Mock Generator</h3>
          </div>
          <button type="button" class="mock-modal-close" id="btn-mock-close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="mock-modal-body" style="padding: 24px;">
          <p style="color: var(--color-text-soft); font-size: 13px;">${err.message}</p>
        </div>
      </div>
    `;
      modalOverlay
         .querySelector('#btn-mock-close')
         ?.addEventListener('click', closeModal);
      return;
   }

   function renderModalContent() {
      const { rules, previewRows } = previewData;
      const activeCols = rules.filter((r) => r.strategy.type !== 'pk_auto');

      const previewThs = activeCols
         .map((r) => `<th>${r.column.name}</th>`)
         .join('');
      const previewTrs = previewRows
         .map(
            (r) =>
               `<tr>${activeCols.map((c) => `<td title="${String(r[c.column.name] ?? '')}">${String(r[c.column.name] ?? '')}</td>`).join('')}</tr>`,
         )
         .join('');

      const rulesHtml = rules
         .map(
            ({ column, strategy }) => `
        <div class="mock-rule-item">
          <div class="mock-rule-col">
            <span class="mock-col-name">${column.name}</span>
            <span class="mock-col-type">${column.type || 'TEXT'}</span>
          </div>
          <span class="mock-rule-strategy ${strategy.type === 'fk' ? 'is-fk' : ''}">
            ${strategy.label}
          </span>
        </div>
      `,
         )
         .join('');

      modalOverlay.innerHTML = /* html */ `
      <div class="mock-modal-container">
        <div class="mock-modal-header">
          <div class="mock-modal-title">
            <span class="material-symbols-outlined" style="color: var(--color-primary);">auto_fix_high</span>
            <h3>Generate Mock Data</h3>
            <span class="mock-target-badge">${tableName}</span>
          </div>
          <button type="button" class="mock-modal-close" id="btn-mock-close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="mock-modal-body">
          <!-- Row Count Selector -->
          <div class="mock-section">
            <label class="mock-section-label">Number of Rows</label>
            <div class="mock-count-pills">
              <button type="button" class="mock-pill ${selectedCount === 10 ? 'active' : ''}" data-count="10">10 Rows</button>
              <button type="button" class="mock-pill ${selectedCount === 50 ? 'active' : ''}" data-count="50">50 Rows</button>
              <button type="button" class="mock-pill ${selectedCount === 100 ? 'active' : ''}" data-count="100">100 Rows</button>
              <div class="mock-custom-input-wrap">
                <input type="number" id="mock-custom-count" min="1" max="500" placeholder="Custom" value="${[10, 50, 100].includes(selectedCount) ? '' : selectedCount}" />
              </div>
            </div>
          </div>

          <!-- Column Strategies -->
          <div class="mock-section">
            <label class="mock-section-label">Inferred Column Rules (${rules.length} columns)</label>
            <div class="mock-rules-list">
              ${rulesHtml}
            </div>
          </div>

          <!-- Sample Preview -->
          <div class="mock-section">
            <label class="mock-section-label">Sample Preview (First 3 Rows)</label>
            <div class="mock-preview-table-wrap">
              <table class="mock-preview-table">
                <thead><tr>${previewThs}</tr></thead>
                <tbody>${previewTrs}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="mock-modal-footer">
          <button type="button" class="mock-btn-secondary" id="btn-mock-cancel">Cancel</button>
          <button type="button" class="mock-btn-primary" id="btn-mock-generate">
            <span class="material-symbols-outlined icon-16">auto_fix_high</span>
            <span>Generate & Insert ${selectedCount} Rows</span>
          </button>
        </div>
      </div>
    `;

      // Bind event handlers
      modalOverlay
         .querySelector('#btn-mock-close')
         ?.addEventListener('click', closeModal);
      modalOverlay
         .querySelector('#btn-mock-cancel')
         ?.addEventListener('click', closeModal);

      modalOverlay.querySelectorAll('.mock-pill').forEach((btn) => {
         btn.addEventListener('click', () => {
            selectedCount = parseInt(btn.dataset.count, 10);
            renderModalContent();
         });
      });

      const customInput = modalOverlay.querySelector('#mock-custom-count');
      if (customInput) {
         customInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (val && val > 0 && val <= 500) {
               selectedCount = val;
               renderModalContent();
            }
         });
      }

      modalOverlay
         .querySelector('#btn-mock-generate')
         ?.addEventListener('click', async () => {
            const submitBtn = modalOverlay.querySelector('#btn-mock-generate');
            if (!submitBtn) return;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin icon-16">progress_activity</span> Inserting...`;

            try {
               const insertRes = await fetch(
                  `/api/tables/${encodeURIComponent(tableName)}/mock`,
                  {
                     method: 'POST',
                     headers: {
                        'Content-Type': 'application/json',
                     },
                     body: JSON.stringify({ count: selectedCount }),
                  },
               );

               const insertJson = await insertRes.json();
               if (!insertJson.success) {
                  throw new Error(
                     insertJson.error || 'Failed to insert mock data',
                  );
               }

               closeModal();
               window.loadTableStats?.();
               window.updateSidebarActiveTable?.(tableName);
               if (window.showToast) {
                  window.showToast(
                     `Successfully generated and inserted ${insertJson.count || selectedCount} rows into "${tableName}"!`,
                     'success',
                  );
               }
               if (onComplete) onComplete();
            } catch (err) {
               alert(`Failed to insert mock data: ${err.message}`);
               submitBtn.disabled = false;
               submitBtn.innerHTML = `<span>Try Again</span>`;
            }
         });
   }

   renderModalContent();
}
