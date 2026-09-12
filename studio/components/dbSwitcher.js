/**
 * Database Switcher Component for Drixio Studio
 * Renders the Supabase-style project/database switcher dropdown
 * allowing hot-swapping between saved SQLite, PostgreSQL, and MySQL databases.
 */

import {
   getSavedConnections,
   removeConnection,
   switchDatabase,
} from '../lib/connections.js';

let dropdownEl = null;

export function initDbSwitcher() {
   const triggerBtn = document.getElementById('breadcrumb-db-crumb');
   dropdownEl = document.getElementById('db-switcher-dropdown');

   if (!triggerBtn || !dropdownEl) return;

   triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdownEl.classList.contains('hidden');
      if (isHidden) {
         renderDbSwitcherMenu();
         dropdownEl.classList.remove('hidden');
         triggerBtn.classList.add('is-open');
      } else {
         dropdownEl.classList.add('hidden');
         triggerBtn.classList.remove('is-open');
      }
   });

   document.addEventListener('click', (e) => {
      if (
         dropdownEl &&
         !dropdownEl.contains(e.target) &&
         !triggerBtn.contains(e.target)
      ) {
         dropdownEl.classList.add('hidden');
         triggerBtn.classList.remove('is-open');
      }
   });

   document.addEventListener('keydown', (e) => {
      if (
         e.key === 'Escape' &&
         dropdownEl &&
         !dropdownEl.classList.contains('hidden')
      ) {
         dropdownEl.classList.add('hidden');
         triggerBtn.classList.remove('is-open');
      }
   });
}

export function renderDbSwitcherMenu() {
   if (!dropdownEl) {
      dropdownEl = document.getElementById('db-switcher-dropdown');
      if (!dropdownEl) return;
   }

   const connections = getSavedConnections();
   const activeDbName =
      document.getElementById('db-name')?.textContent?.trim().toLowerCase() ||
      '';

   const getDialectIcon = (dialect) => {
      switch (dialect) {
         case 'postgres':
            return 'dns';
         case 'mysql':
            return 'storage';
         case 'sqlite':
         default:
            return 'data_object';
      }
   };

   dropdownEl.innerHTML = /* html */ `
      <div class="db-switcher-header">
         <span class="db-switcher-title">DATABASES</span>
         <span class="db-switcher-count">${connections.length}</span>
      </div>

      <div class="db-switcher-list">
         ${
            connections.length === 0
               ? /* html */ `<div class="db-switcher-empty">No saved databases yet. Connect or create one below!</div>`
               : connections
                    .map((conn) => {
                       const isActive =
                          conn.name.toLowerCase() === activeDbName ||
                          conn.url.toLowerCase().includes(activeDbName);
                       return /* html */ `
               <div class="db-switcher-item ${isActive ? 'active' : ''}" data-id="${conn.id}">
                  <div class="db-item-icon-wrap ${conn.dialect}">
                     <span class="material-symbols-outlined db-item-icon">${getDialectIcon(conn.dialect)}</span>
                  </div>
                  <div class="db-item-info">
                     <div class="db-item-name-row">
                        <span class="db-item-name">${escapeHtml(conn.name)}</span>
                        ${
                           isActive
                              ? `<span class="db-active-badge">Active</span>`
                              : ''
                        }
                     </div>
                     <span class="db-item-meta">${escapeHtml(conn.badgeLabel || (conn.isRemote ? 'REMOTE' : 'LOCAL'))}</span>
                  </div>
                  ${
                     isActive
                        ? `<span class="material-symbols-outlined db-active-check">check</span>`
                        : `<button type="button" class="db-remove-btn" title="Forget database" data-id="${conn.id}">✕</button>`
                  }
               </div>
            `;
                    })
                    .join('')
         }
      </div>

      <div class="db-switcher-divider"></div>

      <div class="db-switcher-footer">
         <button type="button" id="db-switcher-new-btn" class="db-switcher-new-btn">
            <span class="material-symbols-outlined">add</span>
            <span>Connect or Create New Database...</span>
         </button>
      </div>
   `;

   // Bind Item Click to Switch Database
   dropdownEl.querySelectorAll('.db-switcher-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
         // If click was on remove button, do not switch
         if (e.target.closest('.db-remove-btn')) return;

         const id = item.getAttribute('data-id');
         const target = connections.find((c) => c.id === id);
         if (target) {
            dropdownEl.classList.add('hidden');
            const triggerBtn = document.getElementById('breadcrumb-db-crumb');
            triggerBtn?.classList.remove('is-open');
            await switchDatabase(target);
         }
      });
   });

   // Bind Remove Button
   dropdownEl.querySelectorAll('.db-remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
         e.stopPropagation();
         const id = btn.getAttribute('data-id');
         if (id) {
            removeConnection(id);
            renderDbSwitcherMenu();
         }
      });
   });

   // Bind "+ Connect New Database" button
   const newBtn = document.getElementById('db-switcher-new-btn');
   if (newBtn) {
      newBtn.addEventListener('click', (e) => {
         e.stopPropagation();
         dropdownEl.classList.add('hidden');
         const triggerBtn = document.getElementById('breadcrumb-db-crumb');
         triggerBtn?.classList.remove('is-open');
         if (typeof window.handleSwitchTab === 'function') {
            window.handleSwitchTab('connect-btn');
         }
      });
   }
}

function escapeHtml(str) {
   if (!str) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}
