

function initTemplateNavSlider() {
  let templateNavIndex = 0;
  const templateNavCards = document.querySelectorAll(".template-card");
  const templateNavPrev = document.querySelector(".templateNav-left");
  const templateNavNext = document.querySelector(".templateNav-right");

  if (!templateNavCards.length) return;

  function templateNavShowCard(i) {
    templateNavCards.forEach(c => c.classList.remove("active"));
    templateNavCards[i].classList.add("active");
  }

  if (templateNavPrev && templateNavNext) {
    templateNavNext.onclick = () => {
      templateNavIndex = (templateNavIndex + 1) % templateNavCards.length;
      templateNavShowCard(templateNavIndex);
    };

    templateNavPrev.onclick = () => {
      templateNavIndex = (templateNavIndex - 1 + templateNavCards.length) % templateNavCards.length;
      templateNavShowCard(templateNavIndex);
    };

    setInterval(() => {
      templateNavIndex = (templateNavIndex + 1) % templateNavCards.length;
      templateNavShowCard(templateNavIndex);
    }, 3000);
  }
}

// Mobile hamburger toggle
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      links.classList.toggle("show");
    });
  }
});

async function loadProducts() {
  const wrapper = document.querySelector(".templateNav-wrapper");
  const list = document.querySelector(".template-list");

  if (!wrapper || !list) {
    console.error("Wrapper or list not found in DOM.");
    return;
  }

  /* ---------------------------------------------------
     1) PREVIEW MODE → ALWAYS SHOW DEFAULT PRODUCTS + NAV
  --------------------------------------------------- */
  if (window.previewMode) {
    console.log("Preview mode enabled — using default products.");
    wrapper.style.display = "block";
    return;
  }

  /* ---------------------------------------------------
     2) NORMAL MODE → TRY LOADING products.json
  --------------------------------------------------- */
  try {
    const res = await fetch("Products/products.json");

    // JSON missing → hide wrapper + hide nav
    if (!res.ok) {
      console.warn("products.json not found — hiding store.");
      wrapper.style.display = "none";
      return;
    }

    // JSON exists → show wrapper + show nav
    wrapper.style.display = "block";
    showStoreNav();

    const data = await res.json();
    const products = data.products ?? [];

    list.innerHTML = "";

    products.forEach((p) => {
      const lowestVariant = p.variants?.length
        ? p.variants.reduce((min, v) => (v.price < min.price ? v : min))
        : null;

      const price = lowestVariant ? lowestVariant.price : p.basePrice ?? "N/A";

      const card = document.createElement("div");
      card.className = "template-card";

      card.innerHTML = `
        <img src="${p.image}" alt="">
        <h3>${p.name}</h3>
        <p>${p.description}</p>
        <div class="price">€${price}</div>
        <a class="btn" href="#">Add To Cart</a>
      `;

      list.appendChild(card);
    });

    initTemplateNavSlider();

  } catch (err) {
    console.error("Error loading products:", err);
    wrapper.style.display = "none";
    hideStoreNav();
  }
}

    document.addEventListener("DOMContentLoaded", () => {
  // Make preview mode globally accessible
  const urlParams = new URLSearchParams(window.location.search);
  window.previewMode = urlParams.get("preview") === "true";

  loadProducts();
});
