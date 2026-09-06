/**
 * SQL Console Safe Mode Modal & Utility
 * Intercepts dangerous SQL queries (DELETE/UPDATE without WHERE, DROP, TRUNCATE)
 */

export const isSafeModeEnabled = () => {
   return localStorage.getItem('drixio_safe_mode_disabled') !== 'true';
};

export const setSafeModeEnabled = (enabled) => {
   if (enabled) {
      localStorage.removeItem('drixio_safe_mode_disabled');
   } else {
      localStorage.setItem('drixio_safe_mode_disabled', 'true');
   }
   window.dispatchEvent(
      new CustomEvent('drixio-safemode-changed', { detail: { enabled } }),
   );
};

/**
 * Strips comments from SQL text
 */
const stripSqlComments = (sql) => {
   return sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
};

/**
 * Analyzes SQL statement(s) for destructive operations without WHERE clauses
 */
export const analyzeDangerousQuery = (rawSql) => {
   if (!rawSql) return { isDangerous: false };

   const cleaned = stripSqlComments(rawSql);
   if (!cleaned) return { isDangerous: false };

   // Split multiple statements separated by semicolon (not inside quotes)
   const statements = cleaned
      .split(/;(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/)
      .map((s) => s.trim())
      .filter(Boolean);

   for (const stmt of statements) {
      const normalized = stmt.replace(/\s+/g, ' ');

      // 1. DROP TABLE or DROP DATABASE / SCHEMA
      const dropMatch = normalized.match(
         /^DROP\s+(TABLE|DATABASE|SCHEMA)\s+(IF\s+EXISTS\s+)?([`"']?[a-zA-Z0-9_]+[`"']?)/i,
      );
      if (dropMatch) {
         const targetType = dropMatch[1].toUpperCase();
         const targetName = dropMatch[3] || 'target';
         return {
            isDangerous: true,
            type: `DROP ${targetType}`,
            title: `Permanent Deletion: DROP ${targetType}`,
            description: `This statement will permanently destroy the ${targetType.toLowerCase()} <code>${targetName}</code> and all data contained within it.`,
            sql: stmt,
         };
      }

      // 2. TRUNCATE TABLE or TRUNCATE
      const truncateMatch = normalized.match(
         /^TRUNCATE(\s+TABLE)?\s+([`"']?[a-zA-Z0-9_]+[`"']?)/i,
      );
      if (truncateMatch) {
         const targetName = truncateMatch[2] || 'target';
         return {
            isDangerous: true,
            type: 'TRUNCATE TABLE',
            title: 'Wipe Out Table: TRUNCATE',
            description: `This statement will immediately wipe out ALL records in table <code>${targetName}</code>.`,
            sql: stmt,
         };
      }

      // 3. DELETE without WHERE or trivial WHERE (WHERE 1=1 or WHERE true)
      if (
         /^DELETE\s+FROM\s+/i.test(normalized) ||
         /^DELETE\s+[a-zA-Z0-9_`"']+\s+FROM/i.test(normalized)
      ) {
         const hasWhere = /\bWHERE\b/i.test(normalized);
         if (!hasWhere) {
            return {
               isDangerous: true,
               type: 'DELETE without WHERE',
               title: 'Unrestricted DELETE Statement',
               description:
                  'This <b>DELETE</b> query does NOT contain a <code>WHERE</code> clause. Executing this will permanently delete <b>EVERY SINGLE RECORD</b> in the table.',
               sql: stmt,
            };
         }

         // Check trivial WHERE like WHERE 1=1 or WHERE true
         const wherePart = normalized
            .substring(normalized.search(/\bWHERE\b/i) + 5)
            .trim();
         if (/^(1\s*=\s*1|true|1)\s*$/i.test(wherePart)) {
            return {
               isDangerous: true,
               type: 'DELETE with Trivial WHERE',
               title: 'Unrestricted DELETE Statement',
               description:
                  'This <b>DELETE</b> query uses an unconditional clause (<code>WHERE 1=1 / true</code>) which will delete <b>ALL RECORDS</b> in the table.',
               sql: stmt,
            };
         }
      }

      // 4. UPDATE without WHERE or trivial WHERE
      if (/^UPDATE\s+([`"']?[a-zA-Z0-9_]+[`"']?)\s+SET\s+/i.test(normalized)) {
         const hasWhere = /\bWHERE\b/i.test(normalized);
         if (!hasWhere) {
            return {
               isDangerous: true,
               type: 'UPDATE without WHERE',
               title: 'Unrestricted UPDATE Statement',
               description:
                  'This <b>UPDATE</b> query does NOT contain a <code>WHERE</code> clause. Executing this will overwrite data in <b>EVERY SINGLE RECORD</b> in the table.',
               sql: stmt,
            };
         }

         const wherePart = normalized
            .substring(normalized.search(/\bWHERE\b/i) + 5)
            .trim();
         if (/^(1\s*=\s*1|true|1)\s*$/i.test(wherePart)) {
            return {
               isDangerous: true,
               type: 'UPDATE with Trivial WHERE',
               title: 'Unrestricted UPDATE Statement',
               description:
                  'This <b>UPDATE</b> query uses an unconditional clause (<code>WHERE 1=1 / true</code>) which will overwrite <b>ALL RECORDS</b> in the table.',
               sql: stmt,
            };
         }
      }
   }

   return { isDangerous: false };
};

/**
 * Shows confirmation modal for dangerous queries
 */
export const showSafeQueryModal = ({
   dangerInfo,
   fullSql,
   onConfirm,
   onCancel,
}) => {
   let existingModal = document.getElementById('safe-mode-modal');
   if (existingModal) existingModal.remove();

   const modal = document.createElement('div');
   modal.id = 'safe-mode-modal';
   modal.className = 'modal-overlay';

   const displaySql = (dangerInfo?.sql || fullSql || '').trim();

   modal.innerHTML = /* html */ `
    <div class="modal-container safe-modal-container">
      <div class="safe-modal-header">
        <div class="safe-modal-title-wrap">
          <div class="safe-modal-icon">
            <span class="material-symbols-outlined">warning</span>
          </div>
          <div>
            <h3 class="safe-modal-title">${dangerInfo.title || 'Destructive Operation Warning'}</h3>
            <span class="safe-modal-badge">${dangerInfo.type || 'HIGH RISK'}</span>
          </div>
        </div>
        <button id="safe-modal-close-btn" class="modal-close-btn" title="Cancel">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="safe-modal-body">
        <p class="safe-modal-desc">${dangerInfo.description}</p>
        
        <div class="safe-sql-preview-label">Statement to be executed:</div>
        <div class="safe-sql-preview">
          <code>${displaySql.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>
        </div>

        <div class="safe-modal-preference">
          <label class="safe-checkbox-label">
            <input type="checkbox" id="safe-dont-warn-checkbox" />
            <span class="safe-checkbox-text">不再提示 (Don't warn me again)</span>
          </label>
          <span class="safe-preference-hint">You can re-enable Safe Mode anytime from the Console toolbar.</span>
        </div>
      </div>

      <div class="safe-modal-footer">
        <button type="button" id="safe-modal-cancel-btn" class="btn-secondary">
          Cancel
        </button>
        <button type="button" id="safe-modal-confirm-btn" class="safe-btn-confirm">
          <span class="material-symbols-outlined" style="font-size: 16px;">gavel</span>
          <span>Confirm & Run</span>
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
      if (e.key === 'Escape') {
         closeFn();
         if (onCancel) onCancel();
      }
   };
   document.addEventListener('keydown', handleKeydown);

   modal.addEventListener('click', (e) => {
      if (e.target === modal) {
         closeFn();
         if (onCancel) onCancel();
      }
   });

   document.getElementById('safe-modal-close-btn').onclick = () => {
      closeFn();
      if (onCancel) onCancel();
   };

   document.getElementById('safe-modal-cancel-btn').onclick = () => {
      closeFn();
      if (onCancel) onCancel();
   };

   document.getElementById('safe-modal-confirm-btn').onclick = () => {
      const dontWarn = document.getElementById(
         'safe-dont-warn-checkbox',
      )?.checked;
      if (dontWarn) {
         setSafeModeEnabled(false);
         if (window.showToast) {
            window.showToast(
               'Safe Mode disabled. Future queries will run without confirmation.',
               'info',
            );
         }
      }
      closeFn();
      if (onConfirm) onConfirm();
   };
};
