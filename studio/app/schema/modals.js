import { updateSchemaCell } from "./core.js";

export function openIndexModal() {
  const sg = window.SchemaGrid;
  if (!sg) return;

  let modal = document.getElementById("index-modal");
  if (modal) modal.remove();

  const existingIndexes = [...sg.indexes];
  const added = [...sg.pendingIndexEdits.added];
  const dropped = new Set(sg.pendingIndexEdits.dropped);

  let activeIndexes = existingIndexes
    .filter((i) => !dropped.has(i.name))
    .concat(added);

  const schemaCols = sg.schema.map((c) => c.name);
  sg.pendingInserts.forEach((row) => {
    if (row.name && row.name.trim() !== "") {
      schemaCols.push(row.name.trim());
    }
  });

  const colOptions = schemaCols
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");

  modal = document.createElement("div");
  modal.id = "index-modal";
  modal.style.cssText = `
    position: fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5);
    display:flex; justify-content:center; align-items:center; z-index:9999;
  `;
  modal.innerHTML = /* html */ `
    <div class="modal-container" class="w-500">
      <div class="modal-header">
        <h3 class="m-0">Manage Indexes</h3>
        <button id="close-idx-modal" class="modal-close-btn"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body-scroll" id="idx-list-container">
      </div>
      <div class="modal-section-bg">
        <div class="font-semibold mb-2">Add New Index</div>
        <div class="flex-col gap-2">
          <input type="text" id="new-idx-name" placeholder="Index Name (Optional)" class="modal-input" />
          <select id="new-idx-cols" multiple class="modal-input" class="h-80">
            ${colOptions}
          </select>
          <div class="text-12 text-soft">Hold Ctrl/Cmd to select multiple columns</div>
          <label class="items-center gap-6px cursor-pointer">
            <input type="checkbox" id="new-idx-unique" /> Unique Index
          </label>
          <button id="add-idx-btn" class="primary" class="btn-primary">Add</button>
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancel-idx-btn" class="secondary" class="btn-secondary">Cancel</button>
        <button id="save-idx-btn" class="primary" class="btn-primary">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeFn = () => modal.remove();
  document.getElementById("close-idx-modal").onclick = closeFn;
  document.getElementById("cancel-idx-btn").onclick = closeFn;

  const renderList = () => {
    let html = activeIndexes
      .map(
        (idx, i) => `
      <div class="index-row" class="index-row-container">
        <div class="flex-1"><strong>${idx.name || "-"}</strong></div>
        <div class="flex-2 text-12 text-secondary">${idx.columns.join(", ")}</div>
        <div class="w-60 text-12 text-center">${idx.isUnique ? "UNIQUE" : ""}</div>
        <button class="icon-btn delete-idx-btn" data-idx="${i}" class="text-error btn-icon"><span class="material-symbols-outlined" class="icon-18">delete</span></button>
      </div>
    `,
      )
      .join("");
    if (activeIndexes.length === 0)
      html = `<div class="p-4 text-center text-secondary">No indexes yet.</div>`;
    document.getElementById("idx-list-container").innerHTML = html;

    document.querySelectorAll(".delete-idx-btn").forEach((btn) => {
      btn.onclick = (e) => {
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        activeIndexes.splice(i, 1);
        renderList();
      };
    });
  };

  renderList();

  document.getElementById("add-idx-btn").onclick = () => {
    const name = document.getElementById("new-idx-name").value.trim();
    const select = document.getElementById("new-idx-cols");
    const cols = Array.from(select.selectedOptions).map((o) => o.value);
    const unique = document.getElementById("new-idx-unique").checked;

    if (cols.length === 0) {
      alert("Please select at least one column for the index.");
      return;
    }

    activeIndexes.push({ name, columns: cols, isUnique: unique });
    document.getElementById("new-idx-name").value = "";
    document.getElementById("new-idx-unique").checked = false;
    select.selectedIndex = -1;
    renderList();
  };

  document.getElementById("save-idx-btn").onclick = () => {
    const newAdded = [];
    const newDropped = new Set();

    existingIndexes.forEach((idx) => {
      const found = activeIndexes.find(
        (a) =>
          a.name === idx.name &&
          JSON.stringify(a.columns) === JSON.stringify(idx.columns),
      );
      if (!found) {
        newDropped.add(idx.name);
      }
    });

    activeIndexes.forEach((idx) => {
      const found = existingIndexes.find(
        (e) =>
          e.name === idx.name &&
          JSON.stringify(e.columns) === JSON.stringify(idx.columns),
      );
      if (!found) {
        newAdded.push(idx);
      }
    });

    sg.pendingIndexEdits.added = newAdded;
    sg.pendingIndexEdits.dropped = Array.from(newDropped);

    window.updateSidebarDirtyState?.();
    window.renderSchemaGrid();
    closeFn();
  };
}

export async function openPkFkModal(td, currentText) {
  const sg = window.SchemaGrid;
  if (!sg) return;

  let modal = document.getElementById("pkfk-modal");
  if (modal) modal.remove();

  const isNewRow = td.dataset.insertIndex !== undefined;

  // Parse current text
  let isPk = currentText.includes("PK");
  let isFk = currentText.includes("FK");
  let fkTable = "";
  let fkCol = "";

  if (isFk) {
    const fkMatch = currentText.match(/FK \((.*?)\)/);
    if (fkMatch && fkMatch[1]) {
      const parts = fkMatch[1].split(".");
      if (parts.length === 2) {
        fkTable = parts[0];
        fkCol = parts[1];
      }
    } else {
      // maybe it's in the raw "FK: table.col" format (e.g. while editing pendingInserts)
      const rawMatch = currentText.match(/FK:\s*([^\s,]+)/i);
      if (rawMatch && rawMatch[1]) {
        const parts = rawMatch[1].split(".");
        if (parts.length === 2) {
          fkTable = parts[0];
          fkCol = parts[1];
        }
      }
    }
  }

  modal = document.createElement("div");
  modal.id = "pkfk-modal";
  modal.style.cssText = `
    position: fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5);
    display:flex; justify-content:center; align-items:center; z-index:9999;
  `;

  modal.innerHTML = /* html */ `
    <div class="modal-container" class="w-400">
      <div class="modal-header">
        <h3 class="m-0">Manage Keys</h3>
        <button id="close-pkfk-modal" class="modal-close-btn"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <label class="items-center gap-2 cursor-pointer">
          <input type="checkbox" id="modal-is-pk" ${isPk ? "checked" : ""} />
          <strong>Primary Key (PK)</strong>
        </label>
        
        <div class="divider-y"></div>
        
        <label class="flex items-center gap-2 ${isNewRow ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-60'}">
          <input type="checkbox" id="modal-is-fk" ${isFk ? "checked" : ""} ${!isNewRow ? "disabled" : ""} />
          <strong>Foreign Key (FK)</strong>
        </label>
        
        ${!isNewRow ? `<div class="text-11 text-soft mt-n12 ml-24">Note: FKs can only be added when creating new columns.</div>` : ""}
        
        <div id="fk-settings-container" class="flex-col gap-2 pl-6 ${isFk ? 'flex' : 'hidden'}">
          <div>
            <div class="text-12 text-secondary mb-1">Target Table</div>
            <select id="modal-fk-table" class="modal-input w-full">
              <option value="">Loading tables...</option>
            </select>
          </div>
          <div>
            <div class="text-12 text-secondary mb-1">Target Column</div>
            <select id="modal-fk-col" class="modal-input w-full" ${!fkTable ? "disabled" : ""}>
              <option value="">Select a table first</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancel-pkfk-btn" class="secondary" class="btn-secondary">Cancel</button>
        <button id="save-pkfk-btn" class="primary" class="btn-primary">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeFn = () => modal.remove();
  document.getElementById("close-pkfk-modal").onclick = closeFn;
  document.getElementById("cancel-pkfk-btn").onclick = closeFn;

  const isFkCheckbox = document.getElementById("modal-is-fk");
  const fkContainer = document.getElementById("fk-settings-container");
  const tableSelect = document.getElementById("modal-fk-table");
  const colSelect = document.getElementById("modal-fk-col");

  isFkCheckbox.addEventListener("change", (e) => {
    fkContainer.style.display = e.target.checked ? "flex" : "none";
  });

  // Load tables dynamically using fetch (avoids circular deps with api.js)
  try {
    const res = await fetch("/api/tables");
    const json = await res.json();
    if (json.success && json.data) {
      tableSelect.innerHTML =
        '<option value="">-- Select Table --</option>' +
        json.data
          .map(
            (t) =>
              `<option value="${t}" ${t === fkTable ? "selected" : ""}>${t}</option>`,
          )
          .join("");

      if (fkTable) {
        loadColumnsForTable(fkTable, fkCol);
      }
    }
  } catch (err) {
    tableSelect.innerHTML = '<option value="">Error loading tables</option>';
  }

  async function loadColumnsForTable(tName, selectedCol = "") {
    colSelect.disabled = true;
    colSelect.innerHTML = '<option value="">Loading columns...</option>';
    try {
      const res = await fetch(`/api/tables/${tName}/schema`);
      const json = await res.json();
      if (json.success && json.data) {
        colSelect.innerHTML =
          '<option value="">-- Select Column --</option>' +
          json.data
            .map(
              (c) =>
                `<option value="${c.name}" ${c.name === selectedCol ? "selected" : ""}>${c.name}</option>`,
            )
            .join("");
        colSelect.disabled = false;
      }
    } catch (err) {
      colSelect.innerHTML = '<option value="">Error loading columns</option>';
    }
  }

  tableSelect.addEventListener("change", (e) => {
    const t = e.target.value;
    if (t) {
      loadColumnsForTable(t);
    } else {
      colSelect.innerHTML = '<option value="">Select a table first</option>';
      colSelect.disabled = true;
    }
  });

  document.getElementById("save-pkfk-btn").onclick = () => {
    const pkChecked = document.getElementById("modal-is-pk").checked;
    const fkChecked = document.getElementById("modal-is-fk").checked;

    const t = tableSelect.value;
    const c = colSelect.value;

    if (
      pkChecked === isPk &&
      fkChecked === isFk &&
      t === fkTable &&
      c === fkCol
    ) {
      closeFn();
      return;
    }

    let newVal = "";
    if (pkChecked && fkChecked) {
      if (!t || !c) {
        alert(
          "Please select both Target Table and Target Column for the Foreign Key.",
        );
        return;
      }
      newVal = `PK, FK: ${t}.${c}`;
    } else if (pkChecked) {
      newVal = "PK";
    } else if (fkChecked) {
      if (!t || !c) {
        alert(
          "Please select both Target Table and Target Column for the Foreign Key.",
        );
        return;
      }
      newVal = `FK: ${t}.${c}`;
    }

    window.SchemaGrid.currentTransaction = [];
    const columns = [
      "name",
      "type",
      "isPk",
      "nullable",
      "defaultValue",
      "indexing",
    ];
    updateSchemaCell(td, newVal, columns);
    if (window.SchemaGrid.currentTransaction.length > 0)
      window.SchemaGrid.history.push(window.SchemaGrid.currentTransaction);
    window.SchemaGrid.currentTransaction = null;

    closeFn();
  };
}
