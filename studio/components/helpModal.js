/**
 * Help & Shortcuts Modal Component for Drixio Studio
 * Shows global keyboard shortcuts, tips, and documentation links.
 */

import { createModal } from './modal.js';

let activeHelpModal = null;

export function openHelpModal() {
   if (activeHelpModal) {
      activeHelpModal.close();
   }

   activeHelpModal = createModal({
      id: 'help-modal-overlay',
      icon: 'help',
      iconColor: 'primary',
      title: 'Shortcuts & Documentation',
      subtitle: 'Drixio Studio Edition Tips & Resources',
      badge: 'Help',
      width: '640px',
      body: /* html */ `
         <div class="help-modal-body" style="padding: 0;">
            <div class="shortcuts-group">
               <h4 class="shortcuts-group-title">Global Shortcuts</h4>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Quick Search / Focus Table Filter</span>
                  <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>/</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Close Modal / Dismiss Popover</span>
                  <div class="shortcut-keys"><kbd>Esc</kbd></div>
               </div>
            </div>

            <div class="shortcuts-group">
               <h4 class="shortcuts-group-title">Data Grid & Editor</h4>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Inline Edit Cell</span>
                  <div class="shortcut-keys"><kbd>Double Click</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Save Cell Edit</span>
                  <div class="shortcut-keys"><kbd>Enter</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Run Query in SQL Console</span>
                  <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></div>
               </div>
            </div>

            <div class="help-links-group">
               <a href="https://github.com/TerKSDev/drixio" target="_blank" rel="noopener noreferrer" class="help-link-card">
                  <span class="material-symbols-outlined">code</span>
                  <div>
                     <span class="link-card-title">GitHub Repository</span>
                     <span class="link-card-desc">Source code, releases, and roadmap</span>
                  </div>
                  <span class="material-symbols-outlined card-arrow">open_in_new</span>
               </a>
               <a href="https://github.com/TerKSDev/drixio/issues" target="_blank" rel="noopener noreferrer" class="help-link-card">
                  <span class="material-symbols-outlined">bug_report</span>
                  <div>
                     <span class="link-card-title">Report an Issue</span>
                     <span class="link-card-desc">Found a bug or have a suggestion?</span>
                  </div>
                  <span class="material-symbols-outlined card-arrow">open_in_new</span>
               </a>
            </div>
         </div>
      `,
      footer: /* html */ `
         <span class="help-version-tag">Drixio Studio Edition</span>
         <button type="button" id="help-modal-done-btn" class="btn-secondary" style="padding: 5px 14px; font-size: 12px; cursor: pointer;">Close</button>
      `,
      onClose: () => {
         activeHelpModal = null;
      },
   });

   const doneBtn = activeHelpModal.footer.querySelector('#help-modal-done-btn');
   if (doneBtn) {
      doneBtn.onclick = () => activeHelpModal.close();
   }
}

export function closeHelpModal() {
   if (activeHelpModal) {
      activeHelpModal.close();
      activeHelpModal = null;
   }
}
