import { openDropdownPicker } from '../../components/dropdownPicker.js';

export async function openExportOrmModal(initialTable) {
   let modal = document.getElementById('orm-export-modal');
   if (modal) modal.remove();

   let activeTarget = 'prisma'; // 'prisma' | 'drizzle'
   let activeScope = initialTable || '*'; // table name or '*'
   let currentCode = '';

   modal = document.createElement('div');
   modal.id = 'orm-export-modal';
   modal.className = 'modal-overlay';

   const dbType = (window.AppState?.dbType || 'database').toUpperCase();

   modal.innerHTML = /* html */ `
    <div class="orm-modal-container">
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size: 20px;">bolt</span>
          <h3 class="m-0 text-15 font-semibold">Generate ORM Schema</h3>
          <span class="badge-type" style="font-size: 10px; padding: 2px 7px; border-radius: 4px; background: rgba(59, 130, 246, 0.12); color: var(--color-primary); font-weight: 700;">${dbType}</span>
        </div>
        <button id="close-orm-modal-btn" class="modal-close-btn" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div class="orm-controls-bar">
        <div class="orm-tab-group">
          <button type="button" id="tab-orm-prisma" class="orm-tab-btn active">
            <span class="material-symbols-outlined" style="font-size: 15px;">diamond</span>
            <span>Prisma ORM</span>
          </button>
          <button type="button" id="tab-orm-drizzle" class="orm-tab-btn">
            <span class="material-symbols-outlined" style="font-size: 15px;">water_drop</span>
            <span>Drizzle ORM</span>
          </button>
        </div>

        <div class="orm-scope-group">
          <label class="orm-scope-label" for="orm-scope-select">Scope:</label>
          <button type="button" id="orm-scope-select" class="orm-scope-select" style="display: flex; justify-content: space-between; align-items: center; gap: 6px; cursor: pointer; height: 28px; padding: 0 8px; font-size: 12px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text);">
            <span id="orm-scope-display">${initialTable ? `Table: ${initialTable}` : 'All Tables (Database)'}</span>
            <span class="material-symbols-outlined" style="font-size: 16px; color: var(--color-text-soft);">expand_more</span>
          </button>
        </div>
      </div>

      <div class="orm-code-wrapper">
        <div class="orm-code-header">
          <div class="orm-code-file-badge">
            <span class="material-symbols-outlined" style="font-size: 14px;">description</span>
            <span id="orm-file-name-label">schema.prisma</span>
          </div>
          <button type="button" id="orm-copy-code-btn" class="orm-code-copy-btn" title="Copy code to clipboard">
            <span class="material-symbols-outlined" style="font-size: 14px;">content_copy</span>
            <span id="orm-copy-btn-text">Copy Code</span>
          </button>
        </div>
        <div class="orm-code-scroll">
          <pre><code id="orm-code-display" class="orm-code-content">// Generating schema...</code></pre>
        </div>
      </div>

      <div class="modal-footer" style="justify-content: space-between; align-items: center;">
        <div class="orm-modal-footer-hint">
          <span class="material-symbols-outlined" style="font-size: 15px; color: #f59e0b;">lightbulb</span>
          <span>Automatic project setup (<code>drixio add prisma/drizzle</code>) coming soon!</span>
        </div>
        <button type="button" id="close-orm-btn" class="btn-secondary">Close</button>
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

   document.getElementById('close-orm-modal-btn').onclick = closeFn;
   document.getElementById('close-orm-btn').onclick = closeFn;

   const codeDisplay = document.getElementById('orm-code-display');
   const fileNameLabel = document.getElementById('orm-file-name-label');
   const copyBtn = document.getElementById('orm-copy-code-btn');
   const copyBtnText = document.getElementById('orm-copy-btn-text');
   const tabPrisma = document.getElementById('tab-orm-prisma');
   const tabDrizzle = document.getElementById('tab-orm-drizzle');
   const scopeSelect = document.getElementById('orm-scope-select');

   let availableTables = [];
   try {
      const res = await fetch('/api/tables');
      const json = await res.json();
      if (json.success && json.data) {
         availableTables = json.data;
      }
   } catch (e) {
      // ignore
   }

   const fetchOrmCode = async () => {
      codeDisplay.textContent = `// Loading ${activeTarget === 'prisma' ? 'Prisma' : 'Drizzle'} schema...`;
      fileNameLabel.textContent =
         activeTarget === 'prisma' ? 'schema.prisma' : 'schema.ts';

      try {
         const res = await fetch(
            `/api/generate-orm?target=${encodeURIComponent(activeTarget)}&table=${encodeURIComponent(activeScope)}`,
         );
         const json = await res.json();
         if (json.success && json.data) {
            currentCode = json.data.code || '';
            codeDisplay.textContent = currentCode;
         } else {
            codeDisplay.textContent = `// Error generating schema:\n// ${json.error || 'Unknown error'}`;
         }
      } catch (err) {
         codeDisplay.textContent = `// Failed to fetch ORM schema: ${err.message}`;
      }
   };

   tabPrisma.onclick = () => {
      if (activeTarget === 'prisma') return;
      activeTarget = 'prisma';
      tabPrisma.classList.add('active');
      tabDrizzle.classList.remove('active');
      fetchOrmCode();
   };

   tabDrizzle.onclick = () => {
      if (activeTarget === 'drizzle') return;
      activeTarget = 'drizzle';
      tabDrizzle.classList.add('active');
      tabPrisma.classList.remove('active');
      fetchOrmCode();
   };

   scopeSelect.onclick = (e) => {
      e.stopPropagation();
      const items = [
         { name: 'All Tables (Database)', value: '*', icon: 'database' },
         ...availableTables.map((t) => ({
            name: `Table: ${t}`,
            value: t,
            icon: 'table_chart',
         })),
      ];

      openDropdownPicker({
         anchorEl: scopeSelect,
         title: 'ORM Generation Scope',
         searchable: availableTables.length > 4,
         placeholder: 'Search tables...',
         initialValue: activeScope,
         items,
         onSelect: (val) => {
            activeScope = val;
            const disp = document.getElementById('orm-scope-display');
            if (disp)
               disp.textContent =
                  val === '*' ? 'All Tables (Database)' : `Table: ${val}`;
            fetchOrmCode();
         },
      });
   };

   copyBtn.onclick = () => {
      if (!currentCode) return;
      navigator.clipboard.writeText(currentCode);
      copyBtnText.textContent = 'Copied!';
      if (window.showToast) {
         window.showToast(
            `${activeTarget === 'prisma' ? 'Prisma' : 'Drizzle'} schema copied to clipboard!`,
            'success',
         );
      }
      setTimeout(() => {
         copyBtnText.textContent = 'Copy Code';
      }, 1800);
   };

   // Initial load
   fetchOrmCode();
}
