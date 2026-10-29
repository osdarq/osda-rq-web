(() => {
  // Directory pages keep formal URLs on static hosting, including old bookmarks.
  try {
    const current = new URL(window.location.href);
    if (["http:", "https:"].includes(current.protocol)) {
      if (current.pathname.endsWith("/app.html")) {
        const destination = new URL("./ruang-pengurus/", current);
        destination.search = current.search;
        destination.hash = current.hash;
        window.location.replace(destination.href);
        return;
      }
      if (
        current.pathname.endsWith("/index.html") &&
        window.history?.replaceState
      ) {
        const canonical = new URL("./", current);
        canonical.search = current.search;
        canonical.hash = current.hash;
        window.history.replaceState(window.history.state, "", canonical.href);
      }
    }
  } catch {}
  const root = document.documentElement;
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const storageKey = "osda.route.v1";
  let pending = false;
  let navigationTimer = 0;
  let recoveryTimer = 0;
  const curtain = document.createElement("div");
  curtain.className = "route-curtain";
  curtain.setAttribute("aria-hidden", "true");
  curtain.innerHTML =
    '<div class="route-signature"><span class="route-ring"></span><b>RQ</b></div><span class="route-caption"></span>';
  document.body.append(curtain);
  const caption = curtain.querySelector(".route-caption");

  function resetRoute() {
    pending = false;
    window.clearTimeout(navigationTimer);
    window.clearTimeout(recoveryTimer);
    root.classList.remove("osda-route-leaving", "osda-route-arriving");
  }
  function clearNavigationHint() {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {}
  }
  try {
    const hint = JSON.parse(
      window.sessionStorage.getItem(storageKey) || "null",
    );
    clearNavigationHint();
    const path = window.location.pathname || "/";
    if (
      hint &&
      hint.path === path &&
      Date.now() - hint.at < 10000 &&
      Date.now() >= hint.at &&
      !preference?.matches
    ) {
      caption.textContent = hint.label || "OSDA RQ";
      root.classList.add("osda-route-arriving");
      recoveryTimer = window.setTimeout(resetRoute, 380);
    }
  } catch {}

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[data-osda-nav]");
    if (
      !link ||
      event.defaultPrevented ||
      event.button > 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self") ||
      preference?.matches
    )
      return;
    let destination;
    try {
      destination = new URL(link.getAttribute("href"), window.location.href);
    } catch {
      return;
    }
    if (
      !["http:", "https:"].includes(destination.protocol) ||
      destination.origin !== window.location.origin ||
      destination.pathname === window.location.pathname
    )
      return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    const label =
      link.dataset.osdaNav === "landing"
        ? "KEMBALI KE BERANDA"
        : "RUANG PENGURUS";
    caption.textContent = label;
    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ path: destination.pathname, at: Date.now(), label }),
      );
    } catch {}
    root.classList.remove("osda-route-arriving");
    root.classList.add("osda-route-leaving");
    navigationTimer = window.setTimeout(
      () => window.location.assign(destination.href),
      180,
    );
    recoveryTimer = window.setTimeout(() => {
      clearNavigationHint();
      resetRoute();
    }, 1800);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      clearNavigationHint();
      resetRoute();
    }
  });
  preference?.addEventListener?.("change", (event) => {
    if (event.matches && !pending) resetRoute();
  });
})();
