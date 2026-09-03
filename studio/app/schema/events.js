import { updateSchemaCell } from "./core.js";
import { openIndexModal, openPkFkModal } from "./modals.js";

export function bindSchemaCellEditor(tableContainer, columns) {
  tableContainer.addEventListener("click", (e) => {
    const manageCell = e.target.closest(".manage-indexes-cell");
    if (manageCell) {
      openIndexModal();
    }
  });

  tableContainer.addEventListener("dblclick", (e) => {
    const td = e.target.closest("td.data-cell");
    if (!td || td.querySelector("input, select")) return;

    const colKey = td.dataset.colKey;
    const isNewRow = td.dataset.insertIndex !== undefined;

    const rawText =
      isNewRow || td.textContent === "-" || td.textContent === "+ New" || td.textContent.includes("Add column") || td.textContent === "+ Add Row" || td.textContent === "null"
        ? ""
        : (td.textContent.trim().startsWith("Yes") ? "1" : (td.textContent.trim() === "No" ? "" : td.textContent));

    let inputEl;
    if (colKey === "isPk") {
      openPkFkModal(td, td.textContent);
      return;
    } else if (colKey === "nullable") {
      const origColName = td.dataset.pk;
      const colSchema = window.SchemaGrid?.schema?.find((c) => c.name === origColName);
      const isPk = colSchema ? colSchema.isPk : false;
      const newRowPk = isNewRow && window.SchemaGrid?.pendingInserts?.[parseInt(td.dataset.insertIndex)]?.isPk;

      if (isPk || newRowPk) {
        if (window.showToast) {
          window.showToast("Primary Key cannot be nullable.", "error");
        } else {
          alert("Primary Key cannot be nullable.");
        }
        return;
      }

      inputEl = document.createElement("select");
      const opts = ["No", "Yes"];
      opts.forEach((opt) => {
        const op = document.createElement("option");
        op.value = opt;
        op.textContent = opt;
        if ((opt === "Yes" && rawText === "1") || (opt === "No" && rawText === "")) op.selected = true;
        inputEl.appendChild(op);
      });
    } else if (colKey === "isUnique") {
      const origColName = td.dataset.pk;
      const colSchema = window.SchemaGrid?.schema?.find((c) => c.name === origColName);
      const isPk = colSchema ? colSchema.isPk : false;
      const newRowPk = isNewRow && window.SchemaGrid?.pendingInserts?.[parseInt(td.dataset.insertIndex)]?.isPk;

      if (isPk || newRowPk) {
        if (window.showToast) {
          window.showToast("Primary Key is always unique and locked.", "error");
        } else {
          alert("Primary Key is always unique and locked.");
        }
        return;
      }

      inputEl = document.createElement("select");
      const opts = ["No", "Yes"];
      opts.forEach((opt) => {
        const op = document.createElement("option");
        op.value = opt;
        op.textContent = opt;
        if ((opt === "Yes" && rawText === "1") || (opt === "No" && rawText === "")) op.selected = true;
        inputEl.appendChild(op);
      });
    } else if (colKey === "type") {
      inputEl = document.createElement("select");
      const opts = [
        "INTEGER",
        "TEXT",
        "REAL",
        "BLOB",
        "NUMERIC",
        "BOOLEAN",
        "DATE",
        "DATETIME",
        "JSON",
        "VARCHAR(255)",
        "DECIMAL(10,2)",
        "UUID"
      ];
      if (rawText && !opts.some(o => o.toUpperCase() === rawText.toUpperCase())) {
        opts.unshift(rawText);
      }
      opts.forEach((opt) => {
        const op = document.createElement("option");
        op.value = opt;
        op.textContent = opt;
        if (opt.toUpperCase() === rawText.toUpperCase()) op.selected = true;
        inputEl.appendChild(op);
      });
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.value = rawText;
    }

    td.innerHTML = "";
    td.appendChild(inputEl);
    inputEl.style.width = "100%";

    inputEl.addEventListener("keydown", (e2) => {
      if (e2.key === "Enter") inputEl.blur();
      if (e2.key === "Tab") {
        e2.preventDefault();
        inputEl.blur();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: e2.shiftKey, bubbles: true }));
      }
    });

    inputEl.focus();

    const commitEdit = () => {
      let newVal = inputEl.value;
      
      window.SchemaGrid.currentTransaction = [];
      updateSchemaCell(td, newVal, columns);
      if (window.SchemaGrid.currentTransaction.length > 0)
        window.SchemaGrid.history.push(window.SchemaGrid.currentTransaction);
      window.SchemaGrid.currentTransaction = null;
    };

    inputEl.addEventListener("blur", () => {
      commitEdit();
    });
  });
}
