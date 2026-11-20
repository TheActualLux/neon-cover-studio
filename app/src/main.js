// Midnight Marquee — the editor.
//
// bootEditor(prefill) wires the DOM in index.html to a cover state object
// and re-renders the live preview on every change. Photos come from the
// file input, drag-and-drop or the clipboard; panels are selected by
// clicking and then panned by dragging and zoomed with the wheel.
// Export renders a fresh canvas at the chosen size and downloads a PNG.
//
// Keyboard: 1–4 pick the grade, E exports, R shuffles the panels.

import {
  SCENES,
  GRADE_NAMES,
  defaultState,
  drawCover,
  getSceneImage,
  loadPhoto,
  panelRects,
  sceneName
} from "./cover.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const LAYOUTS = [
  ["big-left", "Big left + two right"],
  ["grid", "2 × 2 grid"],
  ["full", "Full bleed"],
  ["stack", "Tall three-stack"],
  ["strip", "Four strips"]
];

const EXPORT_SIZES = {
  "1080x1080": [1080, 1080],
  "1080x1350": [1080, 1350],
  "1920x1080": [1920, 1080]
};

export function bootEditor(prefill = {}) {
  const $ = (id) => document.getElementById(id);
  const preview = $("preview");
  const ctx = preview.getContext("2d");
  const status = $("status");
  const zoomSlider = $("zoom");

  const state = defaultState();
  if (prefill.photoName) {
    state.photoName = sceneName(prefill.photoName);
    state.photo = getSceneImage(state.photoName);
  }
  if (typeof prefill.caption === "string" && prefill.caption) state.caption = prefill.caption;
  if (typeof prefill.headline === "string" && prefill.headline) state.headline = prefill.headline;

  const setStatus = (message) => {
    status.textContent = message;
  };

  // Push state into the form controls once at boot, so a prefilled state
  // (shot mode) is reflected in the inputs the user then edits.
  function hydrateControls() {
    $("headline").value = state.headline;
    $("kicker").value = state.kicker;
    $("caption").value = state.caption;
    $("tracking").value = String(Math.round(clamp(state.tracking, 0, 0.24) * 100));
    layoutSelect.value = state.layout;
    $("fx-grain").checked = !!state.effects.grain;
    $("fx-halftone").checked = !!state.effects.halftone;
    $("fx-vignette").checked = !!state.effects.vignette;
  }

  // --- rendering -----------------------------------------------------------

  let rects = [];

  function render() {
    drawCover(ctx, preview.width, preview.height, state);
    rects = panelRects(state.layout, preview.width, preview.height);
    syncControls();
  }

  function syncControls() {
    document.querySelectorAll("[data-grade]").forEach((button) => {
      button.classList.toggle("active", button.dataset.grade === state.grade);
    });
    document.querySelectorAll("[data-align]").forEach((button) => {
      button.classList.toggle("active", button.dataset.align === state.align);
    });
    const panel = state.panels[state.selected] || state.panels[0];
    if (panel) zoomSlider.value = String(Math.round(panel.zoom * 100));
  }

  // --- photo loading -------------------------------------------------------

  function usePhotoFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || "")) {
      setStatus("that file is not an image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      loadPhoto(String(reader.result))
        .then((img) => {
          state.photo = img;
          state.photoName = "";
          render();
          setStatus(`photo loaded: ${file.name || "clipboard image"}`);
        })
        .catch(() => setStatus("that image could not be loaded"));
    };
    reader.onerror = () => setStatus("the file could not be read");
    reader.readAsDataURL(file);
  }

  function useScene(name) {
    state.photo = getSceneImage(name);
    state.photoName = sceneName(name);
    render();
    setStatus(`scene: ${state.photoName}`);
  }

  $("photo-input").addEventListener("change", (event) => {
    usePhotoFile(event.target.files && event.target.files[0]);
  });

  const hero = $("hero");
  hero.addEventListener("dragover", (event) => event.preventDefault());
  hero.addEventListener("drop", (event) => {
    event.preventDefault();
    usePhotoFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  window.addEventListener("paste", (event) => {
    const items = event.clipboardData && event.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        usePhotoFile(item.getAsFile());
        event.preventDefault();
        return;
      }
    }
  });

  document.querySelectorAll("[data-scene]").forEach((button) => {
    button.addEventListener("click", () => useScene(button.dataset.scene));
  });
  $("clear-photo").addEventListener("click", () => {
    state.photo = null;
    state.photoName = "marquee";
    render();
    setStatus("photo cleared");
  });

  // --- text controls -------------------------------------------------------

  const bindText = (id, key) => {
    $(id).addEventListener("input", (event) => {
      state[key] = event.target.value;
      render();
    });
  };
  bindText("headline", "headline");
  bindText("kicker", "kicker");
  bindText("caption", "caption");

  document.querySelectorAll("[data-align]").forEach((button) => {
    button.addEventListener("click", () => {
      state.align = button.dataset.align;
      render();
    });
  });

  $("tracking").addEventListener("input", (event) => {
    state.tracking = Number(event.target.value) / 100;
    render();
  });

  // --- layout and panels ---------------------------------------------------

  const layoutSelect = $("layout");
  for (const [value, label] of LAYOUTS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    layoutSelect.appendChild(option);
  }
  layoutSelect.addEventListener("change", (event) => {
    state.layout = event.target.value;
    const count = panelRects(state.layout, preview.width, preview.height).length;
    if (state.selected >= count) state.selected = -1;
    render();
  });

  zoomSlider.addEventListener("input", (event) => {
    const panel = state.panels[state.selected];
    if (panel) {
      panel.zoom = Number(event.target.value) / 100;
      render();
    }
  });

  $("reset-panel").addEventListener("click", () => {
    const panel = state.panels[state.selected];
    if (panel) {
      panel.panX = 0;
      panel.panY = 0;
      panel.zoom = 1;
      render();
      setStatus("panel reset");
    }
  });

  // --- grade and effects ---------------------------------------------------

  document.querySelectorAll("[data-grade]").forEach((button) => {
    button.addEventListener("click", () => {
      state.grade = button.dataset.grade;
      render();
    });
  });

  const bindFx = (id, key) => {
    $(id).addEventListener("change", (event) => {
      state.effects[key] = event.target.checked;
      render();
    });
  };
  bindFx("fx-grain", "grain");
  bindFx("fx-halftone", "halftone");
  bindFx("fx-vignette", "vignette");

  // --- pointer: select, pan, zoom ------------------------------------------

  function toCanvasPoint(event) {
    const box = preview.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (preview.width / box.width),
      y: (event.clientY - box.top) * (preview.height / box.height)
    };
  }

  let dragging = false;
  let last = null;

  preview.addEventListener("pointerdown", (event) => {
    const p = toCanvasPoint(event);
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        state.selected = i;
        dragging = true;
        last = p;
        preview.setPointerCapture(event.pointerId);
        render();
        return;
      }
    }
    state.selected = -1;
    render();
  });

  preview.addEventListener("pointermove", (event) => {
    if (!dragging || state.selected < 0) return;
    const p = toCanvasPoint(event);
    const rect = rects[state.selected];
    if (!rect) return;
    const panel = state.panels[state.selected];
    panel.panX += (p.x - last.x) / rect.w;
    panel.panY += (p.y - last.y) / rect.h;
    last = p;
    render();
  });

  const endDrag = (event) => {
    dragging = false;
    last = null;
    if (preview.hasPointerCapture && preview.hasPointerCapture(event.pointerId)) {
      preview.releasePointerCapture(event.pointerId);
    }
  };
  preview.addEventListener("pointerup", endDrag);
  preview.addEventListener("pointercancel", endDrag);

  preview.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const index = state.selected >= 0 ? state.selected : 0;
      const panel = state.panels[index];
      const rect = rects[index];
      if (!panel || !rect) return;
      const z1 = Math.min(4, Math.max(1, panel.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
      if (z1 === panel.zoom) return;
      // Anchor the zoom on the cursor: the image point under the pointer
      // stays put, so zooming feels like pushing a lens into the panel.
      const src = state.photo || getSceneImage(state.photoName);
      const sw = src.naturalWidth || src.width;
      const sh = src.naturalHeight || src.height;
      const p = toCanvasPoint(event);
      const s0 = Math.max(rect.w / sw, rect.h / sh) * panel.zoom;
      const s1 = Math.max(rect.w / sw, rect.h / sh) * z1;
      const ox0 = rect.x + (rect.w - sw * s0) / 2 + panel.panX * rect.w;
      const oy0 = rect.y + (rect.h - sh * s0) / 2 + panel.panY * rect.h;
      const u = (p.x - ox0) / s0;
      const v = (p.y - oy0) / s0;
      panel.zoom = z1;
      panel.panX = (p.x - u * s1 - rect.x - (rect.w - sw * s1) / 2) / rect.w;
      panel.panY = (p.y - v * s1 - rect.y - (rect.h - sh * s1) / 2) / rect.h;
      render();
    },
    { passive: false }
  );

  // Double-click a panel to put it back to its resting framing.
  preview.addEventListener("dblclick", (event) => {
    const p = toCanvasPoint(event);
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        const panel = state.panels[i];
        panel.panX = 0;
        panel.panY = 0;
        panel.zoom = 1;
        state.selected = i;
        render();
        setStatus("panel reset");
        return;
      }
    }
  });

  // --- export and shuffle --------------------------------------------------

  function exportPng() {
    const [w, h] = EXPORT_SIZES[$("export-size").value] || EXPORT_SIZES["1080x1080"];
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    drawCover(canvas.getContext("2d"), w, h, { ...state, selected: -1 });
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setStatus("the export failed");
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `midnight-marquee-${w}x${h}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        setStatus(`exported ${w} × ${h} PNG`);
      },
      "image/png",
      1
    );
  }

  function shuffle() {
    for (const panel of state.panels) {
      panel.panX = Math.random() * 1.4 - 0.7;
      panel.panY = Math.random() * 1.4 - 0.7;
      panel.zoom = 1 + Math.random() * 1.8;
    }
    if (!state.photo) {
      state.photoName = SCENES[Math.floor(Math.random() * SCENES.length)];
      state.photo = getSceneImage(state.photoName);
    }
    render();
    setStatus("shuffled");
  }

  $("export").addEventListener("click", exportPng);
  $("shuffle").addEventListener("click", shuffle);

  // --- keyboard ------------------------------------------------------------

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    if (key >= "1" && key <= "4") {
      state.grade = GRADE_NAMES[Number(key) - 1];
      render();
      setStatus(`grade: ${state.grade}`);
    } else if (key === "e" || key === "E") {
      exportPng();
    } else if (key === "r" || key === "R") {
      shuffle();
    }
  });

  hydrateControls();
  render();
  setStatus("ready — click a panel, then drag to pan and wheel to zoom");
}
