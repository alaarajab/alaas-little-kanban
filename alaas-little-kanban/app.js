/* ─── State ─────────────────────────────────────────────────────────────
   All app state lives here. Only render() reads from it to update the DOM.
   ─────────────────────────────────────────────────────────────────────── */

let cards = loadCards();

function loadCards() {
  try {
    const saved = localStorage.getItem("kanban-cards");
    return saved ? JSON.parse(saved) : DEFAULT_CARDS;
  } catch {
    return DEFAULT_CARDS;
  }
}

function saveCards() {
  // DOM concept: localStorage persists data across page refreshes
  localStorage.setItem("kanban-cards", JSON.stringify(cards));
}

let nextId = cards.length + 10; // simple unique ID counter

// ─── Drag state ──────────────────────────────────────────
let dragCard = null; // the card element being dragged
let dragId = null; // its data ID
let placeholder = null;

// ─── Render ──────────────────────────────────────────────
function render() {
  // Clear all columns
  ["todo", "progress", "done"].forEach((col) => {
    const el = document.getElementById("col-" + col);
    el.innerHTML = "";
  });

  // Build cards
  cards.forEach((card) => {
    const el = createCardEl(card);
    document.getElementById("col-" + card.col).appendChild(el);
  });

  // Empty state messages
  ["todo", "progress", "done"].forEach((col) => {
    const el = document.getElementById("col-" + col);
    if (!el.querySelector(".card")) {
      const msg = document.createElement("div");
      msg.className = "col-empty";
      msg.textContent =
        col === "done" ? "🎉 Nothing done yet" : "Drop cards here";
      el.appendChild(msg);
    }
  });

  updateMeta();
}

// ─── Create a card DOM element ───────────────────────────
// DOM concept: createElement + classList + dataset + appendChild
function createCardEl(card) {
  const el = document.createElement("div");
  el.className = "card";
  el.draggable = true; // makes element draggable
  el.dataset.id = card.id; // store ID in data attribute

  el.innerHTML = `
      <div class="card-top">
        <span class="card-text">${escapeHtml(card.text)}</span>
        <button class="card-delete" title="Delete card" data-id="${card.id}">×</button>
      </div>
      <div class="card-meta">
        <span class="card-id">#${card.id}</span>
        <span class="card-tag tag-${card.tag}">${card.tag}</span>
      </div>`;

  // ── Drag events (on the card) ────────────────────────
  el.addEventListener("dragstart", onDragStart);
  el.addEventListener("dragend", onDragEnd);

  return el;
}

// ─── Update badges & progress bar ───────────────────────
function updateMeta() {
  const totals = { todo: 0, progress: 0, done: 0 };
  cards.forEach((c) => totals[c.col]++);

  document.getElementById("badge-todo").textContent = totals.todo;
  document.getElementById("badge-progress").textContent = totals.progress;
  document.getElementById("badge-done").textContent = totals.done;

  const total = cards.length;
  const pct = total === 0 ? 0 : Math.round((totals.done / total) * 100);
  document.getElementById("progressPct").textContent = pct + "%";
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("cardCount").textContent =
    total + " card" + (total !== 1 ? "s" : "");
}

// ─── Add card ────────────────────────────────────────────
function addCard() {
  const input = document.getElementById("newCardText");
  const text = input.value.trim();
  if (!text) {
    input.focus();
    showToast("Enter a card title first");
    return;
  }

  const tag = document.getElementById("newCardTag").value;
  const col = document.getElementById("newCardCol").value;
  const id = "c" + ++nextId;

  // Push new card to state array
  cards.push({ id, text, col, tag });
  saveCards();
  render();

  input.value = "";
  input.focus();
  showToast("Card added to " + colLabel(col));
}

// ─── Delete card ─────────────────────────────────────────
// DOM concept: event delegation — one listener on the board handles ALL delete buttons
document.querySelector(".board").addEventListener("click", (e) => {
  // e.target.closest() walks up the DOM tree to find the button
  const btn = e.target.closest(".card-delete");
  if (!btn) return;

  const id = btn.dataset.id;
  cards = cards.filter((c) => c.id !== id);
  saveCards();
  render();
  showToast("Card deleted");
});

// ─── Drag & Drop ─────────────────────────────────────────
// DOM concept: HTML5 Drag and Drop API + event.dataTransfer

function onDragStart(e) {
  dragCard = e.currentTarget;
  dragId = dragCard.dataset.id;

  // classList.add to style the dragging card
  setTimeout(() => dragCard.classList.add("dragging"), 0);

  // Store the card ID in the drag transfer object
  e.dataTransfer.setData("text/plain", dragId);
  e.dataTransfer.effectAllowed = "move";
}

function onDragEnd() {
  if (dragCard) dragCard.classList.remove("dragging");
  removePlaceholder();
  document
    .querySelectorAll(".col")
    .forEach((c) => c.classList.remove("drag-over"));
  dragCard = null;
  dragId = null;
}

// ─── Column drop zones ───────────────────────────────────
// DOM concept: querySelectorAll returns all columns; forEach attaches listeners to each
document.querySelectorAll(".col").forEach((col) => {
  // dragover must preventDefault() to allow dropping
  col.addEventListener("dragover", (e) => {
    e.preventDefault(); // required — allows the drop
    e.dataTransfer.dropEffect = "move";

    const colId = col.dataset.col;
    col.classList.add("drag-over");

    // Insert placeholder at the right position
    const cards = col.querySelector(".cards");
    const afterEl = getDragAfterElement(cards, e.clientY);

    removePlaceholder();
    placeholder = document.createElement("div");
    placeholder.className = "drop-placeholder";

    if (afterEl) {
      cards.insertBefore(placeholder, afterEl);
    } else {
      cards.appendChild(placeholder);
    }
  });

  col.addEventListener("dragleave", (e) => {
    // Only remove if leaving the column entirely (not entering a child)
    if (!col.contains(e.relatedTarget)) {
      col.classList.remove("drag-over");
      removePlaceholder();
    }
  });

  col.addEventListener("drop", (e) => {
    e.preventDefault();
    const targetCol = col.dataset.col;
    const id = e.dataTransfer.getData("text/plain");

    // Update the card's column in state
    const card = cards.find((c) => c.id === id);
    if (card) {
      const oldCol = card.col;
      card.col = targetCol;
      saveCards();

      if (oldCol !== targetCol) {
        showToast("Moved to " + colLabel(targetCol));
      }
    }

    col.classList.remove("drag-over");
    removePlaceholder();
    render();
  });
});

// Find which card element the cursor is after (for insertion order)
function getDragAfterElement(container, y) {
  // querySelectorAll + spread to get array of all non-dragging cards
  const draggable = [...container.querySelectorAll(".card:not(.dragging)")];
  return draggable.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset
        ? { offset, element: child }
        : closest;
    },
    { offset: Number.NEGATIVE_INFINITY },
  ).element;
}

function removePlaceholder() {
  if (placeholder) {
    placeholder.remove();
    placeholder = null;
  }
}

// ─── Keyboard shortcut ───────────────────────────────────
// DOM concept: keydown event on the input element
document.getElementById("newCardText").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addCard();
  // Escape clears the input
  if (e.key === "Escape") e.target.value = "";
});

document.getElementById("addBtn").addEventListener("click", addCard);

// ─── Toast notification ──────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
}

// ─── Helpers ─────────────────────────────────────────────
function colLabel(col) {
  return { todo: "To Do", progress: "In Progress", done: "Done" }[col];
}

// Prevent XSS — never use innerHTML with unescaped user input
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Boot ────────────────────────────────────────────────
render();
