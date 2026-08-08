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

    div.innerHTML = /* html */ `
      ${
        item.icon
          ? /* html */ `<span class="material-symbols-outlined">${item.icon}</span>`
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
      ev.stopPropagation();
      hideContextMenu();
      if (item.action) item.action();
    });

    menuElement.appendChild(div);
  });

  menuElement.style.visibility = "hidden";
  menuElement.classList.add("visible");

  // Wait a tick for layout
  requestAnimationFrame(() => {
    const rect = menuElement.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;

    if (x + rect.width > window.innerWidth)
      x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight)
      y = window.innerHeight - rect.height - 8;

    menuElement.style.left = `${x}px`;
    menuElement.style.top = `${y}px`;
    menuElement.style.visibility = "visible";
  });
}

export function hideContextMenu() {
  if (menuElement) {
    menuElement.classList.remove("visible");
  }
}
