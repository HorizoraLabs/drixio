import { updateCell } from "./core.js";
import { executeRawQuery } from "../../lib/api.js";

export function bindCellEditor(tableContainer, schema, columns) {
  tableContainer.addEventListener("dblclick", (e) => {
    const td = e.target.closest("td.data-cell");
    if (!td || td.querySelector("input, select")) return;

    const colName = td.dataset.col;
    const colSchema = schema.find((c) => c.name === colName);
    const typeUpper = colSchema?.type?.toUpperCase() || "";
    const isEnum = typeUpper.includes("ENUM");
    const isDate = typeUpper === "DATE";
    const isDateTime =
      typeUpper.includes("DATETIME") || typeUpper.includes("TIMESTAMP");
    const isBool = typeUpper.includes("BOOL") || typeUpper === "TINYINT(1)";

    const isGhost = td.classList.contains("ghost-row") || (td.dataset.insertIndex !== undefined && !td.classList.contains("cell-edited"));
    const textVal = td.textContent.trim();
    const rawText =
      isGhost || textVal === "null" || textVal === "+ New" || textVal === "+ Add Row"
        ? ""
        : td.textContent;

    let inputEl;
    if (colSchema && colSchema.fkTarget) {
      inputEl = document.createElement("select");
      const loadingOpt = document.createElement("option");
      loadingOpt.value = rawText;
      loadingOpt.textContent = "Loading...";
      inputEl.appendChild(loadingOpt);
      
      // Fetch FK options asynchronously
      const { table, column } = colSchema.fkTarget;
      executeRawQuery(`SELECT * FROM "${table}" LIMIT 100`).then(res => {
          if (res.success && res.data && res.data.rows) {
            inputEl.innerHTML = ""; // clear loading
            
            // Add a null/empty option if nullable
            if (colSchema.nullable) {
              const emptyOpt = document.createElement("option");
              emptyOpt.value = "";
              emptyOpt.textContent = "-- None --";
              inputEl.appendChild(emptyOpt);
            }
            
            // Try to find a display column (e.g. name, title, label)
            let displayCol = column;
            if (res.data.columns) {
              const possibleNames = ["name", "title", "label", "description"];
              const found = res.data.columns.find(c => possibleNames.includes(c.toLowerCase()));
              if (found) displayCol = found;
            }
            
            res.data.rows.forEach(row => {
              const val = String(row[column]);
              const displayVal = displayCol !== column ? `${val} - ${row[displayCol]}` : val;
              const opt = document.createElement("option");
              opt.value = val;
              opt.textContent = displayVal;
              if (val === rawText) opt.selected = true;
              inputEl.appendChild(opt);
            });
            
            // If the current rawText isn't in the limit 100, add it manually
            if (rawText && !res.data.rows.find(r => String(r[column]) === rawText)) {
              const opt = document.createElement("option");
              opt.value = rawText;
              opt.textContent = `${rawText} (Not in limit)`;
              opt.selected = true;
              inputEl.appendChild(opt);
            }
          }
        }).catch(err => {
          loadingOpt.textContent = "Error loading options";
        });
    } else if (isEnum) {
      const enumMatch = colSchema.type.match(/enum\((.*?)\)/i);
      let options = [];
      if (enumMatch) {
        options = enumMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/^'|'$/g, ""));
      }
      inputEl = document.createElement("select");
      options.forEach((opt) => {
        const op = document.createElement("option");
        op.value = opt;
        op.textContent = opt;
        if (opt === rawText) op.selected = true;
        inputEl.appendChild(op);
      });
    } else if (isDate) {
      inputEl = document.createElement("input");
      inputEl.type = "date";
      inputEl.value = rawText;
    } else if (isDateTime) {
      inputEl = document.createElement("input");
      inputEl.type = "datetime-local";
      const formatted = rawText.replace(" ", "T").slice(0, 16);
      inputEl.value = formatted;
    } else if (isBool) {
      inputEl = document.createElement("input");
      inputEl.type = "checkbox";
      inputEl.checked = rawText === "1" || rawText.toLowerCase() === "true";
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.value = rawText;
    }

    let isModalOpen = false;

    const openModal = () => {
      isModalOpen = true;
      const overlay = document.getElementById("modal-editor-overlay");
      const textarea = document.getElementById("modal-textarea");
      const cancelBtn = document.getElementById("modal-cancel-btn");
      const saveBtn = document.getElementById("modal-save-btn");
      const title = document.getElementById("modal-title");

      if (!overlay || !textarea) return;

      title.textContent = `Edit ${colName}`;
      textarea.value = inputEl.value;
      overlay.classList.remove("hidden");
      overlay.style.display = "flex";
      textarea.focus();

      const closeModal = () => {
        overlay.classList.add("hidden");
        overlay.style.display = "none";
        saveBtn.onclick = null;
        cancelBtn.onclick = null;
        isModalOpen = false;
        inputEl.focus();
      };

      cancelBtn.onclick = closeModal;
      saveBtn.onclick = () => {
        inputEl.value = textarea.value;
        closeModal();
        commitEdit();
      };

      // Close on backdrop click
      overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
      };
    };

    td.innerHTML = "";
    td.appendChild(inputEl);
    if (typeUpper === "" || (!isEnum && !isDate && !isDateTime && !isBool && !(colSchema && colSchema.fkTarget))) {
      const expandBtn = document.createElement("span");
      expandBtn.className = "material-symbols-outlined cell-expand-btn";
      expandBtn.textContent = "open_in_full";
      expandBtn.title = "Open Full Editor (Shift + Enter)";
      expandBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      expandBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal();
      };
      td.appendChild(expandBtn);

      inputEl.style.width = "100%";
      inputEl.style.paddingRight = "32px";

      inputEl.addEventListener("keydown", (e2) => {
        if (e2.key === "Enter" && e2.shiftKey) {
          e2.preventDefault();
          openModal();
        } else if (e2.key === "Enter") {
          inputEl.blur();
        }
        if (e2.key === "Tab") {
          e2.preventDefault();
          inputEl.blur();
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: e2.shiftKey, bubbles: true }));
        }
      });
    } else {
      inputEl.addEventListener("keydown", (e2) => {
        if (e2.key === "Enter") inputEl.blur();
        if (e2.key === "Tab") {
          e2.preventDefault();
          inputEl.blur();
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: e2.shiftKey, bubbles: true }));
        }
      });
    }

    inputEl.focus();

    const commitEdit = () => {
      if (isModalOpen) return;
      let newVal = isBool ? (inputEl.checked ? "1" : "0") : inputEl.value;
      if (isDateTime && newVal) newVal = newVal.replace("T", " ") + ":00";

      window.DataGrid.currentTransaction = [];
      updateCell(td, newVal, columns);
      if (window.DataGrid.currentTransaction.length > 0)
        window.DataGrid.history.push(window.DataGrid.currentTransaction);
      window.DataGrid.currentTransaction = null;
    };

    inputEl.addEventListener("blur", () => {
      setTimeout(() => {
        if (!isModalOpen) commitEdit();
      }, 100);
    });
  });
}
