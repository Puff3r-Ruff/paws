/**
 * editor.js
 *
 * Complete editor logic extracted from the site, updated to:
 * - create a Shadow DOM-based editor UI (closedUI / openedUI) at runtime
 * - prefer elements inside the shadow root via editorQuery()
 * - load Clerk dynamically and wait for it before initializing editor
 * - load Stripe in background (ESM import)
 *
 * Usage:
 *  <script type="module" src="/path/to/editor.js"></script>
 *
 * Notes:
 * - This file will create a small editor UI inside a shadow root appended to document.body.
 * - The rest of the editor logic operates the same as before but uses the shadow UI when available.
 */

/* =========================
   Utilities
   ========================= */

function safeQuery(selector, root = document) {
  return root.querySelector(selector);
}

function safeQueryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

/* =========================
   Shadow UI: create closedUI / openedUI inside a shadow root
   ========================= */

let _editorHost = null;
let _editorRoot = null;

function createShadowEditorUI() {
  // Reset if removed
  if (_editorHost && !_editorHost.isConnected) {
    _editorHost = null;
    _editorRoot = null;
  }

  if (_editorHost) return { host: _editorHost, root: _editorRoot };

  // Host
  _editorHost = document.createElement("div");
  _editorHost.id = "editor-shadow-host";
  _editorHost.style.all = "initial";
  document.body.appendChild(_editorHost);

  _editorRoot = _editorHost.attachShadow({ mode: "open" });

  /* ============================
     STYLES (scoped)
  ============================ */
  const styles = `
    /* Sliding panel */
    #sidePanel {
      width: 260px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      text-align: center;
      background: #092a49;
      padding: 1rem;

      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;

      transform: translateX(-100%);
      transition: transform 0.35s ease;

      z-index: 999999;
    }

    #sidePanel.open {
      transform: translateX(0);
    }

    /* Toggle tab */
    #toggleTab {
      position: fixed;
      top: 50%;
      left: 0;
      transform: translate(0, -50%);
      background: #1e90ff;
      color: #fff;
      border-radius: 0 4px 4px 0;
      padding: 10px 14px;
      cursor: pointer;
      z-index: 1000000;
      font-size: 18px;
      border: none;
    }

    /* Buttons */
    .btn {
      border-radius: 4px;
      border: none;
      padding: 10px 14px;
      font-size: 14px;
      cursor: pointer;
      text-align: center;
      font-weight: 500;
      width: 100%;
    }

    .btn-back {
      background: #000;
      color: #fff;
      width: 100%;
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 8px;
      text-align: center;
      box-sizing: border-box;
    }

    .btn-name {
      background: #fff;
      color: #000;
      border: 1px solid #d0d0d0;
      font-weight: 400;
    }

    .btn-update {
      background: #4fb3ff;
      color: #fff;
      font-size: 1.2rem;
      width: 100%;
      padding: 5px;
      border-radius: 6px;
      margin-bottom: 8px;
      text-align: center;
      box-sizing: border-box;
    }

    /* Collapse button */
    #collapseBtn {
      background: #1e90ff;
      color: #fff;
      font-size: 18px;
    }

    .arrow {
      display: inline-block;
      transition: transform 0.25s ease;
    }

    .arrow.rotated {
      transform: rotate(180deg);
    }

    .hidden {
      display: none;
    }

    input#SiteName {
      width: 100%;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid #ccc;
      margin-bottom: 8px;
      text-align: center;
      box-sizing: border-box;
    }
  `;

  /* ============================
     HTML (scoped)
  ============================ */
  const html = `
    <div id="panel">
      <button id="toggleTab">▶</button>

      <div id="sidePanel">
        <button class="btn" id="collapseBtn">
          <span class="arrow" id="arrow">▼</span>
        </button>

        <div id="contentArea">
          <button class="btn btn-back" id="backToTemplates">
            <a href="/BusinessHud" style="color:inherit;text-decoration:none;display:block;">Business Hud</a>
          </button>

          <input id="SiteName" placeholder="Site name" />

          <button class="btn btn-update" id="UploadBtn">subscribe</button>
          <button class="btn btn-update" id="previewStoreBtn">Preview Store</button>
        </div>
      </div>
    </div>
  `;

  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  _editorRoot.appendChild(styleEl);

  const container = document.createElement("div");
  container.innerHTML = html;
  _editorRoot.appendChild(container);

  return { host: _editorHost, root: _editorRoot };
}

async function autoFillSiteName(userId) {
  try {
    const res = await fetch(`/api/repos?ID=${encodeURIComponent(userId)}`);
    const data = await res.json();

    if (!Array.isArray(data.repos) || data.repos.length === 0) return;

    // Pick the most recently updated repo
    const sorted = data.repos
      .filter(r => r.repo)
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

    if (sorted.length === 0) return;

    const repoName = sorted[0].repo;

    // Access shadow DOM input
    const { root } = createShadowEditorUI();
    const input = root.querySelector("#SiteName");

    if (input && !input.value) {
      input.value = repoName;
    }
  } catch (err) {
    console.error("Failed to auto-fill site name:", err);
  }
}

// Query helper: prefer shadow root, fallback to document
function editorQuery(selector) {
  if (_editorRoot) {
    const el = _editorRoot.querySelector(selector);
    if (el) return el;
  }
  return document.querySelector(selector);
}


/* =========================
   Clerk Loader + Bootstrap
   ========================= */

async function loadClerkScript(publishableKey) {
  return new Promise((resolve, reject) => {
    if (window.Clerk) {
      resolve(window.Clerk);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-clerk-publishable-key", publishableKey);

    script.onload = async () => {
      try {
        if (typeof Clerk?.load === "function") {
          await Clerk.load();
        }
        resolve(window.Clerk);
      } catch (err) {
        console.error("Clerk.load() failed:", err);
        resolve(window.Clerk || null);
      }
    };

    script.onerror = (err) => {
      console.error("Failed to load Clerk script:", err);
      reject(err);
    };

    document.head.appendChild(script);
  });
}

/* =========================
   Image Replacement + Editor
   ========================= */

function enableImageReplacement() {
  document.querySelectorAll("img").forEach((img) => {
    img.style.cursor = "pointer";

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.style.display = "none";
    document.body.appendChild(picker);

    img.addEventListener("click", () => picker.click());

    picker.addEventListener("change", () => {
      const file = picker.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => openImageEditor(img, e.target.result);
      reader.readAsDataURL(file);
    });
  });
}

function openImageEditor(targetImg, uploadedSrc) {
  const overlay = document.createElement("div");
  overlay.id = "imgEditorOverlay";

  const editor = document.createElement("div");
  editor.id = "imgEditorWindow";

  const wrapper = document.createElement("div");
  wrapper.className = "editor-canvas-wrapper";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  wrapper.appendChild(canvas);

  const controls = document.createElement("div");
  controls.className = "editor-controls";

  const zoomRow = document.createElement("div");
  zoomRow.className = "zoom-row";

  const zoomLabel = document.createElement("div");
  zoomLabel.className = "zoom-label";

  const zoomSlider = document.createElement("input");
  zoomSlider.type = "range";
  zoomSlider.min = "0";
  zoomSlider.max = "100";

  zoomRow.appendChild(zoomLabel);
  zoomRow.appendChild(zoomSlider);

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "Confirm";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.className = "cancel";

  controls.appendChild(zoomRow);
  controls.appendChild(confirmBtn);
  controls.appendChild(cancelBtn);

  const hint = document.createElement("div");
  hint.className = "editor-hint";
  hint.textContent = "Drag to move";

  editor.appendChild(wrapper);
  editor.appendChild(controls);
  overlay.appendChild(editor);
  document.body.appendChild(overlay);
  document.body.appendChild(hint);

  const baseImg = new Image();
  baseImg.src = targetImg.src;

  baseImg.onload = () => {
    const targetW = baseImg.naturalWidth;
    const targetH = baseImg.naturalHeight;

    const naturalW = baseImg.naturalWidth;
    const naturalH = baseImg.naturalHeight;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let fitScale = Math.min(vw / naturalW, vh / naturalH);
    const shrink = 0.4;
    let wrapperScale = fitScale * shrink;
    const minWrapperScale = 0.3;
    wrapperScale = Math.max(wrapperScale, minWrapperScale);

    wrapper.style.scale = wrapperScale;

    const marginVH = 10 - (1 - wrapperScale) * 50;
    wrapper.style.margin = marginVH + "vh";

    const dpr = window.devicePixelRatio || 1;
    canvas.width = targetW * dpr;
    canvas.height = targetH * dpr;
    canvas.style.width = targetW + "px";
    canvas.style.height = targetH + "px";

    const img = new Image();
    img.src = uploadedSrc;

    img.onload = () => {
      let scale = 1;
      let minScale = 1;
      let maxScale = 4;
      let posX = 0;
      let posY = 0;

      const scaleW = targetW / img.naturalWidth;
      const scaleH = targetH / img.naturalHeight;
      minScale = Math.max(scaleW, scaleH);
      scale = minScale;
      maxScale = minScale * 4;

      posX = (targetW - img.naturalWidth * scale) / 2;
      posY = (targetH - img.naturalHeight * scale) / 2;

      function sliderToScale(v) {
        const t = v / 100;
        return minScale * Math.pow(maxScale / minScale, t);
      }
      function scaleToSlider(s) {
        return Math.round(Math.log(s / minScale) / Math.log(maxScale / minScale) * 100);
      }

      zoomSlider.value = scaleToSlider(scale);
      zoomLabel.textContent = Math.round(scale * 100) + "%";

      function draw() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, posX * dpr, posY * dpr);
        ctx.drawImage(img, 0, 0);
      }

      function clamp() {
        const imgW = img.naturalWidth * scale;
        const imgH = img.naturalHeight * scale;

        if (imgW <= targetW) posX = (targetW - imgW) / 2;
        else {
          const minX = targetW - imgW;
          if (posX < minX) posX = minX;
          if (posX > 0) posX = 0;
        }

        if (imgH <= targetH) posY = (targetH - imgH) / 2;
        else {
          const minY = targetH - imgH;
          if (posY < minY) posY = minY;
          if (posY > 0) posY = 0;
        }
      }

      let dragging = false;
      let startX = 0;
      let startY = 0;

      wrapper.addEventListener("mousedown", (e) => {
        dragging = true;
        startX = e.clientX - posX;
        startY = e.clientY - posY;
      });

      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        posX = e.clientX - startX;
        posY = e.clientY - startY;
        clamp();
        draw();
      });

      document.addEventListener("mouseup", () => (dragging = false));

      let pinchStartDist = 0;
      let pinchStartScale = 1;
      let pinchCenter = { x: 0, y: 0 };

      wrapper.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches.length === 1) {
            dragging = true;
            const t = e.touches[0];
            startX = t.clientX - posX;
            startY = t.clientY - posY;
          } else if (e.touches.length === 2) {
            dragging = false;
            const a = e.touches[0];
            const b = e.touches[1];
            pinchStartDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            pinchStartScale = scale;

            const rect = wrapper.getBoundingClientRect();
            pinchCenter.x = (a.clientX + b.clientX) / 2 - rect.left;
            pinchCenter.y = (a.clientY + b.clientY) / 2 - rect.top;
          }
        },
        { passive: false }
      );

      wrapper.addEventListener(
        "touchmove",
        (e) => {
          if (e.touches.length === 1 && dragging) {
            const t = e.touches[0];
            posX = t.clientX - startX;
            posY = t.clientY - startY;
            clamp();
            draw();
          } else if (e.touches.length === 2) {
            e.preventDefault();
            const a = e.touches[0];
            const b = e.touches[1];
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

            const newScale = pinchStartScale * (dist / pinchStartDist);
            const prevScale = scale;
            scale = Math.max(minScale, Math.min(maxScale, newScale));

            posX = pinchCenter.x - (pinchCenter.x - posX) * (scale / prevScale);
            posY = pinchCenter.y - (pinchCenter.y - posY) * (scale / prevScale);

            clamp();
            zoomSlider.value = scaleToSlider(scale);
            zoomLabel.textContent = Math.round(scale * 100) + "%";
            draw();
          }
        },
        { passive: false }
      );

      wrapper.addEventListener("touchend", () => (dragging = false));

      wrapper.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const rect = wrapper.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;

          const prevScale = scale;
          scale *= e.deltaY < 0 ? 1.08 : 1 / 1.08;
          scale = Math.max(minScale, Math.min(maxScale, scale));

          posX = mx - ((mx - posX) * (scale / prevScale));
          posY = my - ((my - posY) * (scale / prevScale));

          clamp();
          zoomSlider.value = scaleToSlider(scale);
          zoomLabel.textContent = Math.round(scale * 100) + "%";
          draw();
        },
        { passive: false }
      );

      let lastMouse = { x: targetW / 2, y: targetH / 2 };
      wrapper.addEventListener("mousemove", (e) => {
        const rect = wrapper.getBoundingClientRect();
        lastMouse.x = e.clientX - rect.left;
        lastMouse.y = e.clientY - rect.top;
      });

      zoomSlider.addEventListener("input", (e) => {
        const newScale = sliderToScale(Number(e.target.value));
        const prevScale = scale;
        scale = newScale;

        const cx = lastMouse.x;
        const cy = lastMouse.y;

        posX = cx - ((cx - posX) * (scale / prevScale));
        posY = cy - ((cy - posY) * (scale / prevScale));

        clamp();
        zoomLabel.textContent = Math.round(scale * 100) + "%";
        draw();
      });

      confirmBtn.onclick = () => {
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = targetW;
        exportCanvas.height = targetH;
        const ectx = exportCanvas.getContext("2d");

        ectx.setTransform(scale, 0, 0, scale, posX, posY);
        ectx.drawImage(img, 0, 0);

        let quality = 0.92;
        let dataURL = exportCanvas.toDataURL("image/jpeg", quality);

        function bytes(b64) {
          const base = b64.split(",")[1] || "";
          return Math.ceil((base.length * 3) / 4);
        }

        while (bytes(dataURL) > 1_000_000 && quality > 0.35) {
          quality -= 0.05;
          dataURL = exportCanvas.toDataURL("image/jpeg", quality);
        }

        targetImg.src = dataURL;
        overlay.remove();
        hint.remove();
      };

      cancelBtn.onclick = () => {
        overlay.remove();
        hint.remove();
      };

      draw();
    };
  };
}

/* =========================
   Text Editing
   ========================= */

function enableTextEditing() {
   const editableSelectors = [
    ".business_name",
    ".tagline",
    ".about_us p",
    ".service-card p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "span",
  ];

  const elements = document.querySelectorAll(editableSelectors.join(", "));

  elements.forEach((el) => {
    if (el.closest && el.closest(".sidebar")) return;
     
    el.classList.add("editable-text");
    el.style.cursor = "text";

    el.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    el.addEventListener("click", () => {
      if (el.isContentEditable) return;

      el.contentEditable = "true";
      el.focus();
      document.execCommand("selectAll", false, null);

      el.addEventListener(
        "blur",
        () => {
          el.contentEditable = "false";
        },
        { once: true }
      );
    });
  });
}

/* =========================
   Owl controls removal
   ========================= */

function destroyOwlControls() {
  const nav = document.querySelector(".owl-nav");
  const dots = document.querySelector(".owl-dots");

  if (nav) nav.remove();
  if (dots) dots.remove();
}

/* =========================
   UI Rebinding + Minify
   ========================= */

function rebindButtons() {
  const toggleTab = editorQuery("#toggleTab");
  const collapseBtn = editorQuery("#collapseBtn");
  const contentArea = editorQuery("#contentArea");
  const arrow = editorQuery("#arrow");

  const uploadBtn = editorQuery("#UploadBtn");
  const previewStoreBtn = editorQuery("#previewStoreBtn");
  const nameEl = editorQuery("#SiteName");

  // Slide panel open/close
  toggleTab?.addEventListener("click", Minify);

  // Collapse inner content
  collapseBtn?.addEventListener("click", () => {
    const hidden = contentArea.classList.toggle("hidden");
    arrow.classList.toggle("rotated");
  });

  // Autosave on name change

  // Upload button (same logic as before)
  uploadBtn?.addEventListener("click", async () => {
    const nameEl = editorQuery("#SiteName");
    if (!nameEl || nameEl.value.trim().length < 3) {
      alert("Please enter a site name (at least 3 characters).");
      return;
    }

    // Stripe modal logic stays the same
    const stripeModal = document.getElementById("stripePaymentModal");
    if (stripeModal && window.stripe) {
      openPaymentModal();
      return;
    }

    await publish();
  });

previewStoreBtn?.addEventListener("click", async () => {
  if (window.previewMode) {
    window.previewMode = false;
    loadProducts();
  } else {
    window.previewMode = true;
    loadProducts();
  }
});
}

function Minify() {
  const panel = editorQuery("#sidePanel");
  const toggleTab = editorQuery("#toggleTab");

  if (!panel || !toggleTab) return;

  const isOpen = panel.classList.toggle("open");
  toggleTab.textContent = isOpen ? "◀" : "▶";
}

/* =========================
   Clean + Publish Pipeline
   ========================= */

window.cleanDocumentForPublish = async function cleanDocumentForPublish() {
  // Clone the whole document so we can safely mutate it
  const docClone = document.documentElement.cloneNode(true);

  // Remove only elements that have the id "Revove"
  // (querySelectorAll supports multiple matches even though id is normally unique)
  docClone.querySelectorAll("#Remove").forEach(n => n.remove());

  // If you previously removed scripts except RequiredScript, we no longer do that.
  // However, if you want to remove script elements that specifically have id="Revove",
  // the line above already removed them because it targets any element with that id.

  // Clean attributes and editing helpers from all remaining elements
  const allElements = docClone.querySelectorAll("*");
  allElements.forEach(el => {
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-cc-animate");
    el.removeAttribute("data-cc-animate-delay");

    Array.from(el.attributes).forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    });

    el.classList.remove("editable-text", "lazyload--placeholder");
  });

  // Ensure head exists and that style.css is linked
  let head = docClone.querySelector("head");
  if (!head) {
    head = document.createElement("head");
    if (docClone.firstChild) docClone.insertBefore(head, docClone.firstChild);
    else docClone.appendChild(head);
  }

  if (!head.querySelector("link[href*='style.css'], link[href*='style']")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "style.css";
    head.appendChild(link);
  }

  // Collect image srcs and rewrite src attributes to images/img_X.jpg
  const imgs = Array.from(docClone.querySelectorAll("img"));
  const originalSrcs = imgs.map(img => img.getAttribute("src") || "");

  imgs.forEach((img, i) => {
    img.setAttribute("src", `images/img_${i}.jpg`);
    img.removeAttribute("srcset");

    Array.from(img.attributes).forEach(attr => {
      if (/^data-/i.test(attr.name)) img.removeAttribute(attr.name);
    });
  });

  const cleanedHTML = "<!DOCTYPE html>\n" + docClone.outerHTML;
  return { cleanedHTML, originalSrcs };
};


function setUploadButtonState(state) {
  const btn = editorQuery("#UploadBtn") || document.getElementById("UploadBtn");
  if (!btn) return;

  if (state === "uploading") {
    btn.disabled = true;
    btn.textContent = "Updating...";
  } else if (state === "uploaded") {
    btn.textContent = "Updated!";
    setTimeout(() => {
      btn.textContent = "subscribe";
      btn.disabled = false;
    }, 1000);
  } else {
    btn.textContent = "subscribe";
    btn.disabled = false;
  }
}

/**
 * Helpers used by publish()
 */

/** Derive a safe template/folder name from the current URL (fallback if none) */
function getTemplateNameFromUrl(fallbackName = "DogGroomer") {
  try {
    let path = (window.location.pathname || "").split("?")[0].split("#")[0];
    if (path.endsWith("/")) path = path.slice(0, -1);
    const parts = path.split("/").filter(Boolean);
    let candidate = "";
    if (parts.length === 0) candidate = "";
    else {
      const last = parts[parts.length - 1];
      if (/\.[a-z0-9]+$/i.test(last)) candidate = parts.length > 1 ? parts[parts.length - 2] : "";
      else candidate = last;
    }
    if (!candidate) candidate = (document.title || "").trim().split("|")[0] || fallbackName;
    candidate = candidate.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
    if (!candidate) candidate = fallbackName;
    return candidate;
  } catch (err) {
    return fallbackName;
  }
}

/** Sanitize filename from URL */
function filenameFromUrl(url, fallback) {
  try {
    const u = new URL(url, window.location.href);
    const parts = u.pathname.split("/").filter(Boolean);
    let name = parts.pop() || fallback || "file";
    if (!/\.[a-z0-9]+$/i.test(name) && parts.length) name = parts.pop();
    name = name.replace(/\s+/g, "_").replace(/[^A-Za-z0-9._-]/g, "");
    if (!name) name = fallback || "file";
    return name;
  } catch (e) {
    return fallback || "file";
  }
}

/** Collect external CSS files referenced by <link rel="stylesheet"> and inline <style> blocks */
async function collectCssFiles() {
  const cssFiles = [];

  // External link tags (preserve order)
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  await Promise.all(
    links.map(async (link, i) => {
      const href = link.getAttribute("href") || "";
      if (!href) return;
      let absolute;
      try {
        absolute = new URL(href, window.location.href).href;
      } catch (err) {
        console.warn("Invalid CSS URL, skipping:", href);
        return;
      }
      try {
        const resp = await fetch(absolute);
        if (!resp.ok) {
          console.warn("Failed to fetch CSS:", absolute);
          return;
        }
        const text = await resp.text();
        const name = filenameFromUrl(absolute, `style_${i}.css`);
        cssFiles.push({ path: `css/${name}`, content: text });
      } catch (err) {
        console.warn("Error fetching CSS (CORS or network):", absolute, err);
      }
    })
  );

  // Inline <style> blocks
  const inlineStyles = Array.from(document.querySelectorAll("style"));
  inlineStyles.forEach((st, i) => {
    const text = st.textContent || "";
    if (text.trim()) cssFiles.push({ path: `css/inline_${i + 1}.css`, content: text });
  });

  // Fallback to style.css if nothing collected
  if (cssFiles.length === 0) {
    try {
      const resp = await fetch("style.css");
      if (resp.ok) {
        const text = await resp.text();
        cssFiles.push({ path: "css/style.css", content: text });
      }
    } catch (err) {
      console.warn("Fallback style.css fetch failed.");
    }
  }

  return cssFiles;
}

/** Collect external JS files referenced by <script src="..."> and inline <script> blocks */
async function collectJsFiles() {
  const jsFiles = [];

  // External script tags (preserve order)
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  await Promise.all(
    scripts.map(async (script, i) => {
      const src = script.getAttribute("src") || "";
      if (!src) return;
      let absolute;
      try {
        absolute = new URL(src, window.location.href).href;
      } catch (err) {
        console.warn("Invalid JS URL, skipping:", src);
        return;
      }
      if (absolute.startsWith("data:")) return;
      try {
        const resp = await fetch(absolute);
        if (!resp.ok) {
          console.warn("Failed to fetch JS:", absolute);
          return;
        }
        const text = await resp.text();
        const name = filenameFromUrl(absolute, `script_${i}.js`);
        jsFiles.push({ path: `js/${name}`, content: text });
      } catch (err) {
        console.warn("Error fetching JS (CORS or network):", absolute, err);
      }
    })
  );

  // Inline scripts (non-src)
  const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"));
  inlineScripts.forEach((s, i) => {
    const text = s.textContent || "";
    if (text.trim()) jsFiles.push({ path: `js/inline_${i + 1}.js`, content: text });
  });

  return jsFiles;
}

/** publish() — updated to send index.html, css folder, js folder, and images */
window.publish = async function publish() {
  try {
    setUploadButtonState("uploading");

    const { cleanedHTML, originalSrcs } = await window.cleanDocumentForPublish();
    const nameEl = editorQuery("#SiteName") || document.getElementById("SiteName");
    const nameValue = nameEl?.value?.trim() || "";
    if (nameValue.length < 3) {
      setUploadButtonState();
      return;
    }

    // Collect CSS and JS files (external + inline)
    const [cssFiles, jsFiles] = await Promise.all([collectCssFiles(), collectJsFiles()]);

    // Fetch images (same logic as before)
    const imageFiles = await Promise.all(
      originalSrcs.map(async (src, index) => {
        if (!src) return null;

        if (src.startsWith("data:image")) {
          const base64 = src.split(",")[1];
          return { path: `images/img_${index}.jpg`, content: base64, encoding: "base64" };
        }

        let absoluteUrl;
        try {
          absoluteUrl = new URL(src, window.location.href).href;
        } catch (err) {
          console.warn("Invalid image URL, skipping:", src);
          return null;
        }

        try {
          const resp = await fetch(absoluteUrl);
          if (!resp.ok) {
            console.warn("Failed to fetch image:", absoluteUrl);
            return null;
          }
          const blob = await resp.blob();
          const base64 = await blobToBase64(blob);
          return { path: `images/img_${index}.jpg`, content: base64, encoding: "base64" };
        } catch (err) {
          console.warn("Error fetching/converting image:", absoluteUrl, err);
          return null;
        }
      })
    );

    const validimages = imageFiles.filter(Boolean);

    // Build files array:
    // - index.html (root)
    // - css/* (folder)
    // - js/* (folder)
    // - images/*
    const files = [
      { path: "index.html", content: cleanedHTML },
      ...cssFiles,
      ...jsFiles,
      ...validimages,
    ];

    // Optional: also include a top-level style.css for backward compatibility if present
    if (!cssFiles.some((f) => f.path === "style.css")) {
      try {
        const resp = await fetch("style.css");
        if (resp.ok) {
          const text = await resp.text();
          files.push({ path: "style.css", content: text });
        }
      } catch (e) {
        // ignore
      }
    }

    if (typeof uploadProject !== "function") {
      console.error("uploadProject is not defined.");
      alert("Publish failed: uploadProject not implemented.");
      setUploadButtonState();
      return;
    }

    // Derive template/folder name from URL (replaces hardcoded "DogGroomer")
    const templateName = getTemplateNameFromUrl("DogGroomer");

    // If you want the server to store everything under a template subfolder,
    // you can prefix file paths with `${templateName}/` here before upload.
    // Example (uncomment to enable):
    // const filesWithPrefix = files.map(f => ({ ...f, path: `${templateName}/${f.path}` }));
    // await uploadProject(filesWithPrefix, nameValue, window.Clerk?.user?.id, templateName);
     // Prefix all file paths with the template folder
const filesWithPrefix = files.map(f => ({
  ...f,
  path: `${templateName}/${f.path}`
}));

await uploadProject(files, nameValue, window.Clerk?.user?.id, templateName);


    console.log("Publish: uploadProject invoked with", files.length, "files.");
    alert("Publish initiated. Check console for upload response.");

    setUploadButtonState("uploaded");
  } catch (err) {
    console.error("Publish failed:", err);
    alert("Publish failed. See console for details.");
    setUploadButtonState();
  }
};

async function uploadProject(files, name, ID, template) {
  const res = await fetch("/api/github/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files, name, ID, template }),
  });

  const data = await res.json();
  console.log("uploadProject response:", data);

  if (data.error === "Repo limit reached. Maximum of 2 repos allowed.") {
    alert("You have reached the maximum of 2 published sites.\nDelete one to publish a new one.");
    throw new Error("Repo limit reached");
  }

  return data;
}

/* =========================
   Stripe Payment Modal Flow
   ========================= */

let stripe = null;
window._stripeElements = null;
window._stripeClientSecret = null;
window.addEventListener("beforeunload", () => {
  saveLocalBackup(true);
});


const STRIPE_PUBLISHABLE_KEY =
  "pk_test_51SmbYSRqySo1SbUl9zUatOFdeP2eN1jYSDT4gNWFjzDaPLMF4QaeXONAJ9Ii2QVz7Bugnhp11UFCCFyg625JGGGu00uMAvRXJq";

const modal = document.getElementById("stripePaymentModal");
const closeBtn = document.getElementById("stripeClose");
const cancelBtn = document.getElementById("cancelPaymentBtn");
const confirmBtn = document.getElementById("confirmPaymentBtn");
const paymentError = document.getElementById("paymentError");
const paymentMessage = document.getElementById("paymentMessage");

function openPaymentModal() {
  if (paymentError) paymentError.style.display = "none";
  if (modal) modal.style.display = "flex";
}

function closePaymentModal() {
  if (modal) modal.style.display = "none";
}

if (closeBtn) closeBtn.addEventListener("click", closePaymentModal);
if (cancelBtn) cancelBtn.addEventListener("click", closePaymentModal);

async function loadStripeModule() {
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@stripe/stripe-js@latest/+esm");
    if (mod && typeof mod.loadStripe === "function") {
      stripe = await mod.loadStripe(STRIPE_PUBLISHABLE_KEY, { telemetry: false });
      window.stripe = stripe;
      console.log("Stripe loaded (CDN):", stripe);
    } else {
      console.warn("Stripe module loaded but loadStripe not found.");
    }
  } catch (err) {
    console.error("Stripe failed to load:", err);
  }
}

async function confirmPayment(elements, clientSecret) {
  try {
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {},
      redirect: "never",
    });

    if (result.error) {
      if (paymentError) {
        paymentError.textContent = result.error.message || "Payment failed";
        paymentError.style.display = "block";
      }
      return { error: result.error };
    }

    return { success: true };
  } catch (err) {
    if (paymentError) {
      paymentError.textContent = err.message || "Payment failed";
      paymentError.style.display = "block";
    }
    return { error: err };
  }
}

if (confirmBtn) {
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    if (paymentError) paymentError.style.display = "none";
    if (paymentMessage) paymentMessage.textContent = "Confirming payment...";

    try {
      if (!window._stripeElements || !window._stripeClientSecret) {
        throw new Error("Stripe not initialized");
      }

      const result = await confirmPayment(window._stripeElements, window._stripeClientSecret);

      if (result?.error) {
        confirmBtn.disabled = false;
        return;
      }

      if (paymentMessage) paymentMessage.textContent = "Payment successful — publishing...";
      closePaymentModal();

      if (typeof publish === "function") {
        await publish();
      }
    } catch (err) {
      if (paymentError) {
        paymentError.textContent = err.message || "Payment failed";
        paymentError.style.display = "block";
      }
      confirmBtn.disabled = false;
      if (paymentMessage) paymentMessage.textContent = "A monthly subscription is required to publish.";
    }
  });
}

/* =========================
   Editor initialization and boot
   ========================= */

function initializeEditor() {
  // Ensure new editor UI exists
  const hasPanel =
    editorQuery("#sidePanel") || editorQuery("#toggleTab");

  if (!hasPanel) {
    console.warn("Editor UI not found — skipping editor initialization.");
    return;
  }

  enableImageReplacement();
  enableTextEditing();
  destroyOwlControls();
  rebindButtons();
}


async function waitForEditorUI(timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (editorQuery("#closedUI") || editorQuery("#openedUI")) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

(async function boot() {
  // Wait for DOM ready
  if (document.readyState === "loading") {
    await new Promise((r) => document.addEventListener("DOMContentLoaded", r));
  }

  // Create shadow UI early
  createShadowEditorUI();
  


  // Load Clerk
  try {
    await loadClerkScript("pk_live_Y2xlcmsuaWRlYWdvLmllJA");
    console.log("Clerk loaded and ready (editor.js).");
  } catch (err) {
    console.warn("Clerk script failed to load; continuing without Clerk.");
  }

  // Load Stripe in background
  loadStripeModule().catch((err) => console.warn("Stripe background load failed:", err));

if (window.Clerk?.user?.id) {
  autoFillSiteName(window.Clerk?.user?.id);
}

  // Initialize editor AFTER autoload
  initializeEditor();
})();
