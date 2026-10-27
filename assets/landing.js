import { request } from "./transport.js";
const menu = document.querySelector(".landing-menu"),
  nav = document.querySelector("#landing-nav");
menu?.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  nav.classList.toggle("is-open", open);
});
nav?.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    nav.classList.remove("is-open");
    menu.setAttribute("aria-expanded", "false");
  }),
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    nav.classList.remove("is-open");
    menu.setAttribute("aria-expanded", "false");
  }
});
document.querySelector("#public-year").textContent = new Intl.DateTimeFormat(
  "en",
  { year: "numeric", timeZone: "Asia/Jakarta" },
).format(new Date());
if (window.OSDA_CONFIG?.apiUrl)
  request("boot")
    .then((data) => {
      if (data.period) {
        document.querySelector("#public-period").textContent =
          "OSDA RQ KE-" + data.period.name;
        if (data.period.cabinet_name)
          document.querySelector("#public-cabinet").textContent =
            "Kabinet " + data.period.cabinet_name;
      }
    })
    .catch(() => {});
