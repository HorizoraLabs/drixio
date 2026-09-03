let menuElement = null;

function createMenuElement() {
  if (menuElement) return;
  menuElement = document.createElement("div");
  menuElement.className = "drixio-context-menu";
  document.body.appendChild(menuElement);

  // Hide on outside click
  document.addEventListener("click", (e) => {
    if (
      menuElement.classList.contains("visible") &&
      !menuElement.contains(e.target)
    ) {
      hideContextMenu();
    }
  });

  // Hide on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuElement.classList.contains("visible")) {
      hideContextMenu();
    }
  });

  // Hide on scroll (capture phase to catch all scrolls)
  window.addEventListener(
    "scroll",
    (e) => {
      if (menuElement.classList.contains("visible")) {
        // Only hide if the scroll is outside the menu
        if (!menuElement.contains(e.target)) {
          hideContextMenu();
        }
      }
    },
    true,
  );
}

export function showContextMenu(e, items) {
  if (e.preventDefault) e.preventDefault();
  if (e.stopPropagation) e.stopPropagation();

  createMenuElement();

  menuElement.innerHTML = "";
  menuElement.classList.remove("visible");

  items.forEach((item) => {
    if (item.type === "divider" || item === "divider") {
      const divider = document.createElement("div");
      divider.className = "drixio-context-menu-divider";
      menuElement.appendChild(divider);
      return;
    }

    const div = document.createElement("div");
    div.className = "drixio-context-menu-item";
    if (item.danger) div.classList.add("danger");
    if (item.disabled) div.classList.add("disabled");

    div.innerHTML = /* html */ `
      ${
        item.icon
          ? /* html */ `<span class="material-symbols-outlined drixio-menu-icon">${item.icon}</span>`
          : ``
      }
      <span class="drixio-menu-label">${item.label}</span>
      ${
        item.shortcut
          ? /* html */ `<span class="drixio-menu-shortcut">${item.shortcut}</span>`
          : ``
      }
    `;

    div.addEventListener("click", (ev) => {
      if (item.disabled) return;
      ev.stopPropagation();
      hideContextMenu();
      if (item.action) item.action();
    });

    menuElement.appendChild(div);
  });

  // Position calculation and smooth animated reveal
  requestAnimationFrame(() => {
    const rect = menuElement.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    let originX = "left";
    let originY = "top";

    if (x + rect.width > window.innerWidth - 8) {
      x = Math.max(8, window.innerWidth - rect.width - 8);
      originX = "right";
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = Math.max(8, window.innerHeight - rect.height - 8);
      originY = "bottom";
    }

    menuElement.style.transformOrigin = `${originY} ${originX}`;
    menuElement.style.left = `${x}px`;
    menuElement.style.top = `${y}px`;
    menuElement.classList.add("visible");
  });
}

export function hideContextMenu() {
  if (menuElement) {
    menuElement.classList.remove("visible");
  }
}
