import { request } from "./transport.js";

const menu = document.querySelector(".landing-menu");
const nav = document.querySelector("#landing-nav");
const header = document.querySelector("#site-header");
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

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
  .matchMedia?.("(min-width: 761px)")
  .addEventListener("change", (event) => {
    if (event.matches) setMenu(false);
  });
function updateHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

if ("IntersectionObserver" in window) {
  const links = [...document.querySelectorAll(".nav-link")];
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (!visible.length) return;
      const active = visible.sort(
        (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
      )[0].target;
      const targetId = active.classList.contains("landing-hero")
        ? "beranda"
        : active.id;
      for (const link of links) {
        const current = link.getAttribute("href") === "#" + targetId;
        link.classList.toggle("is-current", current);
        if (current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "-90px 0px -55% 0px", threshold: 0 },
  );
  for (const link of links) {
    const target =
      link.getAttribute("href") === "#beranda"
        ? document.querySelector(".landing-hero")
        : document.querySelector(link.getAttribute("href"));
    if (target) sectionObserver.observe(target);
  }
  if (!reducedMotion?.matches) {
    document.documentElement.classList.add("motion-ready");
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px 24px 0px" },
    );
    document
      .querySelectorAll("[data-reveal]")
      .forEach((element) => revealObserver.observe(element));
  }
}

document.querySelector("#public-year").textContent = new Intl.DateTimeFormat(
  "en",
  { year: "numeric", timeZone: "Asia/Jakarta" },
).format(new Date());
// The landing page reads public identity only, without loading accounts or archives.
if (window.OSDA_CONFIG?.apiUrl) {
  request("boot")
    .then((data) => {
      if (!data.period) return;
      if (data.period.name != null)
        document.querySelector("#public-period").textContent =
          "OSDA RQ KE-" + data.period.name;
      if (data.period.cabinet_name) {
        const cabinet = document.querySelector("#public-cabinet");
        cabinet.textContent = "Kabinet " + data.period.cabinet_name;
        cabinet.title = cabinet.textContent;
      }
    })
    .catch(() => {});
}
