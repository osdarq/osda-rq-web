import { request } from "./transport.js";

// Only explicitly published achievements enter the public page. Private drafts never do.
const achievementAssets = {
  masjid: "./assets/dayah-masjid-biru.jpg",
  kebersamaan: "./assets/dayah-kebersamaan-santri.jpg",
  jamaah: "./assets/dayah-jamaah.jpg",
  cahaya: "./assets/dayah-kubah-cahaya.jpg",
};
const achievementURLs = new Map();
function paintAchievements(items) {
  const section = document.querySelector("#capaian"),
    list = document.querySelector("#public-achievements-list");
  if (!section || !list || !Array.isArray(items)) return;
  list.replaceChildren();
  for (const row of items.slice(0, 3)) {
    const card = document.createElement("article");
    card.className = "public-achievement";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "public-achievement-image";
    button.setAttribute("aria-label", "Perbesar foto " + row.title);
    const img = document.createElement("img");
    img.alt = row.title;
    img.loading = "lazy";
    img.src = achievementAssets[row.photo_key] || achievementAssets.kebersamaan;
    button.append(img);
    button.addEventListener("click", () => {
      const viewer = document.querySelector("#achievement-viewer");
      if (!viewer?.showModal) return;
      document.querySelector("#achievement-viewer-image").src = img.src;
      document.querySelector("#achievement-viewer-image").alt = row.title;
      document.querySelector("#achievement-viewer-title").textContent =
        row.title;
      document.querySelector("#achievement-viewer-description").textContent =
        row.summary;
      viewer.showModal();
    });
    const copy = document.createElement("div");
    copy.className = "public-achievement-copy";
    const tag = document.createElement("span");
    tag.textContent = [row.department || "Karya bersama", row.date]
      .filter(Boolean)
      .join(" · ");
    const title = document.createElement("h3");
    title.textContent = row.title;
    const summary = document.createElement("p");
    summary.textContent = row.summary;
    const cabinet = document.createElement("small");
    cabinet.textContent = row.cabinet_name || "OSDA RQ ke-" + row.period;
    copy.append(tag, title, summary, cabinet);
    card.append(button, copy);
    list.append(card);
    achievementURLs.set(row.id, img);
    if (row.has_photo && window.OSDA_CONFIG?.apiUrl)
      request("galleryPhoto", { id: row.id })
        .then((photo) => {
          if (
            photo.base64 &&
            ["image/jpeg", "image/png", "image/webp"].includes(photo.mime)
          )
            img.src = `data:${photo.mime};base64,${photo.base64}`;
        })
        .catch(() => {});
  }
  section.hidden = !list.childElementCount;
}
document
  .querySelector("#achievement-viewer-close")
  ?.addEventListener("click", () =>
    document.querySelector("#achievement-viewer").close(),
  );
document
  .querySelector("#achievement-viewer")
  ?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });
if (window.OSDA_CONFIG?.apiUrl)
  request("gallery", { limit: 3 })
    .then((value) => paintAchievements(value.items))
    .catch(() => {});

const menu = document.querySelector(".landing-menu");
const nav = document.querySelector("#landing-nav");
const header = document.querySelector("#site-header");
const progress = document.querySelector(".page-progress > span");
const backToTop = document.querySelector(".back-to-top");
const heroSection = document.querySelector(".landing-hero");
const heroScene = document.querySelector(".hero-backdrop");
const motionPreference = window.matchMedia?.(
  "(prefers-reduced-motion: reduce)",
);
const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)");
let reduceMotion = motionPreference?.matches ?? false;
let heroInView = true;
function syncHeroMotion() {
  heroSection?.style.setProperty(
    "--hero-play",
    heroInView && !document.hidden ? "running" : "paused",
  );
}

function setMenu(open) {
  menu?.setAttribute("aria-expanded", String(open));
  menu?.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  nav?.classList.toggle("is-open", open);
}
menu?.addEventListener("click", () =>
  setMenu(menu.getAttribute("aria-expanded") !== "true"),
);
nav
  ?.querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menu?.getAttribute("aria-expanded") === "true"
  ) {
    setMenu(false);
    menu.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!header?.contains(event.target)) setMenu(false);
});
window
  .matchMedia?.("(min-width: 901px)")
  ?.addEventListener?.("change", (event) => {
    if (event.matches) setMenu(false);
  });

let scrollQueued = false;
function paintScroll() {
  scrollQueued = false;
  const y = window.scrollY || 0;
  header?.classList.toggle("is-scrolled", y > 12);
  backToTop?.classList.toggle("is-visible", y > 650);
  const distance = document.documentElement.scrollHeight - window.innerHeight;
  const fraction = distance > 0 ? Math.min(1, Math.max(0, y / distance)) : 0;
  if (progress) progress.style.transform = "scaleX(" + fraction + ")";
  if (heroScene) {
    const offset =
      !reduceMotion && finePointer?.matches ? Math.min(24, y * 0.04) : 0;
    heroScene.style.setProperty("--scene-offset", offset.toFixed(1) + "px");
  }
}
function queueScroll() {
  if (scrollQueued) return;
  scrollQueued = true;
  if (window.requestAnimationFrame) window.requestAnimationFrame(paintScroll);
  else paintScroll();
}
paintScroll();
window.addEventListener("scroll", queueScroll, { passive: true });
window.addEventListener("resize", queueScroll, { passive: true });

const revealElements = [...document.querySelectorAll("[data-reveal]")];
for (const group of document.querySelectorAll(".mandate-grid")) {
  [...group.children].forEach((element, index) => {
    element.style.setProperty("--reveal-delay", Math.min(index, 2) * 90 + "ms");
  });
}
if ("IntersectionObserver" in window) {
  const links = [...document.querySelectorAll(".nav-link")];
  const visibility = new Map();
  const heroObserver = new IntersectionObserver((entries) => {
    heroInView = entries.some((entry) => entry.isIntersecting);
    syncHeroMotion();
  });
  if (heroSection) heroObserver.observe(heroSection);
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting)
          visibility.set(entry.target, entry.boundingClientRect.top);
        else visibility.delete(entry.target);
      }
      const currentSection = [...visibility.keys()].sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
      )[0];
      if (!currentSection) return;
      const id = currentSection.classList.contains("landing-hero")
        ? "beranda"
        : currentSection.id;
      for (const link of links) {
        const current = link.getAttribute("href") === "#" + id;
        link.classList.toggle("is-current", current);
        if (current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "-85px 0px -55% 0px", threshold: 0 },
  );
  for (const link of links) {
    const target =
      link.getAttribute("href") === "#beranda"
        ? document.querySelector(".landing-hero")
        : document.querySelector(link.getAttribute("href"));
    if (target) sectionObserver.observe(target);
  }
  if (!reduceMotion) document.documentElement.classList.add("motion-ready");
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.06, rootMargin: "0px 0px 22px 0px" },
  );
  revealElements.forEach((element) => revealObserver.observe(element));
}

const tiltElements = [...document.querySelectorAll("[data-tilt]")];
for (const element of tiltElements) {
  let frame = 0;
  let point = null;
  function resetTilt() {
    point = null;
    if (frame && window.cancelAnimationFrame)
      window.cancelAnimationFrame(frame);
    frame = 0;
    element.style.removeProperty("--tilt-x");
    element.style.removeProperty("--tilt-y");
    element.style.removeProperty("--pointer-x");
    element.style.removeProperty("--pointer-y");
  }
  element.addEventListener("pointermove", (event) => {
    if (reduceMotion || !finePointer?.matches || event.pointerType === "touch")
      return;
    point = { x: event.clientX, y: event.clientY };
    if (frame || !window.requestAnimationFrame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (!point || reduceMotion) return;
      const bounds = element.getBoundingClientRect();
      const x = Math.min(
        1,
        Math.max(0, (point.x - bounds.left) / bounds.width),
      );
      const y = Math.min(
        1,
        Math.max(0, (point.y - bounds.top) / bounds.height),
      );
      element.style.setProperty("--tilt-x", ((0.5 - y) * 3).toFixed(2) + "deg");
      element.style.setProperty("--tilt-y", ((x - 0.5) * 3).toFixed(2) + "deg");
      element.style.setProperty("--pointer-x", (x * 100).toFixed(1) + "%");
      element.style.setProperty("--pointer-y", (y * 100).toFixed(1) + "%");
    });
  });
  element.addEventListener("pointerleave", resetTilt);
  element.addEventListener("pointercancel", resetTilt);
  motionPreference?.addEventListener?.("change", resetTilt);
}
motionPreference?.addEventListener?.("change", (event) => {
  reduceMotion = event.matches;
  if (reduceMotion) {
    document.documentElement.classList.remove("motion-ready");
    revealElements.forEach((element) => element.classList.add("is-visible"));
  }
  queueScroll();
});

document.addEventListener("visibilitychange", syncHeroMotion);

// Native details keep the full history usable without JavaScript.
const historyPeriods = [...document.querySelectorAll("[data-history-period]")];
historyPeriods.forEach((period) => {
  period.addEventListener("toggle", () => {
    if (!period.open) return;
    historyPeriods.forEach((other) => {
      if (other !== period && other.open) other.open = false;
    });
  });
});

const photoLinks = [...document.querySelectorAll("[data-photo-view]")];
const photoViewer = document.querySelector("#photo-viewer");
const viewerImage = document.querySelector("#photo-viewer-image");
const viewerTitle = document.querySelector("#photo-viewer-title");
const viewerCaption = document.querySelector("#photo-viewer-caption");
const viewerCount = document.querySelector("#photo-viewer-count");
let photoIndex = 0;
let photoOpener = null;
let savedOverflow = "";

function paintPhoto(index) {
  if (!photoLinks.length || !viewerImage) return;
  photoIndex = (index + photoLinks.length) % photoLinks.length;
  const link = photoLinks[photoIndex];
  viewerImage.src = link.href;
  viewerImage.alt =
    link.querySelector("img")?.alt ||
    link.dataset.photoAlt ||
    link.dataset.photoTitle ||
    "Foto dayah";
  viewerTitle.textContent = link.dataset.photoTitle || "Dayah Ruhul Qurani";
  viewerCaption.textContent = link.dataset.photoCaption || "";
  viewerCount.textContent =
    String(photoIndex + 1).padStart(2, "0") +
    " / " +
    String(photoLinks.length).padStart(2, "0");
}
photoLinks.forEach((link, index) => {
  link.addEventListener("click", (event) => {
    if (
      typeof photoViewer?.showModal !== "function" ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    photoOpener = link;
    paintPhoto(index);
    if (!photoViewer.open) {
      savedOverflow = document.body.style.overflow || "";
      photoViewer.showModal();
      document.body.style.overflow = "hidden";
    }
  });
});
photoViewer
  ?.querySelector("[data-viewer-close]")
  ?.addEventListener("click", () => photoViewer.close());
photoViewer?.querySelectorAll("[data-viewer-step]").forEach((button) => {
  button.addEventListener("click", () =>
    paintPhoto(photoIndex + Number(button.dataset.viewerStep)),
  );
});
photoViewer?.addEventListener("keydown", (event) => {
  if (!photoViewer.open) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    paintPhoto(photoIndex + (event.key === "ArrowRight" ? 1 : -1));
  }
  if (event.key === "Escape") {
    event.preventDefault();
    photoViewer.close();
  }
});
photoViewer?.addEventListener("click", (event) => {
  if (event.target !== photoViewer) return;
  const bounds = photoViewer.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    photoViewer.close();
});
photoViewer?.addEventListener("close", () => {
  document.body.style.overflow = savedOverflow;
  photoOpener?.focus({ preventScroll: true });
});

document.querySelector("#public-year").textContent = new Intl.DateTimeFormat(
  "en",
  { year: "numeric", timeZone: "Asia/Jakarta" },
).format(new Date());
// Only the public organization identity is read by the landing page.
if (window.OSDA_CONFIG?.apiUrl) {
  request("boot")
    .then((data) => {
      if (!data.period) return;
      if (data.period.name != null) {
        const name = String(data.period.name);
        document.querySelector("#public-period").textContent =
          "OSDA RQ KE-" + name;
        document.querySelector("#public-term-number").textContent =
          /^\d{1,2}$/.test(name) ? name.padStart(2, "0") : "RQ";
      }
      if (data.period.cabinet_name) {
        const cabinet = document.querySelector("#public-cabinet");
        cabinet.textContent = "Kabinet " + data.period.cabinet_name;
        cabinet.title = cabinet.textContent;
      }
    })
    .catch(() => {});
}
