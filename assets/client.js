"use strict";
  function clientId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function")
      return window.crypto.randomUUID();
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return (
        "rec-" +
        Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
      );
    }
    return (
      "rec-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2) +
      "-" +
      Math.random().toString(36).slice(2)
    );
  }
  const $ = (s) => document.querySelector(s),
    esc = (v) =>
      String(v == null ? "" : v).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const state = {
    page: "Ringkasan",
    data: null,
    query: { scope: "Semua", month: OSDA_BOOT.month },
    eventId: "",
    archiveEventId: "",
    archivePage: 1,
    archives: null,
    deleted: false,
    search: "",
    category: "",
    editor: null,
    loading: 0,
    saving: false,
    structureDepartment: "Semua",
    dossier: null,
    dossierRequest: 0,
    choiceRequest: 0,
  };
  const loadingUI = {
    requests: new Map(),
    buttons: new Map(),
    serial: 0,
    idle: "Siap",
  };
  function loadingMark_() {
    return `<svg class="rq-loader" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false"><title>RQ</title><g class="rq-loader-orbit"><circle class="rq-loader-arc" cx="24" cy="24" r="21" pathLength="100"/><circle class="rq-loader-spark" cx="24" cy="3" r="1.65"/></g><g class="rq-loader-orbit rq-loader-orbit--inner"><circle class="rq-loader-arc" cx="24" cy="24" r="18" pathLength="100"/></g><g class="rq-loader-monogram"><g class="rq-loader-ghost"><path class="rq-loader-r" d="M11 33V15h7a6 6 0 0 1 0 12h-7m7 0 7 7"/><path class="rq-loader-q" d="M23 24c0-5.5 2-9 6.5-9s6.5 3.5 6.5 9-2 9-6.5 9-6.5-3.5-6.5-9Zm7 4 8 8"/></g><path class="rq-loader-letter rq-loader-r" pathLength="100" d="M11 33V15h7a6 6 0 0 1 0 12h-7m7 0 7 7"/><path class="rq-loader-letter rq-loader-q" pathLength="100" d="M23 24c0-5.5 2-9 6.5-9s6.5 3.5 6.5 9-2 9-6.5 9-6.5-3.5-6.5-9Zm7 4 8 8"/></g></svg>`;
  }
  function loadingIndicator_(label = "Memuat…", size = "sm", announce = true) {
    const scale = ["xs", "sm"].includes(size) ? size : "sm";
    return `<span class="rq-loading rq-loading--${scale}"${announce ? ' role="status" aria-live="polite"' : ""}>${loadingMark_()}<span class="rq-loading-label">${esc(label)}</span></span>`;
  }
  function loadingPanel_(label) {
    return `<section class="panel feature-loading">${loadingIndicator_(label)}</section>`;
  }
  function paintRequestLoading_() {
    const target = $("#sync-state");
    if (!target) return;
    const labels = [...loadingUI.requests.values()];
    if (labels.length && !$("#workspace").hidden) {
      target.innerHTML = loadingIndicator_(
        labels[labels.length - 1],
        "xs",
        false,
      );
      target.setAttribute("aria-busy", "true");
    } else {
      target.textContent = loadingUI.idle;
      target.removeAttribute("aria-busy");
    }
  }
  function setSyncStatus_(label) {
    loadingUI.idle = label;
    paintRequestLoading_();
  }
  function beginRequestLoading_(label = "Memproses…") {
    const id = ++loadingUI.serial;
    loadingUI.requests.set(id, label);
    paintRequestLoading_();
    return () => {
      if (loadingUI.requests.delete(id)) paintRequestLoading_();
    };
  }
  function beginButtonLoading_(button, label = "Memproses…") {
    if (!button || loadingUI.buttons.has(button)) return () => {};
    const saved = {
      nodes: [...button.childNodes],
      disabled: button.disabled,
      busy: button.getAttribute("aria-busy"),
      minWidth: button.style.minWidth,
    };
    const width = button.getBoundingClientRect?.().width;
    if (width) button.style.minWidth = Math.ceil(width) + "px";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("rq-is-loading");
    button.innerHTML = loadingIndicator_(label, "xs", false);
    const finish = () => {
      if (loadingUI.buttons.get(button) !== finish) return;
      loadingUI.buttons.delete(button);
      button.replaceChildren(...saved.nodes);
      button.disabled = saved.disabled;
      button.style.minWidth = saved.minWidth;
      button.classList.remove("rq-is-loading");
      if (saved.busy === null) button.removeAttribute("aria-busy");
      else button.setAttribute("aria-busy", saved.busy);
    };
    loadingUI.buttons.set(button, finish);
    return finish;
  }
  function resetLoading_() {
    [...loadingUI.buttons.values()].forEach((finish) => finish());
    loadingUI.requests.clear();
    document.body.classList.remove("busy");
    setSyncStatus_("Siap");
  }
  function requestLoadingLabel_(method) {
    if (/^(save|update|set|respond|readNotifications)/.test(method))
      return "Menyimpan…";
    if (/^(download|export)/.test(method)) return "Menyiapkan unduhan…";
    if (/^(preview|inspect)/.test(method)) return "Memeriksa data…";
    if (/^(issue|publish|finalize)/.test(method)) return "Menerbitkan…";
    if (/^(createBackup|restoreBackup|commitImport)/.test(method))
      return "Memproses data…";
    return "Memuat data…";
  }
  const navigationGroups = [
    {
      title: "Ruang Kerja",
      pages: ["Ringkasan", "Tugas Saya", "Notifikasi", "Panduan"],
    },
    {
      title: "Kepengurusan",
      pages: ["Kepengurusan", "Program Kerja", "Pembinaan"],
    },
    {
      title: "Kegiatan & Capaian",
      pages: ["Kalender", "Acara OSDA", "Galeri Capaian"],
    },
    {
      title: "Evaluasi & Dokumen",
      pages: [
        "Evaluasi Bulanan",
        "Laporan Bulanan",
        "Persuratan",
        "Arsip & Surat",
        "Buku Pedoman",
        "Serah Terima",
      ],
    },
    {
      title: "Pengelolaan",
      pages: [
        "Impor Data",
        "Kelola Data",
        "Akun & Akses",
        "Cadangan",
        "Pengaturan",
      ],
    },
  ];
  const pages = navigationGroups.flatMap((group) => group.pages);
  const paths = [
    "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 12h8 M8 16h6",
    "M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0z M7 10h10 M7 14h7",
    "M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h3 M8 18h8",
    "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4",
    "M3 6h7l2 3h9v12H3z",
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  ];
  const icon = (i) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[i]}"/></svg>`;
  function symbol(name) {
    const shapes = {
      pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
      edit: "m16 3 5 5-12 12-6 1 1-6z M13 6l5 5",
      plus: "M12 5v14 M5 12h14",
      shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
      book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16",
      language:
        "M3 5h12 M9 3v2 M6 5c0 6 6 9 6 9 M12 5c0 6-6 9-9 10 M14 21l4-10 4 10 M15 18h6",
      leaf: "M20 3C8 3 3 7 5 14c3 8 15 5 15-11 M4 21l11-12",
      camera: "M4 7h4l2-3h4l2 3h4v14H4z M16 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
      ball: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c-6 5-6 13 0 18 M12 3c6 5 6 13 0 18",
      mic: "M9 3h6v11H9z M6 11v3a6 6 0 0 0 12 0v-3 M12 20v3 M8 23h8",
      structure:
        "M9 3h6v5H9z M3 16h5v5H3z M16 16h5v5h-5z M9.5 16h5v5h-5z M12 8v5 M5.5 16v-3h13v3 M12 13v3",
      spark: "m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z",
      target: "M20 12a8 8 0 1 1-8-8 M12 12l8-8 M15 4h5v5 M16 12a4 4 0 1 1-4-4",
      check: "M5 12l4 4L19 6 M21 12a9 9 0 1 1-9-9",
      clock: "M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
      arrow: "M5 12h14 M13 6l6 6-6 6",
      layers: "m12 3 9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
      printer: "M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v7H6z M17 11h1",
      calendar: paths[4],
      folder: paths[5],
      people: paths[6],
      chat: paths[2],
      clipboard: paths[1],
      upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
      database:
        "M20 6c0 2-4 4-8 4S4 8 4 6s4-4 8-4 8 2 8 4z M4 6v6c0 2 4 4 8 4s8-2 8-4V6 M4 12v6c0 2 4 4 8 4s8-2 8-4v-6",
      settings: paths[7],
      bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${shapes[name] || shapes.layers}"/></svg>`;
  }
  const initials = (name) =>
    (String(name || "OS").match(/[\p{L}\p{N}]+/gu) || ["OS"])
      .filter(
        (p) =>
          ![
            "ust",
            "ustzh",
            "ustadz",
            "ustaz",
            "ustazah",
            "ustadzah",
            "h",
            "hj",
            "dr",
            "drs",
          ].includes(p.toLowerCase()),
      )
      .map((p) => Array.from(p)[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const actionPermissions = {
    "evaluation-ready": "setEvaluationStage",
    "evaluation-discussed": "setEvaluationStage",
    "evaluation-final": "finalizeEvaluation",
    "evaluation-reopen": "reopenEvaluation",
    member: "saveMember",
    dayah: "saveDayahLeader",
    "dayah-new": "saveDayahLeader",
    program: "saveProgram",
    report: "saveReport",
    meeting: "saveMeeting",
    issue: "saveIssue",
    "issue-program": "saveIssue",
    event: "saveEvent",
    task: "saveTask",
    "task-event": "saveTask",
    archive: "saveArchive",
    "archive-event": "saveArchive",
    category: "saveCategory",
    "period-new": "savePeriod",
    requirement: "saveEventRequirement",
    "requirement-new": "saveEventRequirement",
    "requirements-seed": "seedEventRequirements",
    "archive-trash": "setArchiveTrash",
    "archive-restore": "setArchiveTrash",
    "archive-trash-view": "setArchiveTrash",
    export: "exportData",
    account: "saveAccount",
    grant: "saveGrant",
    resetpassword: "resetAccountPassword",
    "mentor-note": "saveMentorNote",
  };
  function pageIconIndex_(page) {
    return (
      {
        Ringkasan: 0,
        "Tugas Saya": 1,
        Kalender: 4,
        "Program Kerja": 1,
        "Evaluasi Bulanan": 2,
        "Laporan Bulanan": 3,
        "Acara OSDA": 4,
        "Arsip & Surat": 5,
        Kepengurusan: 6,
        Pengaturan: 7,
        "Akun & Akses": 6,
        Pembinaan: 2,
        "Serah Terima": 6,
        "Impor Data": 5,
        Cadangan: 5,
      }[page] ?? 0
    );
  }
  function periodGrants_() {
    return (state.data?.access.grants || []).filter(
      (g) => g.term_id === state.query.term_id,
    );
  }
  function hasPeriodRole_(roles) {
    return periodGrants_().some((g) => roles.includes(g.role));
  }
  function hasPersonalAssignment_() {
    const id = state.data?.current_user?.id || authLive.user?.id;
    return Boolean(
      id &&
        ["tasks", "issues", "carried_tasks", "requirements"].some((key) =>
          state.data[key]?.some((r) => r.owner_account_id === id),
        ),
    );
  }
  function visibleDepartments_() {
    const all = state.data?.departments || [],
      grants = periodGrants_();
    return state.data?.access.is_admin || grants.some((g) => !g.department)
      ? all
      : all.filter((name) => grants.some((g) => g.department === name));
  }
  function pageVisible_(page) {
    if (!state.data || !pages.includes(page)) return false;
    if (
      ["Panduan", "Notifikasi", "Persuratan", "Buku Pedoman"].includes(page) &&
      OSDA_BOOT.office_ready === false
    )
      return false;
    if (
      ["Pengaturan", "Kelola Data", "Akun & Akses", "Cadangan"].includes(page)
    )
      return state.data.access.is_admin;
    if (state.data.access.is_admin) return true;
    const coordinators = ["Ketua OSDA", "Sekretaris"];
    const organizers = [...coordinators, "Ketua Bidang", "Kepala Bidang"];
    if (["Persuratan", "Galeri Capaian"].includes(page))
      return hasPeriodRole_(coordinators);
    if (page === "Serah Terima") return hasPeriodRole_(organizers);
    if (page === "Tugas Saya")
      return hasPeriodRole_(organizers) || hasPersonalAssignment_();
    if (page === "Impor Data")
      return (
        state.data.access.is_admin ||
        state.data.access.grants.some(
          (g) =>
            !g.read_only &&
            g.term_id === state.query.term_id &&
            g.actions.some((a) => ["saveMember", "saveProgram"].includes(a)),
        )
      );
    return true;
  }
  const sidebarUI = {
    compact: false,
    closed: {},
    mobile: null,
    tooltipTarget: null,
  };
  function saveSidebarPrefs_() {
    try {
      window.localStorage.setItem(
        "osda.sidebar.v1",
        JSON.stringify({
          compact: sidebarUI.compact,
          closed: sidebarUI.closed,
        }),
      );
    } catch (_) {}
  }
  function initializeSidebar_() {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("osda.sidebar.v1") || "null",
      );
      sidebarUI.compact = saved?.compact === true;
      sidebarUI.closed = {};
      navigationGroups.forEach((_, index) => {
        if (saved?.closed?.[index] === true) sidebarUI.closed[index] = true;
      });
    } catch (_) {}
    paintSidebarLayout_();
  }
  function paintSidebarLayout_() {
    hideNavTooltip_();
    const mobile = (window.innerWidth || 1024) <= 760,
      sidebar = $("#sidebar"),
      fold = $("#sidebar-collapse"),
      toggle = $("#menu-toggle");
    if (sidebarUI.mobile !== mobile || !mobile)
      sidebar.classList.remove("open");
    sidebarUI.mobile = mobile;
    const open = mobile && sidebar.classList.contains("open");
    document.body.classList.toggle(
      "sidebar-compact",
      !mobile && sidebarUI.compact,
    );
    document.body.classList.toggle("nav-drawer-open", open);
    sidebar.toggleAttribute("inert", mobile && !open);
    sidebar.setAttribute("aria-hidden", String(mobile && !open));
    fold.setAttribute("aria-expanded", String(mobile || !sidebarUI.compact));
    const label = sidebarUI.compact ? "Perluas sidebar" : "Ringkas sidebar";
    fold.setAttribute("aria-label", label);
    fold.title = label;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  }
  function setMobileSidebar_(open, focus = false) {
    if ((window.innerWidth || 1024) > 760) return;
    if (sidebarUI.mobile !== true) paintSidebarLayout_();
    $("#sidebar").classList.toggle("open", Boolean(open));
    paintSidebarLayout_();
    if (focus) {
      if (open) $("#navigation .nav-group-toggle")?.focus();
      else $("#menu-toggle").focus();
    }
  }
  function paintSidebarGroup_(section) {
    if (!section) return;
    const index = section.dataset.navGroup,
      closed = sidebarUI.closed[index] === true,
      toggle = section.querySelector(".nav-group-toggle"),
      list = section.querySelector(".nav-group-list");
    section.classList.toggle("is-collapsed", closed);
    toggle.setAttribute("aria-expanded", String(!closed));
    const label = (closed ? "Buka " : "Tutup ") + navigationGroups[index].title;
    toggle.setAttribute("aria-label", label);
    toggle.dataset.navTooltip = label;
    list.setAttribute("aria-hidden", String(closed));
    list.toggleAttribute("inert", closed);
  }
  function revealSidebarPage_(page) {
    const index = navigationGroups.findIndex((group) =>
      group.pages.includes(page),
    );
    if (index >= 0 && sidebarUI.closed[index]) {
      sidebarUI.closed[index] = false;
      saveSidebarPrefs_();
    }
  }
  function hideNavTooltip_() {
    $("#sidebar-tooltip")?.setAttribute("hidden", "");
    sidebarUI.tooltipTarget?.removeAttribute("aria-describedby");
    sidebarUI.tooltipTarget = null;
  }
  function showNavTooltip_(target) {
    if (target && sidebarUI.tooltipTarget === target) return;
    hideNavTooltip_();
    if (!target || !document.body.classList.contains("sidebar-compact")) return;
    const tooltip = $("#sidebar-tooltip");
    if (!tooltip) return;
    const rect = target.getBoundingClientRect?.(),
      side = $("#sidebar").getBoundingClientRect?.();
    tooltip.textContent = target.dataset.navTooltip;
    tooltip.style.left = (side?.right || 80) + 12 + "px";
    tooltip.style.top =
      Math.max(
        12,
        Math.min(
          (rect?.top || 0) + (rect?.height || 36) / 2,
          (window.innerHeight || 800) - 24,
        ),
      ) + "px";
    tooltip.removeAttribute("hidden");
    target.setAttribute("aria-describedby", "sidebar-tooltip");
    sidebarUI.tooltipTarget = target;
  }
  function renderNavigation_() {
    const navSymbols = {
      "Tugas Saya": "check",
      Kalender: "calendar",
      "Program Kerja": "book",
      "Evaluasi Bulanan": "chat",
      "Laporan Bulanan": "clipboard",
      "Acara OSDA": "spark",
      "Galeri Capaian": "camera",
      "Kelola Data": "database",
      "Arsip & Surat": "folder",
      Kepengurusan: "structure",
      "Akun & Akses": "shield",
      Pembinaan: "people",
      "Serah Terima": "layers",
      "Impor Data": "upload",
      Cadangan: "database",
      Pengaturan: "settings",
      Panduan: "book",
      Notifikasi: "bell",

      Persuratan: "clipboard",
      "Buku Pedoman": "book",
    };
    hideNavTooltip_();
    const nav = $("#navigation"),
      scrollTop = nav.scrollTop;
    nav.innerHTML = navigationGroups
      .map((group, index) => {
        const visible = group.pages.filter(pageVisible_);
        if (!visible.length) return "";
        return `<section class="nav-group ${visible.includes(state.page) ? "nav-group-current" : ""}" data-nav-group="${index}" aria-labelledby="nav-group-${index}"><h2 id="nav-group-${index}" class="nav-group-title"><button type="button" class="nav-group-toggle" data-sidebar-group="${index}" aria-controls="nav-group-list-${index}"><span class="nav-group-symbol" aria-hidden="true">${symbol(["layers", "structure", "calendar", "folder", "settings"][index])}</span><span class="nav-group-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span class="nav-group-name">${esc(group.title)}</span><span class="nav-group-caret" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg></span><i class="nav-group-active" aria-hidden="true"></i></button></h2><div class="nav-group-list" id="nav-group-list-${index}"><div class="nav-group-items">${visible.map((page) => `<button type="button" data-action="page" data-id="${esc(page)}" aria-label="${esc(page)}" data-nav-tooltip="${esc(page)}" class="${state.page === page ? "current" : ""}" ${state.page === page ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${page === "Ringkasan" ? icon(0) : symbol(navSymbols[page])}</span><span class="nav-label">${esc(page)}</span>${page === "Evaluasi Bulanan" && state.data.monthly.agenda.length ? `<b class="nav-count" aria-label="${state.data.monthly.agenda.length} bahan pembahasan">${state.data.monthly.agenda.length}</b>` : ""}</button>`).join("")}</div></div></section>`;
      })
      .join("");
    nav.querySelectorAll(".nav-group").forEach(paintSidebarGroup_);
    nav.scrollTop = scrollTop;
  }
  function isScopeFinal(scope, month) {
    return Boolean(
      state.data?.evaluation_stages?.some(
        (r) =>
          r.scope === scope &&
          r.month === (month || state.query.month) &&
          r.status === "Final",
      ),
    );
  }
  function sharedEventUI_(permission, record) {
    if (!record || record.scope !== "Bersama") return false;
    if (
      [
        "saveEvent",
        "saveTask",
        "saveEventRequirement",
        "seedEventRequirements",
      ].includes(permission)
    )
      return true;
    return (
      ["saveArchive", "setArchiveTrash"].includes(permission) &&
      state.data.events.some(
        (e) => e.id === record.event_id && e.scope === "Bersama",
      )
    );
  }
  function archiveScopes_() {return scopesFor("saveArchive").length ? ["Bersama"] : [];}
  function canUI(permission, record) { if (["saveArchive","setArchiveTrash"].includes(permission) && record) return archiveCanWrite_(permission,record);
    const scope = record?.scope || state.query.scope;
    if (
      ["saveReport", "saveMeeting", "saveMentorNote"].includes(permission) &&
      isScopeFinal(scope, record?.month)
    )
      return false;
    if (permission === "saveIssue" && !record && isScopeFinal(scope))
      return false;
    const access = state.data?.access;
    if (!access) return false;
    if (access.is_admin) return true;
    return access.grants.some(
      (g) =>
        !g.read_only &&
        g.term_id === state.query.term_id &&
        (g.actions || []).includes(permission) &&
        (!record ||
          ((!record.scope ||
            g.scope === "Semua" ||
            g.scope === record.scope ||
            sharedEventUI_(permission, record)) &&
            (!g.department || record.department === g.department))),
    );
  }
  function actionRecord(action, id) {
    if (action.startsWith("evaluation-")) return { scope: id, department: "" };
    if (action === "event") return state.data?.events.find((e) => e.id === id);
    if (action === "task") return state.data?.tasks.find((t) => t.id === id);
    if (action === "meeting")
      return state.data?.meetings.find((m) => m.id === id);
    if (action === "issue") return state.data?.issues.find((m) => m.id === id);
    if (["program", "report", "issue-program", "mentor-note"].includes(action))
      return state.data?.programs.find((p) => p.id === id);
    if (
      action === "archive" ||
      action === "archive-trash" ||
      action === "archive-restore"
    )
      return state.archives?.items.find((a) => a.id === id);
    return null;
  }
  const button = (label, action, id, kind = "secondary small") => {
    if (action === "page" && !pageVisible_(id)) return "";
    if (
      action === "issue-program" &&
      isScopeFinal(actionRecord(action, id)?.scope)
    )
      return "";
    if (
      actionPermissions[action] &&
      !canUI(actionPermissions[action], actionRecord(action, id))
    )
      return "";
    return `<button type="button" class="button ${kind}" data-action="${action}" data-id="${esc(id || "")}">${action === "print" ? symbol("printer") : ""}${esc(label)}</button>`;
  };
  function scopesFor(permission) {
    if (state.data.access.is_admin) return scopeOptions;
    const grants = state.data.access.grants.filter(
      (g) =>
        g.term_id === state.query.term_id &&
        !g.read_only &&
        g.actions.includes(permission),
    );
    return grants.some((g) => g.scope === "Semua")
      ? scopeOptions
      : [...new Set(grants.map((g) => g.scope))];
  }
  function departmentsFor(permission) {
    const available = ["saveProgram", "saveReport"].includes(permission)
      ? state.data.program_departments || [
          "Formatur",
          ...state.data.departments,
        ]
      : state.data.departments;
    if (state.data.access.is_admin) return available;
    const grants = state.data.access.grants.filter(
      (g) =>
        g.term_id === state.query.term_id &&
        !g.read_only &&
        g.actions.includes(permission),
    );
    return grants.some((g) => !g.department)
      ? available
      : [...new Set(grants.map((g) => g.department))];
  }
  const badge = (label) => {
    const kind = [
      "Tercapai",
      "Melampaui target",
      "Terlaksana dengan baik",
      "Selesai",
      "Lengkap",
    ].includes(label)
      ? "good"
      : [
            "Sebagian",
            "Terlaksana, perlu perbaikan",
            "Diproses",
            "Menunggu pemeriksaan",
            "Diserahkan",
            "Duplikat",
            "Perlu diperbaiki",
          ].includes(label)
        ? "warn"
        : [
              "Belum terlaksana",
              "Terbuka",
              "Belum lengkap",
              "Tenggat terlewati",
            ].includes(label)
          ? "bad"
          : "neutral";
    return `<span class="badge ${kind}">${esc(label)}</span>`;
  };
  const empty = (title, description) =>
    `<div class="empty"><span class="empty-icon">${symbol("folder")}</span><h3>${esc(title)}</h3><p>${esc(description)}</p></div>`;
  const table = (heads, rows) =>
    `<div class="table-wrap"><table><thead><tr>${heads.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  const scopeOptions = ["Santriwan", "Santriwati", "Bersama"];
  const roleOptions = [
    "Ketua OSDA RQ",
    "Wakil Ketua",
    "Sekretaris",
    "Bendahara",
    "Ketua Bidang",
    "Wakil Ketua Bidang",
    "Mentor Bidang",
    "Anggota",
  ];
  const readCache_ = { generation: 0, values: new Map(), pending: new Map() };
  const cacheableReads_ = new Set([
    "personalData",
    "handoverData",
    "guideData",
    "notificationData",
    "dashboardContext",
    "officeData",
    "manualData",
    "galleryData",
    "eventDossier",
    "eventArchiveChoices",
    "listArchives",
  ]);
  function resetReadCache_() {
    readCache_.generation++;
    readCache_.values.clear();
    readCache_.pending.clear();
  }
  function copyReadResult_(data) {
    return data == null ? data : JSON.parse(JSON.stringify(data));
  }
  function api(name, arg) {
    const token = authLive.token;
    const cachedRead = cacheableReads_.has(name);
    if (!cachedRead) resetReadCache_();
    const generation = readCache_.generation;
    const key = JSON.stringify([
      token,
      generation,
      name,
      arg === undefined ? null : arg,
    ]);
    if (token && cachedRead) {
      const cached = readCache_.values.get(key);
      if (cached && Date.now() >= cached.at && Date.now() - cached.at < 15000)
        return Promise.resolve(copyReadResult_(cached.data));
      const pending = readCache_.pending.get(key);
      if (pending) return pending.then(copyReadResult_);
    }
    const finish =
      token &&
      !["notificationData", "dashboardContext", "guideData"].includes(name)
        ? beginRequestLoading_(requestLoadingLabel_(name))
        : () => {};
    const request = new Promise((resolve, reject) => {
      if (!token) {
        reject(Error("Silakan masuk terlebih dahulu."));
        return;
      }
      google.script.run
        .withSuccessHandler((data) => {
          if (authLive.token !== token) {
            reject(Error("STALE_SESSION"));
            return;
          }
          resolve(data);
        })
        .withFailureHandler((error) => {
          const message = error.message || String(error);
          if (authLive.token === token && message.includes("AUTH_REQUIRED:"))
            showLogin(message.replace("AUTH_REQUIRED:", ""));
          if (authLive.token === token && message.includes("PASSWORD_CHANGE:"))
            openPassword(true);
          reject(Error(message));
        })
        .rpc({ token, action: name, argument: arg === undefined ? null : arg });
    })
      .then((data) => {
        if (
          cachedRead &&
          authLive.token === token &&
          readCache_.generation === generation
        ) {
          if (readCache_.values.size >= 24)
            readCache_.values.delete(readCache_.values.keys().next().value);
          readCache_.values.set(key, {
            at: Date.now(),
            data: copyReadResult_(data),
          });
        }
        return data;
      })
      .finally(() => {
        if (readCache_.pending.get(key) === request)
          readCache_.pending.delete(key);
        finish();
      });
    if (cachedRead) readCache_.pending.set(key, request);
    return cachedRead ? request.then(copyReadResult_) : request;
  }
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      $("#toast").hidden = true;
    }, 6000);
  }
  function date(s, withTime = false) {
    if (!s) return "Belum ditentukan";
    const d = new Date(s.length === 10 ? s + "T12:00:00Z" : s);
    if (Number.isNaN(d.getTime())) return String(s);
    return (
      new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        timeZone: "Asia/Jakarta",
      }).format(d) + (withTime ? " WIB" : "")
    );
  }
  function monthName(m) {
    return new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date(m + "-15T00:00:00Z"));
  }
  function localDateTime(s) {
    if (!s) return "";
    const d = new Date(new Date(s).getTime() + 7 * 3600000);
    return d.toISOString().slice(0, 16);
  }
  function link(url, label) {
    return /^https:\/\//i.test(String(url))
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label || "Buka dokumen")} ↗</a>`
      : "—";
  }
  function currentPeriod() {
    return state.data.periods.find((x) => x.id === state.query.term_id) || {};
  }
  function archiveLink(record, label) {
    if (record.source_type !== "file") return link(record.url, label);
    return `<button type="button" class="button secondary small" data-action="archive-download" data-id="${esc(record.archive_id || record.id)}" data-version="${esc(record.version || "")}">${symbol("folder")}${esc(label || "Unduh berkas")}</button>`;
  }
  function programRows(list, selectable = false) {
    return list.map(
      (p) =>
        `<tr>${selectable ? `<td><input type="checkbox" data-program-select="${esc(p.id)}" aria-label="Pilih ${esc(p.name)}" ${workUI.programSelection.has(p.id) ? "checked" : ""}></td>` : ""}<td><strong>${esc(p.name)}</strong><small>${esc(p.scope)}${p.formatur_role ? " · " + esc(p.formatur_role) : ""}</small></td><td>${esc(p.frequency)}<small>${esc(p.schedule)}</small></td><td><strong>${esc(p.department)}</strong></td><td>${badge(p.active ? p.result.status : "Nonaktif")}</td><td class="prewrap">${esc(p.report?.implementation_notes || p.report?.obstacles || (p.report ? "Sudah dilaporkan." : "Menunggu laporan bidang."))}</td><td><div class="actions">${button("Lapor pelaksanaan", "report", p.id)}${button("Ubah", "program", p.id)}${button("Bahas", "issue-program", p.id)}${button("Catatan mentor", "mentor-note", p.id)}</div></td></tr>`,
    );
  }

  function activate(page) {
    if (!pageVisible_(page)) return;
    revealSidebarPage_(page);
    state.featureRequest = (state.featureRequest || 0) + 1;
    state.importPreview = null;
    state.finalRequest = (state.finalRequest || 0) + 1;
    state.finalReport = null;
    state.finalVersions = [];
    state.page = page;
    document.body.classList.toggle("view-report", page === "Laporan Bulanan");
    state.eventId = "";
    if (page !== "Arsip & Surat") state.archiveEventId = "";
    setMobileSidebar_(false);
    render();
    window.scrollTo(0, 0);
  }
  async function load() {
    const sequence = ++state.loading;
    document.body.classList.add("busy");
    setSyncStatus_("Menyinkronkan data…");
    if (!state.data)
      $("#page").innerHTML = loadingPanel_("Memuat data organisasi…");
    try {
      const data = await api("appData", state.query);
      if (sequence !== state.loading) return;
      state.finalRequest = (state.finalRequest || 0) + 1;
      state.finalReport = null;
      state.finalVersions = [];
      state.data = data;
      state.query = data.query;
      $("#term-filter").innerHTML = data.periods
        .map(
          (p) =>
            `<option value="${esc(p.id)}">Periode ke-${esc(p.name)}${p.active ? " · Aktif" : ""}</option>`,
        )
        .join("");
      $("#term-filter").value = state.query.term_id;
      const visibleScopes = data.access.is_admin
        ? scopeOptions
        : [
            ...new Set(
              data.access.grants
                .filter((g) => g.term_id === data.query.term_id)
                .flatMap((g) =>
                  g.scope === "Semua" ? scopeOptions : [g.scope],
                ),
            ),
          ];
      $("#scope-filter").innerHTML =
        '<option value="Semua">Semua akses saya</option>' +
        visibleScopes
          .map((x) => `<option value="${esc(x)}">${esc(x)}</option>`)
          .join("");
      $("#scope-filter").value = state.query.scope;
      $("#month-filter").value = state.query.month;
      setSyncStatus_(
        "Tersinkron · " +
          new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
      render();
    } catch (e) {
      if (sequence !== state.loading) return;
      toast(e.message);
      if (!state.data)
        $("#page").innerHTML = empty("Data belum dapat dimuat", e.message);
      setSyncStatus_("Belum tersinkron");
    } finally {
      if (sequence === state.loading) document.body.classList.remove("busy");
    }
  }
  function render() {
    if (!state.data) return;
    if (!pageVisible_(state.page)) state.page = "Ringkasan";
    document.body.classList.toggle(
      "view-report",
      state.page === "Laporan Bulanan",
    );
    $("#page-title").textContent =
      state.page === "Kepengurusan" ? "Struktur Pengurus" : state.page;
    document.body.classList.toggle(
      "view-structure",
      state.page === "Kepengurusan",
    );
    document.body.dataset.page = state.page;
    const group = navigationGroups.find((g) => g.pages.includes(state.page));
    $("#breadcrumb").textContent =
      (group?.title || "OSDA RQ").toUpperCase() + " / OSDA RQ";
    $("#page-subtitle").textContent = {
      "Tugas Saya":
        "Tenggat, rekap, dan arahan yang menjadi tanggung jawab Anda.",
      Panduan: "Petunjuk kerja sesuai jabatan dan penugasan Anda.",
      Notifikasi: "Perkembangan dan pekerjaan yang berkaitan dengan akun Anda.",

      Persuratan:
        "Susun draf, terbitkan nomor, dan cetak surat resmi organisasi.",
      "Buku Pedoman": "Naskah pedoman, sumber resmi, dan versi yang berlaku.",
      Kalender:
        "Satu kalender untuk acara, rapat, dan tenggat yang telah ditetapkan.",
      "Serah Terima": "Amanah berlanjut, catatan kepengurusan tetap tersimpan.",
      "Impor Data": "Periksa isi file sebelum menambahkan data organisasi.",
      Cadangan:
        "Simpan cadangan dan pulihkan data dengan pemeriksaan terlebih dahulu.",
      Ringkasan: "Satu ruang untuk memantau amanah dan langkah perbaikan.",
      "Program Kerja":
        "Program yang telah disahkan, pelaksanaan yang tercatat.",
      "Evaluasi Bulanan":
        "Dengarkan kendala, sepakati langkah, tuntaskan bersama.",
      "Laporan Bulanan":
        "Catatan capaian dan keputusan untuk menjaga kesinambungan.",
      "Acara OSDA": "Dari persiapan pertama hingga dokumentasi terakhir.",
      "Arsip & Surat": "Setiap dokumen tersusun, setiap jejak mudah ditemukan.",
      Kepengurusan: "Mengenal pengemban amanah dari setiap periode.",
      Pengaturan: "Kelola periode, kategori, dan data organisasi.",
      "Akun & Akses":
        "Akun pribadi, penugasan yang jelas, dan pergantian pengurus yang tertata.",
      Pembinaan: "Arahan pendamping untuk memperbaiki pelaksanaan program.",
      "Galeri Capaian": "Dokumentasi terpilih, jejak karya setiap kabinet.",
      "Kelola Data":
        "Rapikan data uji, periksa keterkaitan, dan pulihkan bila diperlukan.",
    }[state.page];
    $("#today-label").textContent = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date());
    renderNavigation_();
    updateWorkspaceFilters_();
    $("#version-label").textContent = "OSDA RQ · v" + OSDA_BOOT.version;
    $("#version-label").hidden = !state.data.access.is_admin;
    $("#print-context").textContent =
      "OSDA RQ ke-" +
      currentPeriod().name +
      " · " +
      state.query.scope +
      " · " +
      (state.page === "Kepengurusan"
        ? "Struktur pengurus"
        : monthName(state.query.month));
    const views = {
      Ringkasan: dashboard,
      "Tugas Saya": personalView,
      Panduan: officeGuideView_,
      Notifikasi: officeNotificationsView_,

      Persuratan: officeLettersView_,
      "Buku Pedoman": officeManualsView_,
      Kalender: calendarView,
      "Serah Terima": handoverView,
      "Impor Data": importView,
      Cadangan: backupView,
      "Program Kerja": programs,
      "Evaluasi Bulanan": evaluation,
      "Laporan Bulanan": monthlyReport,
      "Acara OSDA": events,
      Kepengurusan: roster,
      "Arsip & Surat": archives,
      Pengaturan: settings,
      "Akun & Akses": accounts,
      Pembinaan: mentorNotes,
      "Galeri Capaian": galleryView_,
      "Kelola Data": dataManagerView_,
    };
    views[state.page]();
    workspaceAfterRender_();
    interiorAfterRender_();
    tick();
  }
  function updateWorkspaceFilters_() {
    const noMonth = [
      "Kepengurusan",
      "Acara OSDA",
      "Galeri Capaian",
      "Arsip & Surat",
      "Buku Pedoman",
      "Serah Terima",
      "Impor Data",
      "Kelola Data",
      "Akun & Akses",
      "Cadangan",
      "Pengaturan",
    ];
    const noScope = [
      "Galeri Capaian",
      "Kelola Data",
      "Akun & Akses",
      "Cadangan",
      "Pengaturan",
    ];
    $("#month-filter").closest("label").hidden = noMonth.includes(state.page);
    $("#scope-filter").closest("label").hidden = noScope.includes(state.page);
    $("#term-filter").closest("label").hidden = state.page === "Cadangan";
  }
  function dashboard() {
    const d = state.data,
      work = d.programs.filter((p) => p.active),
      review = work.filter((p) => p.result.needs_review),
      missing = work.filter((p) => p.result.missing),
      open = d.issues.filter((x) => x.status !== "Selesai"),
      reportable = work.filter((p) => p.report || p.result.target > 0),
      reported = reportable.filter((p) => p.report).length,
      coverage = reportable.length
        ? Math.round((reported / reportable.length) * 100)
        : 0,
      planning = work.filter((p) =>
        ["Target belum ditetapkan", "Jadwal belum ditetapkan"].includes(
          p.result.status,
        ),
      ).length,
      event = d.events
        .filter(
          (e) =>
            e.starts_at &&
            new Date(e.starts_at) > new Date() &&
            !["Dibatalkan", "Ditunda", "Selesai"].includes(e.status),
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
    const departmentRows = visibleDepartments_()
      .map((name, i) => {
        const list = work.filter((p) => p.department === name),
          done = list.filter((p) => p.report).length;
        const percent = list.length
          ? Math.round((done / list.length) * 100)
          : 0;
        return `<div class="department-row"><span class="department-index">${String(i + 1).padStart(2, "0")}</span><div><strong>${esc(name)}</strong><div class="mini-meter" aria-hidden="true"><i style="width:${percent}%"></i></div></div><span>${list.length ? done + "/" + list.length + " rekap" : "Belum disusun"}</span></div>`;
      })
      .join("");
    const shortcuts = [
      [
        "clipboard",
        "Program Kerja",
        canUI("saveReport") ? "Isi rekap program" : "Tinjau program kerja",
        canUI("saveReport")
          ? "Catat pelaksanaan bidang"
          : "Baca pelaksanaan dan capaian bidang",
        "blue",
      ],
      [
        "chat",
        canUI("saveMentorNote") && !canUI("saveReport")
          ? "Pembinaan"
          : "Evaluasi Bulanan",
        canUI("saveMentorNote") && !canUI("saveReport")
          ? "Berikan arahan"
          : "Lihat evaluasi",
        canUI("saveMentorNote") && !canUI("saveReport")
          ? "Catat pembinaan untuk bidang Anda"
          : "Pantau pembahasan dan tindak lanjut",
        "teal",
      ],
      [
        "folder",
        "Arsip & Surat",
        canUI("saveArchive") ? "Rapikan arsip" : "Baca arsip",
        canUI("saveArchive")
          ? "Simpan jejak organisasi"
          : "Temukan dokumen dalam akses Anda",
        "amber",
      ],
      [
        "people",
        "Kepengurusan",
        "Lihat kepengurusan",
        "Kenali setiap periode",
        "violet",
      ],
    ];
    $("#page").innerHTML =
      `<section class="dashboard-overview" aria-label="Kelengkapan rekap bulan ini"><div class="overview-copy"><span class="eyebrow">LANGKAH BULAN INI</span><h2>Program terarah.<br><em>Amanah terjaga.</em></h2><p>Pantau kelengkapan rekap, lalu siapkan pembahasan bersama.</p><div class="overview-actions">${button("Mulai rekap", "page", "Program Kerja", "")}${button("Lihat laporan", "page", "Laporan Bulanan")}</div></div><div class="readiness-card"><div class="readiness-heading"><span>${symbol("spark")} MENJELANG EVALUASI</span><b>Rekap ${esc(monthName(state.query.month))}</b></div><div class="readiness-body"><div class="progress-ring" style="--progress:${coverage}%" role="progressbar" aria-label="Kelengkapan laporan program" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${coverage}"><div><strong>${coverage}<small>%</small></strong><span>terekap</span></div></div><div class="readiness-text"><strong>${reported} <span>/ ${reportable.length}</span></strong><p>${reportable.length ? "program sudah dilaporkan" : "Belum ada program yang perlu dilaporkan"}</p></div></div><div class="readiness-foot">${symbol("clock")}<span>${planning ? planning + " rencana masih perlu dilengkapi" : "Lengkapi rekap sebelum rapat bersama"}</span></div></div></section><div class="stats dashboard-stats">${[
        [
          "Program aktif",
          work.length,
          "Harian, mingguan & tahunan",
          "clipboard",
          "blue",
        ],
        [
          "Perlu dibahas",
          review.length,
          "Pelaksanaan perlu diperbaiki",
          "target",
          "amber",
        ],
        [
          "Rekap / rencana kosong",
          missing.length,
          "Perlu konfirmasi bidang",
          "clock",
          "teal",
        ],
        [
          "Tindak lanjut terbuka",
          open.length,
          "Keputusan belum dituntaskan",
          "chat",
          "violet",
        ],
      ]
        .map(
          ([label, value, note, shape, tone]) =>
            `<article class="stat stat-${tone}"><div class="stat-top"><span>${esc(label)}</span><i class="stat-icon">${symbol(shape)}</i></div><strong>${value}</strong><small>${esc(note)}</small></article>`,
        )
        .join(
          "",
        )}</div><div class="section-heading"><div><span class="eyebrow">LANGKAH BERIKUTNYA</span><h2>Akses cepat</h2></div><span class="section-note">Ruang kerja yang sering digunakan</span></div><div class="quick-grid">${shortcuts
        .filter(([, page]) => pageVisible_(page))
        .map(
          ([shape, page, title, subtitle, tone]) =>
            `<button type="button" class="quick-action tone-${tone}" data-action="page" data-id="${esc(page)}"><span class="quick-icon">${symbol(shape)}</span><span><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span><i>${symbol("arrow")}</i></button>`,
        )
        .join(
          "",
        )}</div><section class="panel focus-panel"><div class="panel-head"><div><span class="eyebrow">PEMANTAUAN BULAN INI</span><h2>Yang perlu mendapat perhatian</h2><p>Capaian program dan kelengkapan laporan sebagai bahan rapat bersama.</p></div>${button("Buka evaluasi", "page", "Evaluasi Bulanan")}</div>${review.length + missing.length ? table(["Program", "Jenis / Jadwal", "Bidang penanggung jawab", "Pelaksanaan", "Catatan", "Tindakan"], programRows(review.concat(missing))) : empty("Pemantauan siap dilanjutkan", work.length ? "Lihat rincian rekap dan keputusan pada laporan bulanan." : "Susun program setiap bidang untuk memulai pemantauan.")}<div class="inline-note">${symbol("check")}<span>Rekap yang belum masuk perlu dikonfirmasi. Program tahunan di luar jadwal tidak dianggap gagal.</span></div></section><div class="insight-grid"><section class="panel department-panel"><div class="panel-head"><div><span class="eyebrow">${visibleDepartments_().length === d.departments.length ? "LINTAS BIDANG, SATU TUJUAN" : "BIDANG DALAM PENUGASAN ANDA"}</span><h2>Ritme setiap bidang</h2></div><span class="panel-symbol">${symbol("layers")}</span></div><p class="muted">Jumlah rekap dibanding program aktif pada bulan ini.</p>${departmentRows}</section><div class="insight-stack"><section class="continuity-card"><span class="eyebrow">JEJAK KEPEMIMPINAN</span><h3>Amanah berlanjut,<br>cerita tetap tersimpan.</h3><p>Temukan nama pengurus, formatur, dan mentor dari setiap periode OSDA RQ.</p>${button("Lihat kepengurusan", "page", "Kepengurusan")}<div class="period-strip">${d.periods.map((p) => button("Ke-" + p.name, "period", p.id)).join("")}</div></section></div></div>`;
    mountDashboardServices_();
  }
  function programs() {
    programsView_();
  }
  function orgCard(record, role, scope, department, options = {}) {
    const kind = options.kind || "member",
      emptyCard = !record;
    const student =
      kind === "member" && !["Pembina OSDA", "Mentor Bidang"].includes(role);
    const origin = record?.origin || "";
    const name = record?.name || "Identitas belum diisi";
    return `<article class="org-card ${kind === "dayah" ? "org-dayah" : "org-osda"} ${emptyCard ? "org-empty" : ""} ${options.tone || ""} ${options.compact ? "org-compact" : ""}">
          <span class="org-card-shine" aria-hidden="true"></span>
          ${options.scopeTag ? `<span class="org-scope-tag">${esc(scope)}</span>` : ""}
          <span class="org-avatar">${record ? esc(initials(record.name)) : symbol(kind === "dayah" ? "shield" : "people")}<i>${symbol(kind === "dayah" || role === "Mentor Bidang" ? "book" : "spark")}</i></span>
          <strong class="org-name">${esc(name)}</strong>
          <span class="org-role">${esc(role)}</span>
          ${student ? `<span class="org-origin ${origin ? "" : "origin-empty"}">${symbol("pin")}${esc(origin || "Asal daerah belum diisi")}</span>` : ""}
          ${orgEdit(record, role, scope, department, kind)}
        </article>`;
  }
  function orgEdit(record, role, scope, department, kind, formal = false) {
    if (
      !canUI(
        kind === "dayah" ? "saveDayahLeader" : "saveMember",
        record || { scope, department },
      )
    )
      return "";
    return `<button type="button" class="org-edit ${formal ? "org-official-edit" : ""}" data-action="org-person" data-kind="${kind}" data-id="${esc(record?.id || "")}" data-role="${esc(role)}" data-scope="${esc(scope || "Bersama")}" data-department="${esc(department || "")}" aria-label="${record ? "Ubah" : "Isi"} ${esc(role)}${department && department !== role ? " · " + esc(department) : ""}${kind === "member" ? " · " + esc(scope) : ""}">${symbol(record ? "edit" : "plus")}<span>${record ? "Ubah identitas" : "Isi identitas"}</span></button>`;
  }
  function officialCard(role) {
    const record = state.data.dayah_leaders.find((r) => r.role === role);
    return `<article class="org-official ${record ? "" : "official-empty"}">
          <strong>${esc(record?.name || "Identitas belum diisi")}</strong>
          <span>${esc(role)}</span>
          ${orgEdit(record, role, "Bersama", "", "dayah", true)}
        </article>`;
  }
  function rosterBranch(scope) {
    const d = state.data,
      members = d.members.filter((m) => m.scope === scope);
    const find = (department, role) =>
      members.find((m) => m.department === department && m.role === role);
    const person = (department, role, tone, compact = false) =>
      orgCard(find(department, role), role, scope, department, {
        tone,
        compact,
      });
    const departments =
      state.structureDepartment === "Semua"
        ? d.departments
        : d.departments.filter((name) => name === state.structureDepartment);
    const formaturExtra = members.filter(
      (m) =>
        m.department === "Formatur" &&
        !["Ketua OSDA RQ", "Wakil Ketua", "Sekretaris", "Bendahara"].includes(
          m.role,
        ),
    );
    const fieldIcons = [
      "shield",
      "book",
      "language",
      "leaf",
      "camera",
      "ball",
      "mic",
    ];
    return `<section class="org-branch ${scope === "Santriwati" ? "branch-teal" : ""}" aria-label="Struktur OSDA ${esc(scope)}" id="struktur-${esc(scope)}"><header class="org-branch-heading"><span class="org-branch-icon">${symbol("people")}</span><div><span class="eyebrow">KEPENGURUSAN OSDA RQ</span><h2>${esc(scope)}</h2></div><span class="org-branch-count">${members.length} identitas tercatat</span></header><section class="org-formatur"><div class="org-section-title"><span>01</span><div><h3>Formatur</h3><p>Pengurus inti dan penggerak koordinasi organisasi.</p></div></div><div class="org-single">${person("Formatur", "Ketua OSDA RQ", "tone-chair")}</div><div class="org-stem" aria-hidden="true"></div><div class="org-single">${person("Formatur", "Wakil Ketua", "tone-vice")}</div><div class="org-stem" aria-hidden="true"></div><div class="org-pair org-linked-row">${person("Formatur", "Sekretaris", "tone-secretary")}${person("Formatur", "Bendahara", "tone-treasurer")}</div>${formaturExtra.length ? `<div class="org-legacy-members">${formaturExtra.map((m) => orgCard(m, m.role, scope, m.department, { compact: true })).join("")}</div>` : ""}</section><div class="org-stem org-stem-long" aria-hidden="true"></div><div class="org-section-title fields-heading"><span>02</span><div><h3>Bidang-bidang OSDA</h3><p>Mentor bidang → Ketua → Wakil → Anggota.</p></div><span class="org-field-count">${departments.length} bidang</span></div><div class="org-department-grid ${departments.length === 1 ? "is-single" : ""}">${departments
      .map((department) => {
        const index = d.departments.indexOf(department);
        const team = members.filter(
          (m) => m.department === department && m.role === "Anggota",
        );
        return `<section class="org-department" aria-label="Bidang ${esc(department)} · ${esc(scope)}"><header class="org-department-heading"><span>${symbol(fieldIcons[index])}</span><div><small>BIDANG ${String(index + 1).padStart(2, "0")}</small><h3>${esc(department)}</h3></div></header><div class="org-department-tree">${person(department, "Mentor Bidang", "tone-mentor", true)}<div class="org-stem" aria-hidden="true"></div>${person(department, "Ketua Bidang", "tone-chair", true)}<div class="org-stem" aria-hidden="true"></div>${person(department, "Wakil Ketua Bidang", "tone-vice", true)}<div class="org-stem" aria-hidden="true"></div><div class="org-team"><div class="org-team-label"><span>${symbol("people")} Anggota</span><b>${team.length}</b></div><div class="org-team-grid">${team.length ? team.map((m) => orgCard(m, "Anggota", scope, department, { compact: true, tone: "tone-member" })).join("") : orgCard(null, "Anggota", scope, department, { compact: true, tone: "tone-member" })}</div>${team.length ? `<button type="button" class="org-add-member" data-action="org-person" data-kind="member" data-role="Anggota" data-scope="${esc(scope)}" data-department="${esc(department)}">${symbol("plus")} Tambah anggota</button>` : ""}</div></div></section>`;
      })
      .join("")}</div></section>`;
  }
  function roster() {
    const d = state.data,
      period = currentPeriod();
    const branches =
      state.query.scope === "Semua"
        ? ["Santriwan", "Santriwati"]
        : state.query.scope === "Bersama"
          ? []
          : [state.query.scope];
    const technicalRoles = d.leadership_levels[2].roles.filter(
      (role) =>
        !branches.length ||
        branches.length === 2 ||
        role ===
          (branches[0] === "Santriwan"
            ? "Ketua Rayon Putra"
            : "Ketua Rayon Putri"),
    );
    const legacy = d.members.filter((m) => m.role === "Pembina OSDA");
    const formalLevels = d.leadership_levels
      .slice(0, 2)
      .map(
        (level, index) => `
          <section class="org-formal-level" aria-label="${esc(level.title)}">
            <header class="org-formal-heading">
              <span class="org-level-number">0${index + 1}</span>
              <h3>${esc(level.title)}</h3>
              <span class="org-same-level">${level.roles.length} jabatan sejajar</span>
            </header>
            <div class="org-official-grid officials-${level.roles.length}">${level.roles.map(officialCard).join("")}</div>
          </section>`,
      )
      .join('<div class="org-stem" aria-hidden="true"></div>');
    const technicalCards = technicalRoles
      .map((role) => {
        const scope = role === "Ketua Rayon Putra" ? "Santriwan" : "Santriwati";
        const record = d.dayah_leaders.find((r) => r.role === role);
        return orgCard(record, role, scope, "", {
          kind: "dayah",
          tone:
            "org-technical " +
            (scope === "Santriwati" ? "technical-teal" : "technical-navy"),
          scopeTag: true,
        });
      })
      .join("");
    $("#page").innerHTML = `
          <section class="structure-summary" aria-label="Periode struktur OSDA">
            <span class="structure-summary-icon" aria-hidden="true">${symbol("structure")}</span>
            <div><span class="eyebrow">SUSUNAN AMANAH OSDA</span><h2>Periode ke-${esc(period.name)}</h2><p>${esc(period.years || "Kepengurusan Dayah Ruhul Qurani")}</p></div>
            <span class="structure-period-status">${period.active ? "Periode aktif" : "Riwayat kepengurusan"}</span>
          </section>
          <div class="structure-controls">
            <div class="period-strip"><span>Riwayat kepengurusan</span>${d.periods.map((p) => `<button data-action="period" data-id="${esc(p.id)}" class="${p.id === state.query.term_id ? "active" : ""}">OSDA ke-${esc(p.name)}${p.active ? " · Aktif" : ""}</button>`).join("")}</div>
            <div class="toolbar-actions">${button("Cetak struktur", "print")}${button("+ Identitas dayah", "dayah-new")}${button("+ Pengurus OSDA", "member", "", "")}</div>
          </div>
          <div class="tabs structure-scopes">${["Semua", "Santriwan", "Santriwati", "Bersama"].map((scope) => `<button data-action="scope" data-id="${scope}" aria-pressed="${scope === state.query.scope}" class="${scope === state.query.scope ? "active" : ""}">${scope === "Bersama" ? "Struktur dayah" : scope === "Semua" ? "Seluruh kepengurusan" : scope}</button>`).join("")}</div>
          <section class="org-formal-institution" aria-label="Penasihat dan Pembina Utama">${formalLevels}</section>
          <div class="org-stem org-stem-long" aria-hidden="true"></div>
          <section class="org-technical-stage" aria-label="Pendamping Teknis / Pengarah">
            <header class="org-technical-heading"><span class="org-stage-symbol">${symbol("book")}</span>
              <div><span class="eyebrow">03 · PENDAMPINGAN ORGANISASI</span><h3>Pendamping Teknis / Pengarah</h3><p>Mendampingi formatur dan bidang di masing-masing rayon.</p></div>
            </header>
            <div class="org-technical-grid ${technicalRoles.length === 1 ? "is-single" : ""}">${technicalCards}</div>
          </section>
          ${
            branches.length
              ? `
            <div class="org-stem org-stem-long" aria-hidden="true"></div>
            <div class="structure-department-filter">
              <div><span class="eyebrow">FORMATUR & TUJUH BIDANG</span><p>Telusuri susunan pengurus dan pendamping setiap bidang.</p></div>
              <div class="structure-department-tabs" aria-label="Pilih bidang">${["Semua", ...d.departments].map((department) => `<button type="button" data-action="structure-department" data-id="${esc(department)}" class="${state.structureDepartment === department ? "active" : ""}" aria-pressed="${state.structureDepartment === department}">${department === "Semua" ? "Semua bidang" : esc(department)}</button>`).join("")}</div>
            </div>${branches.map(rosterBranch).join("")}`
              : '<p class="org-history-note">Pilih Santriwan atau Santriwati untuk melihat formatur dan struktur setiap bidang.</p>'
          }
          ${legacy.length ? `<details class="org-legacy-records"><summary>Catatan pembina dari versi sebelumnya <span>${legacy.length} identitas</span></summary><p>Catatan lama tetap tersimpan. Penetapan sebagai Penasihat, Pembina Utama, atau Pendamping Teknis dilakukan melalui identitas jabatan di atas.</p><div class="org-legacy-grid">${legacy.map((m) => orgCard(m, m.role, m.scope, m.department, { compact: true, scopeTag: true })).join("")}</div></details>` : ""}
          <div class="structure-footnote">${symbol("layers")}<span>Riwayat tersimpan per periode · Nama, jabatan, dan asal daerah pada identitas pengurus santri.</span></div>`;
  }
  function agendaPanel() {
    const monthly = state.data.monthly;
    const agenda = monthly.agenda;
    return `<section class="panel agenda-panel"><div class="panel-head"><div><span class="eyebrow">PERSIAPAN RAPAT</span><h2>Agenda dari pemantauan</h2><p>${agenda.length} bahan pembahasan · Tenggat diperiksa hingga ${esc(date(monthly.as_of))}</p></div>${button("Laporan bulanan", "page", "Laporan Bulanan")}</div><p class="muted">Urutan: tenggat terlewati, tindak lanjut lama, capaian program, lalu kelengkapan rekap. Tombol Bahas menyiapkan formulir untuk dicatat saat rapat.</p>${
      agenda.length
        ? table(
            ["Bahan pembahasan", "Alasan", "Penanggung jawab", "Tindakan"],
            agenda.map(
              (a, i) =>
                `<tr><td><span class="agenda-number">${i + 1}</span><strong>${esc(a.title)}</strong><small>${esc(a.department)} · ${esc(a.scope)}</small><small>${esc(a.detail)}</small></td><td>${badge(a.reason)}<small>${esc(monthName(a.month))}</small></td><td>${esc(a.owner)}${a.due ? `<small>Tenggat ${esc(date(a.due))}</small>` : ""}</td><td>${a.issue_id ? button("Buka catatan", "issue", a.issue_id) : button("Bahas", "issue-program", a.program_id)}</td></tr>`,
            ),
          )
        : '<p class="muted">Belum ada bahan otomatis. Masalah lintas bidang tetap dapat dicatat melalui Catatan evaluasi.</p>'
    }</section>`;
  }
  function evaluationStageFor(scope) {
    return (
      state.data.evaluation_stages?.find(
        (r) => r.scope === scope && r.month === state.query.month,
      ) || {
        scope,
        status: "Draf",
        revision: 0,
        version: 0,
        meeting_id: "",
        notes: "",
      }
    );
  }
  function evaluationWorkflow() {
    const scope = state.query.scope;
    const scopes = state.data.access.is_admin
      ? scopeOptions
      : [
          ...new Set(
            state.data.access.grants
              .filter((g) => g.term_id === state.query.term_id)
              .flatMap((g) => (g.scope === "Semua" ? scopeOptions : [g.scope])),
          ),
        ];
    if (scope === "Semua")
      return `<section class="evaluation-workflow"><span class="eyebrow">PERTANGGUNGJAWABAN BULANAN</span><h2>Dari laporan menuju keputusan</h2><p>Pilih satu kepengurusan untuk menyiapkan evaluasi atau membuka laporan finalnya. Lingkup Bersama hanya mencakup data bersama.</p><div class="evaluation-scope-grid">${scopes
        .map((name) => {
          const row = evaluationStageFor(name);
          return `<article class="evaluation-scope-card"><div><strong>${esc(name)}</strong>${badge(row.status)}${row.version ? `<div class="evaluation-meta">Versi final terakhir: ${row.version}</div>` : ""}</div>${button("Buka " + name, "evaluation-open", name)}</article>`;
        })
        .join("")}</div></section>`;
    const row = evaluationStageFor(scope),
      stages = ["Draf", "Siap Evaluasi", "Dibahas", "Final"],
      index = stages.indexOf(row.status),
      target = { scope, department: "" };
    const actions = [];
    if (row.status === "Draf" && canUI("setEvaluationStage", target))
      actions.push(button("Tandai siap evaluasi", "evaluation-ready", scope));
    if (row.status === "Siap Evaluasi" && canUI("setEvaluationStage", target))
      actions.push(
        button("Catat sudah dibahas", "evaluation-discussed", scope),
      );
    if (row.status === "Dibahas" && canUI("finalizeEvaluation", target))
      actions.push(
        button("Finalkan laporan bulan ini", "evaluation-final", scope),
      );
    if (row.status === "Final" && canUI("reopenEvaluation", target))
      actions.push(
        button("Buka koreksi beralasan", "evaluation-reopen", scope),
      );
    if (row.version)
      actions.push(
        button(
          "Lihat final v" + row.version,
          "evaluation-version",
          String(row.version),
        ),
      );
    return `<section class="evaluation-workflow"><div class="panel-head"><div><span class="eyebrow">PERTANGGUNGJAWABAN · ${esc(scope)}</span><h2>Evaluasi ${esc(monthName(state.query.month))}</h2><p>${row.status === "Final" ? "Rekap, notulen, dan keputusan rapat sudah dikunci. Status serta hasil tindak lanjut tetap dapat diperbarui." : "Lengkapi rekap, bahas bersama seluruh anggota, lalu simpan laporan final yang disepakati."}</p></div>${badge(row.status)}</div><div class="evaluation-steps">${stages.map((stage, i) => `<div class="evaluation-step ${i < index ? "is-done" : i === index ? "is-current" : ""}" ${i === index ? 'aria-current="step"' : ""}><span>${i < index ? "✓" : i + 1}</span>${esc(stage)}</div>`).join("")}</div>${row.reopen_reason ? `<p><strong>Koreksi:</strong> ${esc(row.reopen_reason)}</p>` : ""}${row.version ? `<div class="evaluation-meta">Final terakhir v${row.version} · ${esc(row.finalized_name)} · ${esc(date(row.finalized_at, true))}</div>` : ""}<div class="evaluation-actions">${actions.join("")}</div></section>`;
  }
  async function viewMonthlyVersion(version) {
    const sequence = (state.finalRequest = (state.finalRequest || 0) + 1);
    $("#page").innerHTML = loadingPanel_("Membuka versi laporan final…");
    try {
      const result = await api("getMonthlySnapshot", {
        ...state.query,
        version,
      });
      if (sequence !== state.finalRequest || state.page !== "Laporan Bulanan")
        return;
      state.finalReport = result.data;
      state.finalVersions = result.versions;
      renderMonthlyReport();
    } catch (e) {
      if (sequence === state.finalRequest && state.page === "Laporan Bulanan")
        $("#page").innerHTML = empty(
          "Laporan final belum dapat dibuka",
          e.message,
        );
    }
  }
  function monthlyReport() {
    if (state.requestedFinalVersion) {
      const version = state.requestedFinalVersion;
      state.requestedFinalVersion = 0;
      viewMonthlyVersion(version);
      return;
    }
    const row = evaluationStageFor(state.query.scope);
    if (
      state.query.scope !== "Semua" &&
      row.status === "Final" &&
      row.version
    ) {
      viewMonthlyVersion(row.version);
      return;
    }
    renderMonthlyReport();
  }
  function reportVersionBanner() {
    const saved = state.finalReport?.finalization;
    if (!saved)
      return state.query.scope === "Semua"
        ? '<div class="final-report-banner">Tampilan gabungan adalah pemantauan terkini. Pilih satu kepengurusan untuk membuka laporan final yang tersimpan.</div>'
        : "";
    return `<section class="final-report-banner"><strong>Laporan final tersimpan · versi ${saved.version}</strong><span>Difinalkan oleh ${esc(saved.by)} · ${esc(date(saved.at, true))}. Angka, notulen, dan keputusan di bawah mengikuti versi ini.</span>${saved.notes ? `<p>${esc(saved.notes)}</p>` : ""}<div class="final-report-versions">${state.finalVersions.map((v) => button("Versi " + v.version, "evaluation-version", String(v.version))).join("")}${button("Lihat pemantauan terkini", "evaluation-live")}</div></section>`;
  }
  function renderMonthlyReport() {
    const data = state.finalReport || state.data,
      period = state.finalReport?.period || currentPeriod();
    document.body.classList.add("view-report");
    $("#page").innerHTML =
      `${evaluationWorkflow()}${reportVersionBanner()}<div class="toolbar"><p>Laporan resmi pelaksanaan program dan evaluasi OSDA RQ.</p><div class="toolbar-actions">${button("Buka evaluasi", "page", "Evaluasi Bulanan")}${button("Cetak / simpan PDF", "print", "", "")}</div></div>${formalReportHTML_(data, period)}`;
  }
  function evaluation() {
    const d = state.data,
      meetings = d.meetings.filter((x) => x.month === state.query.month),
      issues = d.issues.filter(
        (x) => x.month === state.query.month || x.status !== "Selesai",
      );
    $("#page").innerHTML =
      `${evaluationWorkflow()}<div class="toolbar"><p>Evaluasi seluruh anggota OSDA, lintas bidang. Tindak lanjut terbuka dari bulan sebelumnya tetap ditampilkan.</p><div class="toolbar-actions">${button("Cetak evaluasi", "print")}${button("+ Rapat bulanan", "meeting")}${button("+ Catatan evaluasi", "issue", "", "")}</div></div>${agendaPanel()}${meetings.length ? meetings.map((m) => `<section class="panel"><div class="panel-head"><div><span class="eyebrow">RAPAT · ${esc(m.scope)}</span><h3>${esc(m.name)}</h3><p>${esc(date(m.date))}</p></div>${button("Ubah rapat / notulen", "meeting", m.id)}</div><p><strong>Peserta:</strong> ${esc(m.participants)}</p><p class="prewrap muted">${esc(m.notes || "Notulen belum diisi.")}</p></section>`).join("") : empty("Rapat bulan ini belum dicatat", canUI("saveMeeting") ? "Buat rapat untuk menghubungkan masalah, tanggapan, dan keputusan bersama." : "Catatan rapat akan tampil setelah dicatat pengurus yang berwenang.")}<div class="panel-head"><h2>Masalah & tindak lanjut</h2>${button("Lihat rekap program", "page", "Program Kerja")}</div>${issues.length ? issues.map((x) => `<article class="panel issue"><div class="panel-head"><span class="eyebrow">${esc(x.month)} · ${esc(x.scope)}${x.month !== state.query.month ? " · LANJUTAN BULAN SEBELUMNYA" : ""}</span>${badge(x.status)}</div><div class="route">${esc(x.from_department)} → ${esc(x.to_department)}</div><h3>${esc(x.problem)}</h3><dl><div><dt>TANGGAPAN</dt><dd>${esc(x.response || "Menunggu tanggapan.")}</dd></div><div><dt>KEPUTUSAN BERSAMA</dt><dd>${esc(x.decision || "Belum ditetapkan.")}</dd></div>${x.resolution ? `<div><dt>HASIL TINDAK LANJUT</dt><dd>${esc(x.resolution)}</dd></div>` : ""}</dl><div class="issue-footer"><span>${esc(x.owner)} · Tenggat ${esc(date(x.due))}</span>${button("Perbarui tindak lanjut", "issue", x.id)}</div></article>`).join("") : empty("Belum ada catatan evaluasi", "Gunakan rekap program sebagai bahan pembahasan rapat bulanan.")}`;
  }
  function events() {
    const d = state.data,
      event = d.events.find((x) => x.id === state.eventId);
    if (event) {
      const tasks = d.tasks.filter((x) => x.event_id === event.id);
      $("#page").innerHTML =
        `${button("← Semua acara", "events-back")}<section class="event-banner"><span class="eyebrow">${esc(event.program_type)} / ${esc(event.scope === "Bersama" ? "Bersama · Santriwan & Santriwati" : event.scope + " · Riwayat")}</span><h2>${esc(event.name)}</h2><p>${esc(date(event.starts_at, true))} · ${esc(event.location || "Tempat belum diisi")}</p>${event.starts_at && new Date(event.starts_at) > new Date() ? `<div class="countdown" data-start="${esc(event.starts_at)}"></div>` : ""}${badge(event.status)}</section><div class="button-row">${button("Ubah acara", "event", event.id)}${button("Buka arsip acara", "event-archives", event.id)}${button("+ Arsip acara", "archive-event", event.id)}${button("+ Tugas persiapan", "task-event", event.id)}</div><section class="panel"><h3>Tentang acara</h3><p class="prewrap">${esc(event.description || "Deskripsi belum diisi.")}</p><p class="muted">Penanggung jawab: ${esc(event.owner)}</p></section><section class="panel"><h3>Persiapan & pembagian tugas</h3>${tasks.length ? tasks.map((t) => `<div class="task-row"><input aria-label="Tandai tugas ${esc(t.name)} selesai" type="checkbox" ${canUI("saveTask", t) ? "" : "disabled"} data-task="${esc(t.id)}" ${t.done ? "checked" : ""}><div><strong>${esc(t.name)}</strong><p>${esc(t.owner)} · ${esc(date(t.due))}</p></div>${button("Ubah", "task", t.id)}</div>`).join("") : '<p class="muted">Belum ada tugas yang dicatat.</p>'}</section><div id="event-dossier" aria-live="polite">${loadingPanel_("Memuat kelengkapan berkas…")}</div>`;
      loadDossier(event.id);
      return;
    }
    $("#page").innerHTML =
      `<div class="toolbar"><p>Satu acara bersama Santriwan dan Santriwati, dengan jadwal, kepanitiaan, tugas, dan arsip yang terhubung.</p><div class="toolbar-actions">${button("+ Acara OSDA", "event", "", "")}</div></div>${d.events.length ? `<div class="event-grid">${d.events.map((x) => `<article class="event-card"><span class="eyebrow">${esc(x.program_type)} · ${esc(x.scope === "Bersama" ? "Santriwan & Santriwati" : x.scope + " · Riwayat")}</span>${badge(x.status)}<h3>${esc(x.name)}</h3><p>${esc(date(x.starts_at, true))}<br>${esc(x.location || "Tempat belum diisi")}</p>${button(canUI("saveEvent", x) ? "Kelola acara →" : "Lihat acara →", "event-open", x.id)}</article>`).join("")}</div>` : empty("Belum ada acara pada periode ini", "Tambahkan Expose, Drakasa, Pensi, Nobadar, Muhadharah Akbar, atau program baru.")}`;
  }
  async function loadDossier(eventId) {
    if ($("#event-dossier"))
      $("#event-dossier").innerHTML = loadingPanel_(
        "Memuat kelengkapan berkas…",
      );
    const sequence = ++state.dossierRequest;
    state.dossier = null;
    try {
      const data = await api("eventDossier", eventId);
      if (
        sequence !== state.dossierRequest ||
        state.page !== "Acara OSDA" ||
        state.eventId !== eventId
      )
        return;
      state.dossier = data;
      $("#event-dossier").innerHTML =
        `<section class="panel dossier-panel"><div class="panel-head"><div><span class="eyebrow">KELENGKAPAN ARSIP ACARA</span><h3>${data.required ? data.complete + " dari " + data.required + " berkas lengkap" : data.requirements.length ? "Tidak ada berkas yang diwajibkan" : "Susun daftar berkas acara"}</h3><p>${data.archive_total} arsip aktif · ${data.not_required} berkas tidak diperlukan</p></div><div class="toolbar-actions">${button("+ Berkas", "requirement-new", eventId)}${button("Tambahkan daftar dasar", "requirements-seed", eventId)}</div></div><p class="muted">Hubungkan setiap kebutuhan dengan arsip acara yang sesuai. Nama berkas, kategori, penanggung jawab, dan tenggat dapat disesuaikan.</p>${
          data.requirements.length
            ? table(
                [
                  "Berkas yang dibutuhkan",
                  "Penanggung jawab",
                  "Arsip terkait",
                  "Status",
                  "Tindakan",
                ],
                data.requirements.map(
                  (r) =>
                    `<tr><td><strong>${esc(r.title)}</strong><small>${esc(r.category_name)}</small>${r.notes ? `<small class="prewrap">${esc(r.notes)}</small>` : ""}</td><td>${esc(r.owner)}<small>${esc(date(r.due))}</small></td><td>${r.archive ? archiveLink(r.archive, r.archive.title) + `<small>Versi ${r.archive.version}</small>` : r.link_invalid ? '<span class="text-warning">Arsip terhubung sudah tidak sesuai atau berada di sampah. Pilih ulang atau pulihkan arsip.</span>' : "—"}</td><td>${badge(r.status)}</td><td>${button("Ubah / hubungkan", "requirement", r.id)}</td></tr>`,
                ),
              )
            : '<p class="muted">Tambahkan berkas sendiri atau gunakan daftar dasar: proposal, rundown, tempat dan denah, dokumentasi, serta LPJ.</p>'
        }<p class="dossier-note">Status Lengkap mengikuti catatan arsip aktif yang terhubung. Isi berkas dan akses file tetap diperiksa oleh panitia. Arsip yang dipindahkan ke sampah membuat kebutuhan berkas kembali belum lengkap.</p></section>`;
    } catch (e) {
      if (
        sequence !== state.dossierRequest ||
        state.page !== "Acara OSDA" ||
        state.eventId !== eventId
      )
        return;
      $("#event-dossier").innerHTML =
        empty("Kelengkapan belum dapat dimuat", e.message) +
        button("Coba lagi", "dossier-refresh", eventId);
    }
  }
  async function loadRequirementChoices() {
    const editor = state.editor;
    if (!editor || editor.type !== "requirement") return;
    const form = $("#editor-form"),
      picker = form.elements.archive_id;
    const sequence = ++state.choiceRequest;
    const selectedId =
      picker.dataset.loaded === "true"
        ? picker.value
        : editor.record.archive_id || "";
    const categoryId = form.elements.category_id.value;
    editor.choiceLoading = true;
    editor.choiceError = false;
    picker.disabled = true;
    $("#archive-choice-status").innerHTML = loadingIndicator_(
      "Memuat arsip yang sesuai…",
      "xs",
    );
    try {
      const result = await api("eventArchiveChoices", {
        event_id: editor.record.event_id,
        category_id: categoryId,
        search: form.elements.archive_search.value,
        selected_id: selectedId,
      });
      if (state.editor !== editor || sequence !== state.choiceRequest) return;
      picker.innerHTML =
        '<option value="">Belum dihubungkan</option>' +
        result.items
          .map(
            (a) =>
              `<option value="${esc(a.id)}">${esc(a.title)} · v${a.version}</option>`,
          )
          .join("");
      picker.value = result.items.some((a) => a.id === selectedId)
        ? selectedId
        : "";
      picker.dataset.loaded = "true";
      picker.disabled = form.elements.not_required.checked;
      $("#archive-choice-status").textContent = result.truncated
        ? result.total +
          " arsip cocok. Daftar dibatasi 50 hasil pertama; cari judul yang lebih spesifik. Arsip terpilih tetap disertakan."
        : result.total +
          " arsip sesuai kategori ini. Tambahkan melalui + Arsip acara bila belum tersedia.";
    } catch (e) {
      if (state.editor !== editor || sequence !== state.choiceRequest) return;
      editor.choiceError = true;
      $("#archive-choice-status").textContent =
        "Pilihan arsip belum dimuat: " +
        e.message +
        " Klik Cari dokumen untuk mencoba lagi.";
    } finally {
      if (state.editor === editor && sequence === state.choiceRequest)
        editor.choiceLoading = false;
    }
  }
  async function archives() {
    const event = state.data.events.find((e) => e.id === state.archiveEventId);
    $("#page").innerHTML =
      `<div class="toolbar"><p>${event ? "Arsip acara: " + esc(event.name) : "Surat dan dokumen organisasi dalam satu daftar."}</p><div class="toolbar-actions">${event ? button("Semua arsip", "archives-all") : ""}${button(state.deleted ? "Lihat arsip aktif" : "Sampah aplikasi", "archive-trash-view")}${button("+ Kategori", "category")}${button("+ Arsip", "archive", "", "")}${archiveBulkLaunchButton_()}</div></div><div class="searchbar"><input id="archive-search" type="search" value="${esc(state.search)}" aria-label="Cari arsip" placeholder="Judul, nomor surat, kategori…"><select id="archive-category" aria-label="Kategori arsip"><option value="">Semua kategori</option>${state.data.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === state.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select><button class="button secondary" data-action="archive-search">Cari</button></div><div class="notice">${state.deleted ? "Sampah aplikasi menyembunyikan catatan dari daftar aktif; file Drive tetap dipertahankan sampai kebijakan penghapusan ditentukan." : "File disimpan privat di Drive. Batas unggah aplikasi 5 MB per file; tautan HTTPS juga dapat dicatat."}</div><div id="archive-results">${loadingPanel_("Memuat arsip…")}</div>`;
    await loadArchives();
  }
  async function loadArchives() {
    const sequence = (state.archiveRequest || 0) + 1;
    state.archiveRequest = sequence;
    if ($("#archive-results"))
      $("#archive-results").innerHTML = loadingPanel_("Memuat arsip…");
    try {
      const result = await api("listArchives", {
        ...state.query,
        event_id: state.archiveEventId,
        search: state.search,
        category_id: state.category,
        page: state.archivePage,
        deleted: state.deleted,
      });
      if (state.page !== "Arsip & Surat" || sequence !== state.archiveRequest)
        return;
      state.archives = result;
      state.archivePage = result.page;
      const categories = state.data.categories;
      $("#archive-results").innerHTML = result.items.length
        ? table(
            ["Dokumen", "Kategori", "Konteks", "File / tautan", "Tindakan"],
            result.items.map(
              (x) =>
                `<tr><td><strong>${esc(x.title)}</strong><small>${esc(x.letter_number)}</small><small>Versi ${x.version} · ${esc(x.scope)}</small><small>${esc(x.department || "Umum organisasi")}</small></td><td>${esc((categories.find((c) => c.id === x.category_id) || {}).name || "—")}</td><td>${esc((state.data.events.find((e) => e.id === x.event_id) || {}).name || "Arsip umum")}<small>${esc(date(x.document_date))}</small></td><td>${archiveLink(x)}<small>${x.size_bytes ? (Number(x.size_bytes) / 1024).toFixed(0) + " KB" : ""}</small></td><td><div class="actions">${state.deleted ? button("Pulihkan", "archive-restore", x.id) : button("Ubah / versi baru", "archive", x.id) + button("Riwayat versi", "archive-versions", x.id) + button("Sampah", "archive-trash", x.id, "danger small")}</div></td></tr>`,
            ),
          ) +
          `<div class="pagination"><span>${result.total} arsip · Halaman ${result.page}/${result.pages}</span><div>${result.page > 1 ? button("← Sebelumnya", "archive-prev") : ""}${result.page < result.pages ? button("Berikutnya →", "archive-next") : ""}</div></div>`
        : empty(
            state.deleted ? "Sampah masih kosong" : "Arsip belum ditemukan",
            "Ubah pencarian atau tambahkan dokumen yang diperlukan.",
          );
      applyDataLayout_();
    } catch (e) {
      if ($("#archive-results"))
        $("#archive-results").innerHTML = empty(
          "Arsip belum dapat dimuat",
          e.message,
        );
    }
  }
  async function settings() {
    $("#page").innerHTML = loadingPanel_("Memuat pengaturan…");
    try {
      const s = await api("systemInfo");
      if (state.page !== "Pengaturan") return;
      $("#page").innerHTML =
        `<section class="panel"><span class="eyebrow">AKSES INTERNAL / BEBERAPA PENGURUS</span><h2>Pengelolaan organisasi</h2><p>Operator: <strong>${esc(s.operator)}</strong></p><p class="muted">Setiap pengurus menggunakan username sendiri. Kelola peran, rayon, bidang, dan periode melalui Akun & Akses. Nama yang tercatat dalam struktur tidak otomatis menjadi akun.</p><div class="setting-links">${link(s.spreadsheet_url, "Buka database Supabase")}${link(s.archive_folder_url, "Buka folder arsip Drive")}</div><div class="notice">Ekspor JSON berisi data tabel, bukan isi file Drive. Cadangkan file Drive secara terpisah. Riwayat aktivitas ini merupakan catatan aplikasi; pemilik Sheet tetap dapat mengubah data secara langsung.</div><div class="button-row">${button("Kelola akun pengurus", "page", "Akun & Akses")}${button("Ekspor data JSON", "export")}${button("Tambah periode kepengurusan", "period-new")}${button("Ubah nama kabinet", "period-edit", state.query.term_id)}${revisionSettingsButton_()}</div></section><section class="panel"><h3>Kategori arsip</h3><div class="tabs">${state.data.categories.map((c) => `<button data-action="category" data-id="${esc(c.id)}">${esc(c.name)} ✎</button>`).join("")}</div><p style="margin-top:20px">${button("+ Kategori baru", "category")}</p></section><div class="panel-head"><h2>Aktivitas terakhir</h2></div>${table(
          ["Waktu", "Tindakan", "Data"],
          s.log.map(
            (x) =>
              `<tr><td>${esc(date(x.at, true))}</td><td>${esc(x.action)}</td><td>${esc(x.table_name)}</td></tr>`,
          ),
        )}`;
    } catch (e) {
      if (state.page === "Pengaturan")
        $("#page").innerHTML = empty(
          "Pengaturan belum dapat dimuat",
          e.message,
        );
    }
  }
  async function accounts() {
    $("#page").innerHTML = loadingPanel_("Memuat akun pengurus…");
    try {
      const data = await api("listAccounts");
      if (state.page !== "Akun & Akses") return;
      state.accountsData = data;
      const account = (id) => data.accounts.find((a) => a.id === id) || {};
      $("#page").innerHTML =
        `<div class="toolbar"><p>Akun login dan penugasan terpisah dari nama pada struktur organisasi.</p><div class="toolbar-actions">${button("+ Akun pengurus", "account")}${button("+ Penugasan akses", "grant")}</div></div>
          <div class="notice">Akun baru memakai kata sandi sementara dan wajib menggantinya saat pertama masuk. Jangan memakai satu akun bersama.</div>
          ${table(
            ["Pengguna", "Username", "Status", "Tindakan"],
            data.accounts.map(
              (a) =>
                `<tr><td><strong>${esc(a.name)}</strong></td><td>${esc(a.username)}</td><td>${badge(a.active ? "Aktif" : "Nonaktif")}<small>${a.must_change_password ? "Wajib ganti sandi sementara" : ""}</small></td><td><div class="actions">${button("Ubah akun", "account", a.id)}${button("Reset kata sandi", "resetpassword", a.id)}${!a.active ? manageButton_("Hapus akun", "account-delete", a.id, true) : ""}</div></td></tr>`,
            ),
          )}
          <div class="section-heading"><div><span class="eyebrow">PERAN · RAYON · BIDANG · PERIODE</span><h2>Penugasan akses</h2></div></div>
          <div class="account-grants">${data.grants.map((g) => `<article class="account-grant"><div><strong>${esc(account(g.account_id).name || "Akun tidak ditemukan")} · ${esc(g.role)}</strong><small>${g.term_id ? "Periode ke-" + esc(data.periods.find((p) => p.id === g.term_id)?.name || "—") : "Seluruh periode"} · ${esc(g.scope)}${g.department ? " · " + esc(g.department) : ""} · ${g.active ? "Aktif" : "Nonaktif"}${g.read_only ? " · Baca saja" : ""}</small></div>${button("Ubah penugasan", "grant", g.id)}</article>`).join("")}</div>`;
      applyDataLayout_();
    } catch (e) {
      if (state.page === "Akun & Akses")
        $("#page").innerHTML = empty("Akun belum dapat dimuat", e.message);
    }
  }
  function mentorNotes() {
    const notes = state.data.mentor_notes.filter(
      (n) => n.month === state.query.month,
    );
    $("#page").innerHTML =
      `<div class="toolbar"><p>Arahan mentor dan pendamping untuk program pada bulan terpilih.</p><div class="toolbar-actions">${button("Cetak catatan", "print")}${button("+ Catatan pembinaan", "mentor-note")}</div></div>${notes.length ? notes.map((n) => `<article class="mentor-note"><h3>${esc(state.data.programs.find((p) => p.id === n.program_id)?.name || "Program kerja")}</h3><p class="prewrap">${esc(n.note)}</p><small>${esc(n.author_name)} · ${esc(n.department)} · ${esc(n.scope)} · ${esc(date(n.created_at, true))}</small></article>`).join("") : empty("Belum ada catatan pembinaan", "Mentor atau pendamping dapat menambahkan arahan untuk program dalam penugasannya.")}`;
  }
  function field(label, name, value = "", type = "text", options = {}) {
    let input;
    if (type === "select")
      input = `<select name="${name}" ${options.required === false ? "" : "required"}>${options.options
        .map((o) => {
          const v = typeof o === "string" ? o : o.value,
            l = typeof o === "string" ? o : o.label;
          return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`;
        })
        .join("")}</select>`;
    else if (type === "textarea")
      input = `<textarea name="${name}" maxlength="${options.max || 10000}" ${options.required === false ? "" : "required"} rows="${options.rows || 3}">${esc(value)}</textarea>`;
    else
      input = `<input name="${name}" type="${type}" value="${esc(value)}" ${options.required === false ? "" : "required"} ${type === "number" ? 'min="0" max="1000000" step="any"' : ""} ${type === "file" ? 'accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"' : ""} ${["text", "url", "password"].includes(type) ? 'maxlength="' + (options.max || 2000) + '"' : ""}>`;
    return `<label class="field">${esc(label)}${input}${options.help ? `<small>${esc(options.help)}</small>` : ""}</label>`;
  }
  const select = (label, name, value, options, extra = {}) =>
    field(label, name, value, "select", { options, ...extra });
  function edit(type, id, defaults = {}) {
    state.featureRequest = (state.featureRequest || 0) + 1;
    const d = state.data,
      lookup = {
        member: d.members,
        dayah: d.dayah_leaders,
        program: d.programs,
        report: d.programs,
        meeting: d.meetings,
        issue: d.issues,
        event: d.events,
        task: d.tasks,
        archive: state.archives ? state.archives.items : [],
        category: d.categories,
        period: d.periods,
        requirement: state.dossier ? state.dossier.requirements : [],
        account: state.accountsData?.accounts || [],
        resetpassword: state.accountsData?.accounts || [],
        grant: state.accountsData?.grants || [],
        "mentor-note": d.programs,
      };
    let r = (lookup[type] || []).find((x) => x.id === id) || {};
    if (type === "report") {
      const p = r;
      r = {
        ...(p.report || {}),
        program_id: p.id,
        month: state.query.month,
      };
    }
    r = { ...r, ...defaults };
    let fields = "",
      title = "";
    const permission =
      {
        member: "saveMember",
        program: "saveProgram",
        archive: "saveArchive",
        meeting: "saveMeeting",
        issue: "saveIssue",
        event: "saveEvent",
      }[type] || "saveProgram";
    const editableScopes =
      type === "archive" ? archiveScopes_() : scopesFor(permission);
    const editableDepartments = departmentsFor(permission);
    const scope =
      r.scope ||
      (editableScopes.includes(state.query.scope)
        ? state.query.scope
        : editableScopes[0]) ||
      "Santriwan";
    const deptOptions = ["Formatur", ...d.departments];
    const pair = (a, b) => `<div class="field-pair">${a}${b}</div>`;
    const scopeField = () =>
      select("Kepengurusan", "scope", scope, editableScopes);
    const note = (label, name, help) =>
      field(label, name, r[name] || "", "textarea", { required: false, help });
    if (type === "member") {
      title = "Data pengurus · Periode ke-" + currentPeriod().name;
      fields =
        field("Nama lengkap", "name", r.name) +
        pair(
          select(
            "Kepengurusan",
            "scope",
            r.scope || (scope === "Bersama" ? "Santriwan" : scope),
            r.role === "Pembina OSDA"
              ? editableScopes
              : editableScopes.filter((x) => x !== "Bersama"),
            {
              help: "Pengurus dan mentor bidang mengikuti rayon masing-masing.",
            },
          ),
          select(
            "Jabatan",
            "role",
            r.role || "Ketua Bidang",
            r.role === "Pembina OSDA"
              ? [...roleOptions, "Pembina OSDA"]
              : roleOptions,
          ),
        ) +
        select("Bagian", "department", r.department || d.departments[0], [
          "Formatur",
          ...(r.role === "Pembina OSDA" ? ["Pembina OSDA"] : []),
          ...d.departments,
        ]) +
        `<div data-member-origin ${["Mentor Bidang", "Pembina OSDA"].includes(r.role) ? "hidden" : ""}>` +
        field("Asal daerah (opsional)", "origin", r.origin || "", "text", {
          required: false,
          max: 160,
          help: "Kabupaten/kota asal pengurus santri. Tampil di bawah nama dan jabatan.",
        }) +
        "</div>" +
        note("Catatan (opsional)", "notes");
    }
    if (type === "dayah") {
      title = "Identitas pejabat dayah · Periode ke-" + currentPeriod().name;
      fields =
        field("Nama lengkap pejabat dayah", "name", r.name) +
        select(
          "Jabatan dayah",
          "role",
          r.role || d.leadership_roles[0],
          d.leadership_roles,
        ) +
        note("Catatan (opsional)", "notes") +
        '<p class="required-note">Identitas disimpan pada periode terpilih: Penasihat (2 jabatan sejajar), Pembina Utama (4 jabatan sejajar), dan Pendamping Teknis/Pengarah (2 rayon). Asal daerah khusus pengurus santri.</p>';
    }
    if (type === "program") {
      title = "Program kerja bidang";
      fields =
        field("Nama program", "name", r.name) +
        pair(
          scopeField(),
          select(
            "Bidang penanggung jawab",
            "department",
            r.department || editableDepartments[0],
            editableDepartments,
          ),
        ) +
        '<div class="notice">Pelaksanaan menjadi tanggung jawab bidang. Laporan menilai hasil dan kualitas pelaksanaan.</div>' +
        select("Jenis program", "frequency", r.frequency || "Mingguan", [
          "Harian",
          "Mingguan",
          "Bulanan",
          "Tahunan",
        ]) +
        field(
          "Bulan pelaksanaan untuk program tahunan",
          "scheduled_month",
          r.scheduled_month || "",
          "month",
          {
            required: false,
            help: "Bulan rencana pelaksanaan, bukan tenggat laporan.",
          },
        ) +
        field(
          "Jadwal / pola pelaksanaan (opsional)",
          "schedule",
          r.schedule || "",
          "text",
          { required: false, help: "Contoh: setiap malam minggu." },
        ) +
        select(
          "Bagian formatur (khusus Formatur)",
          "formatur_role",
          r.formatur_role || "",
          [
            { value: "", label: "Tidak dipisah menurut jabatan" },
            "Ketua OSDA",
            "Wakil Ketua",
            "Sekretaris",
            "Bendahara",
          ],
          { required: false },
        ) +
        note("Turunan aturan (opsional)", "rules") +
        note("Turunan apresiasi (opsional)", "appreciation") +
        note("Tujuan program", "objective") +
        `<label class="check-field"><input name="active" type="checkbox" ${r.active === false ? "" : "checked"}> Program aktif</label>`;
    }
    if (type === "report") {
      title = "Laporan pelaksanaan · " + monthName(state.query.month);
      const p = d.programs.find((x) => x.id === r.program_id);
      fields =
        `<div class="notice"><strong>${esc(p.name)}</strong><br>Penanggung jawab: Bidang ${esc(p.department)} · ${esc(p.scope)}</div>` +
        select(
          "Hasil pelaksanaan",
          "implementation_status",
          r.implementation_status || "",
          [
            { value: "", label: "Pilih hasil pelaksanaan" },
            ...implementationOptions_().map((s) => ({ value: s, label: s })),
          ],
        ) +
        field(
          "Catatan kualitas / hasil pelaksanaan",
          "implementation_notes",
          r.implementation_notes || "",
          "textarea",
          { required: false, max: 3000 },
        ) +
        note("Kendala / alasan belum berjalan", "obstacles") +
        note("Perbaikan / langkah berikutnya", "next_action") +
        field(
          "Tautan bukti (opsional)",
          "evidence_url",
          r.evidence_url || "",
          "url",
          { required: false },
        );
    }
    if (type === "meeting") {
      title = "Rapat evaluasi bulanan";
      fields =
        field("Nama rapat", "name", r.name || "Evaluasi Bulanan OSDA RQ") +
        scopeField() +
        pair(
          field(
            "Bulan yang dievaluasi",
            "month",
            r.month || state.query.month,
            "month",
            {
              help: "Contoh: evaluasi Oktober dapat dilaksanakan pada awal November.",
            },
          ),
          field(
            "Tanggal rapat",
            "date",
            r.date || state.query.month + "-01",
            "date",
          ),
        ) +
        field(
          "Peserta rapat",
          "participants",
          r.participants ||
            "Seluruh anggota OSDA, formatur, dan seluruh bidang",
        ) +
        note("Notulen, arahan mentor, dan pembahasan", "notes");
    }
    if (type === "issue") {
      title = "Evaluasi & tindak lanjut";
      const linkedProgram = d.programs.find((p) => p.id === r.program_id);
      const meetings = d.meetings.filter(
        (m) =>
          m.month === (r.month || state.query.month) &&
          (!linkedProgram ||
            m.scope === "Bersama" ||
            linkedProgram.scope === "Bersama" ||
            m.scope === linkedProgram.scope),
      );
      if (!meetings.length) {
        toast(
          "Catat rapat bulanan dengan kepengurusan yang sesuai terlebih dahulu. Setelah tersimpan, klik Bahas kembali.",
        );
        edit("meeting", "", {
          scope: state.query.scope === "Semua" ? "Bersama" : state.query.scope,
        });
        return;
      }
      const meeting =
        d.meetings.find((m) => m.id === r.meeting_id) || meetings[0];
      r.meeting_id = meeting.id;
      r.scope = meeting.scope;
      r.term_id = meeting.term_id;
      fields =
        select(
          "Rapat terkait",
          "meeting_id",
          meeting.id,
          meetings.map((m) => ({
            value: m.id,
            label: m.name + " · " + m.scope + " · " + date(m.date),
          })),
        ) +
        select(
          "Program terkait (opsional)",
          "program_id",
          r.program_id || "",
          [
            { value: "", label: "Masalah umum / lintas bidang" },
            ...d.programs.map((p) => ({
              value: p.id,
              label: p.name + " · " + p.scope,
            })),
          ],
          { required: false },
        ) +
        pair(
          select(
            "Bidang penyampai",
            "from_department",
            r.from_department || "Formatur",
            deptOptions,
          ),
          select(
            "Bidang terkait",
            "to_department",
            r.to_department || d.departments[0],
            deptOptions,
          ),
        ) +
        field(
          "Permasalahan yang dibahas",
          "problem",
          r.problem || "",
          "textarea",
        ) +
        note("Tanggapan bidang terkait", "response") +
        note("Keputusan bersama", "decision") +
        pair(
          field("Penanggung jawab tindak lanjut", "owner", r.owner),
          field("Tenggat (opsional)", "due", r.due || "", "date", {
            required: false,
          }),
        ) +
        select("Status tindak lanjut", "status", r.status || "Terbuka", [
          "Terbuka",
          "Diproses",
          "Menunggu pemeriksaan",
          "Selesai",
        ]) +
        note("Hasil tindak lanjut (wajib ketika selesai)", "resolution");
    }
    if (type === "event") {
      r.scope = r.id ? r.scope : "Bersama";
      title = r.id ? "Ubah acara OSDA" : "Acara bersama OSDA";
      fields =
        field("Nama pelaksanaan acara", "name", r.name) +
        pair(
          `<label class="field">Kepengurusan acara<input name="scope" value="${esc(r.scope)}" readonly aria-describedby="event-scope-help"><small id="event-scope-help">${r.scope === "Bersama" ? "Santriwan dan Santriwati dalam satu acara dan satu kepanitiaan." : "Riwayat acara lama. Lingkup aslinya tetap dipertahankan."}</small></label>`,
          field(
            "Nama program OSDA",
            "program_type",
            r.program_type || "",
            "text",
            {
              help: "Bisa Expose, Drakasa, Pensi, Nobadar, Muhadharah Akbar, atau program baru.",
            },
          ),
        ) +
        pair(
          field(
            "Mulai — WIB (opsional)",
            "starts_local",
            localDateTime(r.starts_at),
            "datetime-local",
            { required: false },
          ),
          field(
            "Selesai — WIB (opsional)",
            "ends_local",
            localDateTime(r.ends_at),
            "datetime-local",
            { required: false },
          ),
        ) +
        field("Tempat (opsional)", "location", r.location || "", "text", {
          required: false,
        }) +
        field("Penanggung jawab / ketua panitia", "owner", r.owner) +
        select("Status acara", "status", r.status || "Persiapan", [
          "Persiapan",
          "Berlangsung",
          "Selesai",
          "Ditunda",
          "Dibatalkan",
        ]) +
        note("Deskripsi / susunan panitia / catatan", "description");
    }
    if (type === "task") {
      title = "Tugas persiapan acara";
      fields =
        field("Tugas", "name", r.name) +
        field("Pelaksana", "owner", r.owner) +
        field("Tenggat (opsional)", "due", r.due || "", "date", {
          required: false,
        }) +
        `<label class="check-field"><input type="checkbox" name="done" ${r.done ? "checked" : ""}> Sudah selesai</label>`;
    }
    if (type === "requirement") {
      title = "Kebutuhan berkas acara";
      const event = d.events.find((e) => e.id === r.event_id);
      if (!event) {
        toast("Pilih acara terlebih dahulu.");
        return;
      }
      r.term_id = event.term_id;
      r.scope = event.scope;
      fields =
        `<div class="notice"><strong>${esc(event.name)}</strong><br>${esc(event.scope)} · OSDA ke-${esc(currentPeriod().name)}</div>` +
        field("Nama berkas yang dibutuhkan", "title", r.title) +
        select(
          "Kategori berkas",
          "category_id",
          r.category_id || d.categories[0]?.id,
          d.categories.map((c) => ({ value: c.id, label: c.name })),
        ) +
        pair(
          field("Penanggung jawab berkas", "owner", r.owner || event.owner),
          field("Tenggat berkas (opsional)", "due", r.due || "", "date", {
            required: false,
          }),
        ) +
        `<div class="archive-picker"><h3>Hubungkan ke arsip</h3>` +
        field("Cari judul / nomor dokumen", "archive_search", "", "search", {
          required: false,
        }) +
        button("Cari dokumen", "requirement-search") +
        select(
          "Arsip acara yang sesuai",
          "archive_id",
          "",
          [{ value: "", label: "Memuat pilihan…" }],
          { required: false },
        ) +
        '<p class="muted" id="archive-choice-status" role="status"></p></div>' +
        `<label class="check-field"><input name="not_required" type="checkbox" ${r.not_required ? "checked" : ""}> Berkas ini tidak diperlukan pada acara ini</label>` +
        note(
          "Catatan / alasan tidak diperlukan",
          "notes",
          "Alasan wajib diisi jika berkas tidak diperlukan.",
        );
    }
    if (type === "category") {
      title = "Kategori arsip";
      fields = field("Nama kategori", "name", r.name);
    }
    if (type === "period") {
      title = "Periode kepengurusan";
      fields =
        field("Nomor / nama periode", "name", r.name) +
        field("Tahun kepengurusan (opsional)", "years", r.years || "", "text", {
          required: false,
          help: "Isi menurut data resmi organisasi.",
        }) +
        `<label class="check-field"><input type="checkbox" name="active" ${r.active ? "checked" : ""}> Jadikan periode aktif</label><p class="required-note">Menambah periode membuat konteks baru. Nama dan laporan periode sebelumnya tetap disimpan.</p>`;
    }
    if (type === "archive") {
      title = r.id ? "Ubah arsip / tambah versi" : "Tambahkan arsip";
      const event = d.events.find(
        (x) => x.id === (r.event_id || state.archiveEventId),
      );
      if (event) {
        r.scope = event.scope;
        r.event_id = event.id;
      }
      const options = [
        { value: "", label: "Arsip umum" },
        ...d.events.map((x) => ({
          value: x.id,
          label: x.name + " · " + x.scope,
        })),
      ];
      fields =
        field("Judul dokumen", "title", r.title) +
        pair(
          select("Kepengurusan", "scope", r.scope || scope, editableScopes),
          select(
            "Kategori",
            "category_id",
            r.category_id || d.categories[0]?.id,
            d.categories.map((c) => ({ value: c.id, label: c.name })),
          ),
        ) +
        select(
          "Acara terkait (opsional)",
          "event_id",
          r.event_id || "",
          options,
          { required: false },
        ) +
        pair(
          field(
            "Nomor surat (opsional)",
            "letter_number",
            r.letter_number || "",
            "text",
            { required: false },
          ),
          field(
            "Tanggal dokumen (opsional)",
            "document_date",
            r.document_date || "",
            "date",
            { required: false },
          ),
        ) +
        select(
          "Bidang pemilik arsip",
          "department",
          r.department ||
            (state.data.access.is_admin ? "" : editableDepartments[0] || ""),
          state.data.access.is_admin ||
            state.data.access.grants.some(
              (g) =>
                g.term_id === state.query.term_id &&
                !g.read_only &&
                !g.department &&
                g.actions.includes("saveArchive"),
            )
            ? [{ value: "", label: "Umum organisasi" }, ...editableDepartments]
            : editableDepartments,
          { required: false },
        ) +
        select("Sumber dokumen", "source_type", r.source_type || "file", [
          "file",
          "link",
        ]) +
        field(
          "File — maksimal 5 MB (opsional jika file lama dipertahankan)",
          "upload",
          "",
          "file",
          {
            required: false,
            help: r.file_name
              ? "File sekarang: " + r.file_name
              : "Pilih PDF, gambar JPG/PNG, dokumen Office, atau TXT.",
          },
        ) +
        field("Tautan HTTPS — untuk sumber link", "url", r.url || "", "url", {
          required: false,
        }) +
        note("Keterangan", "description");
    }
    if (type === "account") {
      title = r.id ? "Ubah akun pengurus" : "Buat akun pengurus";
      fields =
        field("Nama pengguna", "name", r.name) +
        field("Username", "username", r.username, "text", { max: 40 }) +
        `<label class="check-field"><input type="checkbox" name="active" ${r.active === false ? "" : "checked"}> Akun aktif</label>`;
      if (!r.id)
        fields +=
          field(
            "Kata sandi sementara (6–128 karakter)",
            "password",
            "",
            "password",
          ) +
          select(
            "Peran awal",
            "grant_role",
            "Ketua Bidang",
            state.accountsData.roles,
          ) +
          select(
            "Periode penugasan",
            "grant_term_id",
            state.query.term_id,
            state.data.periods.map((p) => ({
              value: p.id,
              label: "Periode ke-" + p.name,
            })),
          ) +
          select("Rayon / lingkup akses", "grant_scope", "Santriwan", [
            "Santriwan",
            "Santriwati",
            "Bersama",
            "Semua",
          ]) +
          select(
            "Bidang (untuk ketua atau mentor bidang)",
            "grant_department",
            d.departments[0],
            [
              { value: "", label: "Seluruh bidang sesuai peran" },
              ...d.departments,
            ],
          ) +
          '<p class="required-note">Sampaikan kata sandi sementara langsung kepada pemilik akun. Pengguna wajib menggantinya saat pertama masuk.</p>';
    }
    if (type === "grant") {
      title = "Penugasan akses pengurus";
      fields =
        select(
          "Akun",
          "account_id",
          r.account_id || state.accountsData.accounts[0]?.id,
          state.accountsData.accounts.map((a) => ({
            value: a.id,
            label: a.name + " · " + a.username,
          })),
        ) +
        select(
          "Peran",
          "role",
          r.role || "Ketua Bidang",
          state.accountsData.roles,
        ) +
        select(
          "Periode",
          "term_id",
          r.term_id || state.query.term_id,
          state.data.periods.map((p) => ({
            value: p.id,
            label: "Periode ke-" + p.name,
          })),
        ) +
        select("Rayon / lingkup", "scope", r.scope || "Santriwan", [
          "Santriwan",
          "Santriwati",
          "Bersama",
          "Semua",
        ]) +
        select("Bidang", "department", r.department || "", [
          { value: "", label: "Seluruh bidang sesuai peran" },
          ...d.departments,
        ]) +
        `<label class="check-field"><input type="checkbox" name="active" ${r.active === false ? "" : "checked"}> Penugasan aktif</label>` +
        `<label class="check-field"><input type="checkbox" name="read_only" ${r.read_only ? "checked" : ""}> Baca saja (misalnya riwayat periode)</label>` +
        '<p class="required-note">Mentor OSDA memiliki akses admin untuk seluruh periode. Untuk jabatan lain, periode dan lingkup wajib sesuai tugas. Nonaktifkan penugasan lama saat serah terima.</p>';
    }
    if (type === "resetpassword") {
      title = "Reset kata sandi · " + r.username;
      fields =
        field(
          "Kata sandi sementara baru (6–128 karakter)",
          "password",
          "",
          "password",
        ) +
        '<p class="required-note">Semua sesi akun ini akan berakhir. Pemilik akun wajib mengganti kata sandi sementara saat masuk lagi.</p>';
    }
    if (type === "mentor-note") {
      title = "Catatan pembinaan program";
      fields =
        select(
          "Program yang dibina",
          "program_id",
          r.id || d.programs[0]?.id,
          d.programs
            .filter((p) => canUI("saveMentorNote", p))
            .map((p) => ({
              value: p.id,
              label: p.name + " · " + p.department,
            })),
        ) +
        field("Bulan pembinaan", "month", state.query.month, "month") +
        field("Arahan / catatan pembinaan", "note", "", "textarea", {
          max: 3000,
        });
    }
    if (
      ["evaluation-stage", "evaluation-final", "evaluation-reopen"].includes(
        type,
      )
    ) {
      const matching = d.meetings.filter(
        (m) => m.scope === r.scope && m.month === state.query.month,
      );
      title =
        type === "evaluation-reopen"
          ? "Buka koreksi laporan final"
          : type === "evaluation-final"
            ? "Finalkan laporan evaluasi"
            : "Tahap evaluasi · " + r.status;
      if (type === "evaluation-reopen")
        fields =
          field(
            "Alasan koreksi (wajib, minimal 10 karakter)",
            "reason",
            "",
            "textarea",
            { max: 1500 },
          ) +
          '<p class="required-note">Versi final sebelumnya tetap tersimpan. Setelah perbaikan, ulangi tahapan dan buat versi final berikutnya.</p>';
      else
        fields =
          select(
            "Rapat bulan ini · " + r.scope,
            "meeting_id",
            r.meeting_id || "",
            [
              { value: "", label: "Pilih rapat evaluasi" },
              ...matching.map((m) => ({
                value: m.id,
                label: m.name + " · " + date(m.date),
              })),
            ],
            { required: type === "evaluation-final" || r.status === "Dibahas" },
          ) +
          field(
            "Catatan hasil pembahasan / pengecualian",
            "notes",
            r.notes || "",
            "textarea",
            { required: false, max: 2000 },
          ) +
          `<p class="required-note">${type === "evaluation-final" ? "Notulen harus sudah terisi. Jika ada rekap atau jadwal yang belum lengkap, jelaskan hasil pembahasannya. Setelah Final, rekap dan keputusan tidak dapat diubah tanpa membuka koreksi." : "Tahapan ini dicatat atas nama akun yang sedang masuk. Sekretaris menyiapkan pembahasan; Ketua OSDA atau Mentor OSDA memfinalkan laporan."}</p>`;
    }
    state.editor = {
      type,
      record: r,
      id: r.id || clientId(),
      revision: Number(r.revision || 0),
    };
    $("#dialog-title").textContent = title;
    $("#form-fields").innerHTML = fields;
    if (type === "period")
      $("#form-fields").insertAdjacentHTML(
        "beforeend",
        field(
          "Nama kabinet bersama putra–putri",
          "cabinet_name",
          r.cabinet_name || "",
          "text",
          {
            max: 100,
            help: "Satu nama kabinet untuk seluruh kepengurusan pada periode ini.",
          },
        ),
      );
    if (["task", "issue", "requirement"].includes(type)) {
      $("#form-fields").insertAdjacentHTML(
        "beforeend",
        assignmentField_(r, scope, type),
      );
      refreshAssignmentChoices_();
    }
    if (type === "issue" && r.id && isScopeFinal(r.scope, r.month)) {
      [
        "meeting_id",
        "program_id",
        "from_department",
        "to_department",
        "problem",
        "response",
        "decision",
        "owner",
        "owner_account_id",
        "due",
        "scope",
      ].forEach((name) => {
        const el = $("#editor-form").elements[name];
        if (el) el.disabled = true;
      });
      $("#form-fields").insertAdjacentHTML(
        "afterbegin",
        '<p class="required-note">Keputusan rapat Final terkunci. Anda dapat memperbarui status dan hasil tindak lanjut.</p>',
      );
    }
    $("#form-error").textContent = "";
    $("#save-button").hidden = false;
    $("#save-button").textContent = "Simpan";
    $("#editor").showModal();
    if (type === "requirement") loadRequirementChoices();
  }
  function closeModal() {
    if (state.saving) return;
    $("#editor").close();
    $("#form-fields").replaceChildren();
    state.editor = null;
  }
  async function filePayload(file) {
    if (!file || !file.size) return {};
    if (file.size > 5 * 1024 * 1024) throw Error("Ukuran file maksimal 5 MB.");
    const mimes = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      txt: "text/plain",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    const encoded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(Error("File tidak dapat dibaca."));
      reader.readAsDataURL(file);
    });
    return {
      file_base64: encoded,
      file_name: file.name,
      mime_type:
        file.type || mimes[file.name.split(".").pop().toLowerCase()] || "",
    };
  }
  $("#editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.saving || !state.editor || state.editor.type === "meeting-read")
      return;
    const ed = state.editor,
      form = event.target,
      values = Object.fromEntries(new FormData(form)),
      payload = {
        ...ed.record,
        ...values,
        id: ed.id,
        revision: ed.revision,
        term_id: ed.record.term_id || state.query.term_id,
      };
    delete payload.result;
    delete payload.report;
    delete payload.upload;
    const names = {
      handover: "saveHandover",
      "handover-accept": "acceptHandover",
      "my-followup": "updateMyFollowup",
      "carried-task": "updateCarriedTask",
      "site-identity": "saveSiteIdentity",
      "backup-restore": "restoreBackup",
      "evaluation-stage": "setEvaluationStage",
      "evaluation-final": "finalizeEvaluation",
      "evaluation-reopen": "reopenEvaluation",
      member: "saveMember",
      dayah: "saveDayahLeader",
      program: "saveProgram",
      report: "saveReport",
      meeting: "saveMeeting",
      issue: "saveIssue",
      event: "saveEvent",
      task: "saveTask",
      archive: "saveArchive",
      category: "saveCategory",
      period: "savePeriod",
      requirement: "saveEventRequirement",
      account: "saveAccount",
      grant: "saveGrant",
      resetpassword: "resetAccountPassword",
      "mentor-note": "saveMentorNote",
    };
    state.saving = true;
    const finish = beginButtonLoading_(
      $("#save-button"),
      ed.type === "archive" ? "Mengunggah & menyimpan…" : "Menyimpan…",
    );
    $("#form-error").textContent = "";
    try {
      if (ed.type === "requirement") {
        payload.not_required = form.elements.not_required.checked;
        if (!payload.not_required && (ed.choiceLoading || ed.choiceError))
          throw Error(
            "Tunggu pilihan arsip dimuat atau klik Cari dokumen untuk mencoba lagi.",
          );
        payload.archive_id = payload.not_required
          ? ""
          : form.elements.archive_id.value;
      }
      if (form.elements.active) payload.active = form.elements.active.checked;
      if (form.elements.read_only)
        payload.read_only = form.elements.read_only.checked;
      if (form.elements.done) payload.done = form.elements.done.checked;
      if (ed.type === "report") {
        payload.program_id = ed.record.program_id;
        payload.month = ed.record.month;
      }
      if (ed.type === "meeting") payload.month = values.month;
      if (ed.type === "issue") {
        const meeting = state.data.meetings.find(
          (m) => m.id === payload.meeting_id,
        );
        payload.scope = meeting.scope;
        payload.term_id = meeting.term_id;
      }
      if (ed.type === "archive")
        Object.assign(
          payload,
          await filePayload(form.elements.upload.files[0]),
        );
      const result = await api(names[ed.type], payload);
      if (ed.type === "backup-restore") {
        state.saving = false;
        closeModal();
        showLogin(
          "Database dipulihkan. Silakan masuk kembali; database sebelumnya tetap tersedia bagi pengelola.",
        );
        return;
      }
      if (ed.type === "period") state.query.term_id = result.id;
      if (ed.type === "meeting") state.query.month = payload.month;
      state.saving = false;
      closeModal();
      toast("Data tersimpan.");
      await load();
    } catch (e) {
      $("#form-error").textContent = e.message;
    } finally {
      state.saving = false;
      finish();
    }
  });
  $("#editor-form").addEventListener("change", (e) => {
    const form = e.currentTarget;
    if (state.editor?.type === "archive" && e.target.name === "event_id") {
      const event = state.data.events.find((x) => x.id === e.target.value);
      if (event) form.elements.scope.value = event.scope;
    }
    if (state.editor?.type === "requirement") {
      if (e.target.name === "category_id") loadRequirementChoices();
      if (e.target.name === "not_required")
        form.elements.archive_id.disabled =
          e.target.checked ||
          state.editor.choiceLoading ||
          state.editor.choiceError;
    }
    if (e.target.name === "role" && state.editor?.type === "member") {
      form.querySelector("[data-member-origin]").hidden = [
        "Mentor Bidang",
        "Pembina OSDA",
      ].includes(e.target.value);
      if (
        ["Ketua OSDA RQ", "Wakil Ketua", "Sekretaris", "Bendahara"].includes(
          e.target.value,
        )
      )
        form.elements.department.value = "Formatur";
      if (e.target.value === "Pembina OSDA")
        form.elements.department.value = "Pembina OSDA";
      if (
        [
          "Ketua Bidang",
          "Wakil Ketua Bidang",
          "Mentor Bidang",
          "Anggota",
        ].includes(e.target.value) &&
        !state.data.departments.includes(form.elements.department.value)
      )
        form.elements.department.value = state.data.departments[0];
    }
    if (e.target.name === "event_id" && state.editor?.type === "archive") {
      const event = state.data.events.find((x) => x.id === e.target.value);
      if (event) form.elements.scope.value = event.scope;
    }
  });
  $("#editor").addEventListener("cancel", (e) => {
    if (state.saving) e.preventDefault();
    else state.editor = null;
  });
  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-action]");
    if (!el || state.saving || loadingUI.buttons.has(el)) return;
    const action = el.dataset.action,
      id = el.dataset.id;
    const finish = [
      "evaluation-open",
      "refresh",
      "scope",
      "period",
      "requirement-search",
      "dossier-refresh",
      "requirements-seed",
      "archive-search",
      "archive-prev",
      "archive-next",
      "archive-trash",
      "archive-restore",
      "archive-download",
      "archive-versions",
      "export",
    ].includes(action)
      ? beginButtonLoading_(
          el,
          /download|export/.test(action) ? "Menyiapkan…" : "Memproses…",
        )
      : () => {};
    try {
      if (action === "evaluation-open") {
        state.query.scope = id;
        state.finalReport = null;
        await load();
      } else if (
        [
          "evaluation-ready",
          "evaluation-discussed",
          "evaluation-final",
          "evaluation-reopen",
        ].includes(action)
      ) {
        const row = evaluationStageFor(id),
          defaults = {
            ...row,
            term_id: state.query.term_id,
            scope: id,
            month: state.query.month,
          };
        if (action === "evaluation-ready") defaults.status = "Siap Evaluasi";
        if (action === "evaluation-discussed") defaults.status = "Dibahas";
        edit(
          action === "evaluation-final"
            ? "evaluation-final"
            : action === "evaluation-reopen"
              ? "evaluation-reopen"
              : "evaluation-stage",
          "",
          defaults,
        );
      } else if (action === "evaluation-version") {
        state.requestedFinalVersion = Number(id);
        state.page = "Laporan Bulanan";
        render();
      } else if (action === "evaluation-live") {
        state.finalRequest = (state.finalRequest || 0) + 1;
        state.finalReport = null;
        renderMonthlyReport();
      } else if (
        ["account", "grant", "resetpassword", "mentor-note"].includes(action)
      )
        edit(action, id);
      else if (action === "archive-download") {
        el.disabled = true;
        try {
          const file = await api("downloadArchive", {
            id,
            version: el.dataset.version || "",
          });
          const bytes = Uint8Array.from(atob(file.base64), (c) =>
            c.charCodeAt(0),
          );
          const url = URL.createObjectURL(
            new Blob([bytes], { type: "application/octet-stream" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name.replace(/[\\/]/g, "_");
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } finally {
          el.disabled = false;
        }
      } else if (action === "page") activate(id);
      else if (action === "refresh") await load();
      else if (action === "period-edit") edit("period", id);
      else if (action === "structure-department") {
        state.structureDepartment = id;
        roster();
      } else if (action === "org-person") {
        edit(
          el.dataset.kind,
          id,
          id
            ? {}
            : {
                role: el.dataset.role,
                scope: el.dataset.scope,
                department: el.dataset.department,
              },
        );
      } else if (action === "dayah-new") edit("dayah");
      else if (action === "print") window.print();
      else if (action === "period") {
        state.query.term_id = id;
        state.eventId = "";
        state.archiveEventId = "";
        await load();
      } else if (action === "scope") {
        state.query.scope = id;
        await load();
      } else if (action === "period-new") edit("period");
      else if (action === "requirement-new")
        edit("requirement", "", { event_id: id });
      else if (action === "requirement-search") await loadRequirementChoices();
      else if (action === "dossier-refresh") await loadDossier(id);
      else if (action === "requirements-seed") {
        state.saving = true;
        el.disabled = true;
        try {
          const result = await api("seedEventRequirements", id);
          toast(
            result.record.added +
              " kebutuhan berkas ditambahkan." +
              (result.record.skipped.length
                ? " Kategori belum tersedia: " +
                  result.record.skipped.join(", ") +
                  ". Tambahkan berkas secara manual."
                : " Daftar yang sudah ada tetap dipertahankan."),
          );
          await loadDossier(id);
        } finally {
          state.saving = false;
          el.disabled = false;
        }
      } else if (action === "close-modal") closeModal();
      else if (
        [
          "member",
          "program",
          "report",
          "meeting",
          "issue",
          "event",
          "task",
          "archive",
          "category",
          "requirement",
        ].includes(action)
      )
        edit(action, id);
      else if (action === "issue-program") {
        const p = state.data.programs.find((x) => x.id === id);
        edit("issue", "", {
          program_id: p.id,
          from_department: p.department,
          to_department: p.department,
          problem: p.name + " — " + p.result.status,
          owner: p.owner,
        });
      } else if (action === "event-open") {
        state.page = "Acara OSDA";
        state.eventId = id;
        render();
        window.scrollTo(0, 0);
      } else if (action === "events-back") {
        state.eventId = "";
        events();
      } else if (action === "task-event") edit("task", "", { event_id: id });
      else if (action === "archive-event")
        edit("archive", "", { event_id: id });
      else if (action === "event-archives") {
        state.archiveEventId = id;
        state.archivePage = 1;
        state.deleted = false;
        state.page = "Arsip & Surat";
        render();
      } else if (action === "archives-all") {
        state.archiveEventId = "";
        state.archivePage = 1;
        archives();
      } else if (action === "archive-search") {
        state.search = $("#archive-search").value;
        state.category = $("#archive-category").value;
        state.archivePage = 1;
        await loadArchives();
      } else if (action === "archive-trash-view") {
        state.deleted = !state.deleted;
        state.archivePage = 1;
        archives();
      } else if (action === "archive-next" || action === "archive-prev") {
        state.archivePage += action === "archive-next" ? 1 : -1;
        await loadArchives();
      } else if (action === "archive-trash" || action === "archive-restore") {
        const rec = state.archives.items.find((x) => x.id === id);
        if (
          action === "archive-trash" &&
          !window.confirm(
            "Pindahkan catatan arsip ke sampah aplikasi? Catatan masih bisa dipulihkan.",
          )
        )
          return;
        await api("setArchiveTrash", {
          id,
          revision: rec.revision,
          deleted: action === "archive-trash",
        });
        toast(
          action === "archive-trash"
            ? "Arsip masuk sampah aplikasi."
            : "Arsip dipulihkan.",
        );
        await loadArchives();
      } else if (action === "archive-versions") {
        const versions = await api("archiveVersions", id);
        $("#dialog-title").textContent = "Riwayat versi arsip";
        $("#form-fields").innerHTML = versions.length
          ? versions
              .map(
                (x) =>
                  `<section class="panel"><h3>Versi ${x.version}</h3><p>${esc(date(x.recorded_at, true))}</p><p>${archiveLink(x, x.file_name || "Unduh versi ini")}</p></section>`,
              )
              .join("")
          : empty(
              "Riwayat versi belum tersedia",
              "Periksa catatan arsip dan log aktivitas.",
            );
        $("#form-error").textContent = "";
        $("#save-button").hidden = true;
        state.editor = null;
        $("#editor").showModal();
      } else if (action === "export") {
        const data = await api("exportData");
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download =
          "osda-rq-data-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("Ekspor data dibuat. File Drive dicadangkan terpisah.");
      }
    } catch (e) {
      toast(e.message);
    } finally {
      finish();
    }
  });
  document.addEventListener("change", async (event) => {
    const el = event.target;
    if (el.matches("#term-filter,#scope-filter,#month-filter")) {
      state.query.term_id = $("#term-filter").value;
      state.query.scope = $("#scope-filter").value;
      state.query.month = $("#month-filter").value;
      state.eventId = "";
      state.archiveEventId = "";
      state.archivePage = 1;
      await load();
    }
    if (el.dataset.task) {
      const t = state.data.tasks.find((x) => x.id === el.dataset.task);
      el.disabled = true;
      try {
        await api("saveTask", { ...t, done: el.checked });
        await load();
      } catch (e) {
        el.checked = !el.checked;
        toast(e.message);
      } finally {
        el.disabled = false;
      }
    }
  });
  $("#sidebar-collapse").addEventListener("click", () => {
    if ((window.innerWidth || 1024) <= 760) return;
    sidebarUI.compact = !sidebarUI.compact;
    saveSidebarPrefs_();
    paintSidebarLayout_();
  });
  $("#menu-toggle").addEventListener("click", () =>
    setMobileSidebar_(!$("#sidebar").classList.contains("open"), true),
  );
  $("#navigation").addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-sidebar-group]");
    if (!toggle) return;
    const index = toggle.dataset.sidebarGroup;
    sidebarUI.closed[index] = !sidebarUI.closed[index];
    saveSidebarPrefs_();
    hideNavTooltip_();
    paintSidebarGroup_(toggle.closest(".nav-group"));
  });
  $("#navigation").addEventListener("scroll", hideNavTooltip_, {
    passive: true,
  });
  $("#navigation").addEventListener("mouseover", (event) =>
    showNavTooltip_(event.target.closest("[data-nav-tooltip]")),
  );
  $("#navigation").addEventListener("mouseout", (event) => {
    const target = event.target.closest("[data-nav-tooltip]");
    if (target && !target.contains(event.relatedTarget)) hideNavTooltip_();
  });
  $("#navigation").addEventListener("focusin", (event) =>
    showNavTooltip_(event.target.closest("[data-nav-tooltip]")),
  );
  $("#navigation").addEventListener("focusout", hideNavTooltip_);
  window.addEventListener("resize", paintSidebarLayout_);
  document.addEventListener("click", (e) => {
    if (
      window.innerWidth <= 760 &&
      !e.target.closest("#sidebar") &&
      !e.target.closest("#menu-toggle")
    ) {
      setMobileSidebar_(false);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      sidebarUI.mobile &&
      $("#sidebar").classList.contains("open")
    ) {
      e.preventDefault();
      setMobileSidebar_(false, true);
    }
    if (e.key === "Enter" && e.target.id === "archive-search") {
      e.preventDefault();
      document.querySelector('[data-action="archive-search"]').click();
    }
  });
  function tick() {
    if (typeof officeTick_ === "function") officeTick_();
    document.querySelectorAll("[data-start]").forEach((el) => {
      const seconds = Math.max(
        0,
        Math.floor((new Date(el.dataset.start).getTime() - Date.now()) / 1000),
      );
      el.innerHTML = [
        Math.floor(seconds / 86400),
        Math.floor(seconds / 3600) % 24,
        Math.floor(seconds / 60) % 60,
        seconds % 60,
      ]
        .map(
          (n, i) =>
            `<div><b>${String(n).padStart(2, "0")}</b><small>${["Hari", "Jam", "Menit", "Detik"][i]}</small></div>`,
        )
        .join("");
    });
    if (
      state.page === "Ringkasan" &&
      typeof refreshDashboardEvent_ === "function"
    )
      refreshDashboardEvent_();
  }
  setInterval(tick, 1000);
  function initializeClient_() {
    state.query.month = OSDA_BOOT.month;
    const missing = [
      [
        "AuthClient.html",
        typeof startAuth === "function" && typeof authLive !== "undefined",
      ],
      [
        "WorkspaceUI.html",
        typeof workspaceAfterRender_ === "function" &&
          typeof personalView === "function" &&
          typeof calendarView === "function" &&
          typeof handoverView === "function" &&
          typeof importView === "function" &&
          typeof backupView === "function",
      ],
      ["ImportTemplates.html", typeof IMPORT_XLSX_TEMPLATES !== "undefined"],
      [
        "RevisionUI.html",
        typeof mountDashboardServices_ === "function" &&
          typeof formalReportHTML_ === "function",
      ],
      [
        "ArchiveBulkUI.html",
        typeof archiveBulkLaunchButton_ === "function" &&
          typeof resetArchiveBulk_ === "function",
      ],
    ]
      .filter(([, loaded]) => !loaded)
      .map(([name]) => name);
    if (typeof authLive !== "undefined") authLive.ready = missing.length === 0;
    $("#startup-loading").hidden = true;
    $("#login-submit").disabled = missing.length > 0;
    if (missing.length) {
      $("#login-error").textContent =
        "Berkas aplikasi belum lengkap: " +
        missing.join(", ") +
        ". Perbarui seluruh file dari paket yang sama, lalu pilih Deploy → New version.";
      return false;
    }
    $("#login-error").textContent = "";
    initializeSidebar_();
    startAuth();
    if (window.OSDA_STARTUP) window.OSDA_STARTUP.ready = true;
    return true;
  }
const authLive = {
    token: "",
    user: null,
    mode: "login",
    forced: false,
    busy: false,
    ready: false,
    identityTrigger: null,
  };
  function accountIdentity_() {
    const user = state.data?.current_user || authLive.user || {};
    const grants = state.data?.access.grants || [];
    const global = grants.filter(
      (g) => !g.term_id && ["Admin", "Mentor OSDA"].includes(g.role),
    );
    const current = periodGrants_();
    const order = [
      "Mentor OSDA",
      "Admin",
      "Ketua OSDA",
      "Sekretaris",
      "Ketua Bidang",
      "Kepala Bidang",
      "Mentor Bidang",
    ];
    const roles = [...new Set([...global, ...current].map((g) => g.role))].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    );
    const displayRole = (role) =>
      role === "Admin"
        ? "Admin OSDA"
        : role === "Kepala Bidang"
          ? "Ketua Bidang"
          : role;
    const departments = [
      ...new Set(current.map((g) => g.department).filter(Boolean)),
    ];
    const all = state.data?.access.is_admin;
    const scopes = [...new Set(current.map((g) => g.scope))];
    return {
      user,
      grants,
      current,
      name: user.name || "Akun pengurus",
      role: roles.length
        ? [...new Set(roles.map(displayRole))].join(" · ")
        : all
          ? "Admin OSDA"
          : "Pengurus OSDA",
      department:
        all || current.some((g) => !g.department)
          ? "Seluruh bidang"
          : departments.join(" · ") || "Belum ditetapkan",
      scope:
        all || scopes.includes("Semua")
          ? "Santriwan & Santriwati"
          : scopes.join(" · ") || "Belum ditetapkan",
      readOnly: !all && current.length > 0 && current.every((g) => g.read_only),
      displayRole,
    };
  }
  function renderAccountIdentity_() {
    if (!state.data || !authLive.token) return;
    const identity = accountIdentity_(),
      period = currentPeriod();
    const shortRole =
      identity.role +
      (identity.current.length &&
      !identity.current.some((g) => !g.department) &&
      !state.data.access.is_admin
        ? " · " + identity.department
        : "") +
      (identity.readOnly ? " · Baca saja" : "");
    $("#user-label").textContent = identity.name;
    $("#user-role").textContent = shortRole;
    document
      .querySelectorAll("[data-account-initials]")
      .forEach((node) => (node.textContent = initials(identity.name) || "RQ"));
    document
      .querySelectorAll("[data-account-name]")
      .forEach((node) => (node.textContent = identity.name));
    document
      .querySelectorAll("[data-account-role]")
      .forEach((node) => (node.textContent = shortRole));
    document.querySelectorAll("[data-account-open]").forEach((node) => {
      node.title = identity.name + " · " + shortRole;
      node.setAttribute(
        "aria-label",
        "Buka identitas " + identity.name + ", " + shortRole,
      );
    });
    $("#account-avatar").textContent = initials(identity.name) || "RQ";
    $("#account-title").textContent = identity.name;
    $("#account-primary-role").textContent = identity.role;
    $("#account-username").textContent = identity.user.username
      ? "@" + identity.user.username
      : "Akun pengurus";
    const facts = [
      ["Rayon", identity.scope],
      ["Bidang", identity.department],
      ["Kabinet", period.cabinet_name || "Belum ditetapkan"],
      [
        "Periode yang dibuka",
        "Ke-" +
          (period.name || "—") +
          (period.years ? " · " + period.years : ""),
      ],
    ];
    $("#account-facts").innerHTML = facts
      .map(
        ([label, value]) =>
          `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`,
      )
      .join("");
    $("#account-assignment-count").textContent =
      identity.grants.length + " penugasan";
    $("#account-grants").innerHTML =
      identity.grants
        .map((g) => {
          const term = state.data.periods.find((p) => p.id === g.term_id);
          const current = !g.term_id || g.term_id === state.query.term_id;
          const context = !g.term_id
            ? "Seluruh periode · Santriwan & Santriwati"
            : "Periode ke-" +
              (term?.name || "—") +
              " · " +
              (g.scope === "Semua" ? "Santriwan & Santriwati" : g.scope) +
              (g.department ? " · " + g.department : " · Seluruh bidang");
          return `<article class="account-assignment ${current ? "is-current" : ""}"><span class="account-assignment-mark" aria-hidden="true">${symbol(g.role.includes("Mentor") || g.role === "Admin" ? "shield" : "people")}</span><div><strong>${esc(identity.displayRole(g.role))}</strong><p>${esc(context)}</p><small>${!g.term_id ? "Akses pengelola" : g.read_only ? "Baca saja" : "Akses sesuai penugasan"}${g.term_id === state.query.term_id ? " · Periode yang dibuka" : ""}</small></div></article>`;
        })
        .join("") ||
      '<p class="account-help">Penugasan akun belum tersedia.</p>';
    const caption = $(".nav-caption");
    if (caption)
      caption.textContent = state.data.access.is_admin
        ? "PUSAT ADMINISTRASI ORGANISASI"
        : hasPeriodRole_(["Ketua OSDA"])
          ? "KOORDINASI KEPENGURUSAN"
          : hasPeriodRole_(["Sekretaris"])
            ? "ADMINISTRASI & DOKUMENTASI"
            : hasPeriodRole_(["Ketua Bidang", "Kepala Bidang"])
              ? "RUANG KERJA BIDANG"
              : "RUANG PEMBINAAN";
  }
  function closeAccountIdentity_(restoreFocus = true) {
    const dialog = $("#account-dialog");
    if (!dialog?.hasAttribute("open")) return;
    dialog.close();
    document
      .querySelectorAll("[data-account-open]")
      .forEach((node) => node.setAttribute("aria-expanded", "false"));
    if (restoreFocus && authLive.identityTrigger?.isConnected)
      authLive.identityTrigger.focus?.();
    authLive.identityTrigger = null;
  }
  function openAccountIdentity_(trigger) {
    if (!authLive.token || !state.data) return;
    authLive.identityTrigger =
      trigger?.closest("#sidebar") && (window.innerWidth || 1024) <= 760
        ? $(".account-trigger")
        : trigger;
    setMobileSidebar_(false);
    renderAccountIdentity_();
    $("#account-dialog").showModal();
    document
      .querySelectorAll("[data-account-open]")
      .forEach((node) => node.setAttribute("aria-expanded", "true"));
    $("[data-account-close]").focus?.();
  }
  function resetAccountIdentity_() {
    closeAccountIdentity_(false);
    authLive.identityTrigger = null;
    for (const id of [
      "account-title",
      "account-primary-role",
      "account-username",
      "account-facts",
      "account-grants",
      "account-assignment-count",
    ])
      $("#" + id).replaceChildren();
    $("#account-avatar").textContent = "RQ";
    $("#user-label").textContent = "Akun pengurus";
    $("#user-role").textContent = "Identitas akun saya";
    document
      .querySelectorAll("[data-account-initials]")
      .forEach((node) => (node.textContent = "RQ"));
    document
      .querySelectorAll("[data-account-name]")
      .forEach((node) => (node.textContent = "Akun pengurus"));
    document
      .querySelectorAll("[data-account-role]")
      .forEach((node) => (node.textContent = "Identitas akun saya"));
    document.querySelectorAll("[data-account-open]").forEach((node) => {
      node.title = "Identitas akun saya";
      node.setAttribute("aria-label", "Buka identitas akun");
      node.setAttribute("aria-expanded", "false");
    });
    $("#navigation").replaceChildren();
  }
  function authRequest(payload) {
    return new Promise((resolve, reject) =>
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler((e) => reject(Error(e.message || String(e))))
        .auth(payload),
    );
  }
  function loginMode(mode) {
    authLive.mode = mode;
    document.querySelector("#login-screen").dataset.mode = mode;
    const setup = mode !== "login";
    document.querySelector("#login-title").textContent = setup
      ? mode === "bootstrap"
        ? "Siapkan admin pertama"
        : "Pulihkan akses admin"
      : "Selamat datang kembali";
    document.querySelector("#login-description").textContent = setup
      ? "Gunakan username pilihan dan frasa sandi 6–128 karakter."
      : "Masuk dengan akun yang diberikan admin OSDA.";
    document.querySelector("#login-name-field").hidden = mode !== "bootstrap";
    document.querySelector("#login-name").required = mode === "bootstrap";
    document.querySelector("#login-confirm-field").hidden = !setup;
    document.querySelector("#login-confirm").required = setup;
    document.querySelector("#login-back").hidden = !setup;
    document.querySelector("#owner-setup").hidden = setup;
    document.querySelector("#login-submit").textContent = setup
      ? "Simpan dan masuk"
      : "Masuk ke ruang pengurus →";
    document.querySelector("#login-password").autocomplete = setup
      ? "new-password"
      : "current-password";
    document.querySelector("#login-error").textContent = "";
  }
  function showLogin(message) {
    resetReadCache_();
    resetAccountIdentity_();
    resetLoading_();
    setMobileSidebar_(false);
    hideNavTooltip_();
    authLive.token = "";
    authLive.user = null;
    authLive.forced = false;
    state.loading++;
    state.finalRequest = (state.finalRequest || 0) + 1;
    state.finalReport = null;
    state.finalVersions = [];
    state.requestedFinalVersion = 0;
    if (typeof resetWorkspace_ === "function") resetWorkspace_();
    if (typeof resetOfficeUI_ === "function") resetOfficeUI_();
    if (typeof resetManagement_ === "function") resetManagement_();
    if (typeof resetArchiveBulk_ === "function") resetArchiveBulk_();
    if (typeof resetRevisionUI_ === "function") resetRevisionUI_();
    state.data = null;
    state.editor = null;
    state.accountsData = null;
    state.archives = null;
    state.dossier = null;
    state.page = "Ringkasan";
    state.featureRequest = (state.featureRequest || 0) + 1;
    state.importPreview = null;
    state.handoverData = null;
    state.backupData = null;
    document.body.classList.remove("meeting-active");
    state.query = { scope: "Semua", month: OSDA_BOOT.month };
    document.querySelector("#workspace").hidden = true;
    document.querySelector("#login-screen").hidden = false;
    document.body.classList.add("login-active");
    document.body.classList.remove("workspace-entering");
    fitLoginViewport_();
    document.querySelector("#page").replaceChildren();
    document.querySelector("#form-fields").replaceChildren();
    for (const d of document.querySelectorAll("dialog[open]")) d.close();
    document.querySelector("#password-form").reset();
    document.querySelector("#login-form").reset();
    loginMode("login");
    document.querySelector("#login-error").textContent = message || "";
  }
  async function acceptSession(result) {
    resetReadCache_();
    authLive.token = result.token;
    authLive.user = result.user;
    if (result.user.must_change_password) {
      openPassword(true);
      return;
    }
    document.querySelector("#login-screen").hidden = true;
    document.querySelector("#workspace").hidden = false;
    document.body.classList.remove("login-active");
    window.scrollTo?.(0, 0);
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      document.body.classList.add("workspace-entering");
      window.setTimeout(
        () => document.body.classList.remove("workspace-entering"),
        420,
      );
    }
    document.querySelector("#user-label").textContent = result.user.name;
    state.page = "Ringkasan";
    await load();
  }
  function openPassword(forced) {
    closeAccountIdentity_(false);
    authLive.forced = Boolean(forced);
    document.querySelector("#password-form").reset();
    document.querySelector("#password-error").textContent = "";
    document.querySelector("#password-help").textContent = forced
      ? "Kata sandi dari admin bersifat sementara. Ganti sebelum membuka data organisasi."
      : "Mengganti kata sandi akan mengakhiri sesi akun ini di perangkat lain.";
    document.querySelector("#password-cancel").textContent = forced
      ? "Keluar"
      : "Batal";
    document.querySelector("#password-dialog").showModal();
  }
  async function logout() {
    if (authLive.busy) return;
    const token = authLive.token;
    authLive.busy = true;
    const finish = beginButtonLoading_(
      document.querySelector("#logout-button"),
      "Keluar…",
    );
    const finishCancel = authLive.forced
      ? beginButtonLoading_(
          document.querySelector("#password-cancel"),
          "Keluar…",
        )
      : () => {};
    try {
      if (token) await authRequest({ action: "logout", token });
      showLogin();
    } catch (e) {
      document.querySelector("#password-error").textContent =
        "Belum dapat keluar: " + e.message;
      toast("Belum dapat mengakhiri sesi. Coba Keluar kembali.");
    } finally {
      authLive.busy = false;
      finish();
      finishCancel();
    }
  }
  function startAuth() {
    fitLoginViewport_();
    document.querySelector("#owner-tools").hidden = !OSDA_BOOT.owner;
    document.querySelector("#owner-setup").textContent = OSDA_BOOT.needs_admin
      ? "Siapkan admin pertama"
      : "Pemulihan admin oleh pemilik proyek";
    if (OSDA_BOOT.owner && OSDA_BOOT.needs_admin) loginMode("bootstrap");
  }
  function fitLoginViewport_() {
    const screen = document.querySelector("#login-screen");
    const height = window.visualViewport?.height || window.innerHeight;
    if (screen && !screen.hidden && height > 0)
      screen.style.setProperty("--login-height", Math.round(height) + "px");
  }
  window.addEventListener("resize", fitLoginViewport_, { passive: true });
  window.visualViewport?.addEventListener("resize", fitLoginViewport_, {
    passive: true,
  });
  document
    .querySelector("#owner-setup")
    .addEventListener("click", () =>
      loginMode(OSDA_BOOT.needs_admin ? "bootstrap" : "ownerReset"),
    );
  document
    .querySelector("#login-back")
    .addEventListener("click", () => loginMode("login"));
  document.querySelector("#logout-button").addEventListener("click", logout);
  document.addEventListener("click", (event) => {
    const open = event.target.closest?.("[data-account-open]");
    if (open) openAccountIdentity_(open);
    if (event.target.closest?.("[data-account-close]")) closeAccountIdentity_();
  });
  document.querySelector("#account-dialog").addEventListener("close", () => {
    document
      .querySelectorAll("[data-account-open]")
      .forEach((node) => node.setAttribute("aria-expanded", "false"));
    authLive.identityTrigger = null;
  });
  document
    .querySelector("#password-open")
    .addEventListener("click", () => openPassword(false));
  document.querySelector("#password-cancel").addEventListener("click", () => {
    if (authLive.forced) logout();
    else document.querySelector("#password-dialog").close();
  });
  document.querySelector("#password-dialog").addEventListener("cancel", (e) => {
    if (authLive.forced || authLive.busy) e.preventDefault();
  });
  document
    .querySelector("#login-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!authLive.ready || authLive.busy) return;
      const password = document.querySelector("#login-password").value;
      if (
        authLive.mode !== "login" &&
        password !== document.querySelector("#login-confirm").value
      ) {
        document.querySelector("#login-error").textContent =
          "Pengulangan kata sandi tidak sama.";
        return;
      }
      const payload = {
        action: authLive.mode,
        username: document.querySelector("#login-username").value,
        password,
        name: document.querySelector("#login-name").value,
      };
      if (authLive.mode === "bootstrap") {
        if (!window.crypto || !crypto.getRandomValues) {
          document.querySelector("#login-error").textContent =
            "Browser tidak mendukung Web Crypto. Gunakan browser yang diperbarui.";
          return;
        }
        payload.entropy = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      }
      authLive.busy = true;
      const finish = beginButtonLoading_(
        document.querySelector("#login-submit"),
        "Memeriksa akun…",
      );
      document.querySelector("#login-error").textContent = "";
      try {
        const result = await authRequest(payload);
        document.querySelector("#login-form").reset();
        OSDA_BOOT.needs_admin = false;
        await acceptSession(result);
      } catch (e) {
        document.querySelector("#login-error").textContent = e.message;
      } finally {
        authLive.busy = false;
        finish();
      }
    });
  document
    .querySelector("#password-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!authLive.ready || authLive.busy) return;
      const form = e.currentTarget;
      if (
        form.elements.new_password.value !==
        form.elements.confirm_password.value
      ) {
        document.querySelector("#password-error").textContent =
          "Pengulangan kata sandi tidak sama.";
        return;
      }
      authLive.busy = true;
      const finish = beginButtonLoading_(
        document.querySelector("#password-submit"),
        "Menyimpan sandi…",
      );
      try {
        const result = await authRequest({
          action: "changePassword",
          token: authLive.token,
          current_password: form.elements.current_password.value,
          new_password: form.elements.new_password.value,
        });
        form.reset();
        authLive.forced = false;
        document.querySelector("#password-dialog").close();
        await acceptSession(result);
        toast("Kata sandi berhasil diganti.");
      } catch (e) {
        document.querySelector("#password-error").textContent = e.message;
      } finally {
        authLive.busy = false;
        finish();
      }
    });
const IMPORT_XLSX_TEMPLATES={"members": {"name": "Template_Pengurus_OSDA.xlsx", "columns": ["nama", "bidang", "jabatan", "asal_daerah", "catatan"], "base64": "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"}, "programs": {"name": "Template_Program_OSDA.xlsx", "columns": ["nama", "bidang", "frekuensi", "jadwal", "bulan_pelaksanaan", "tujuan"], "base64": "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"}, "matrix": {"name": "Template_Proker_Kolom_OSDA.xlsx", "base64": "UEsDBBQABgAIAAAAIQBi7p1oXgEAAJAEAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtbCCiBAIooAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACslMtOwzAQRfdI/EPkLUrcskAINe2CxxIqUT7AxJPGqmNbnmlp/56J+xBCoRVqN7ESz9x7MvHNaLJubbaCiMa7UgyLgcjAVV4bNy/Fx+wlvxcZknJaWe+gFBtAMRlfX41mmwCYcbfDUjRE4UFKrBpoFRY+gOOd2sdWEd/GuQyqWqg5yNvB4E5W3hE4yqnTEOPRE9RqaSl7XvPjLUkEiyJ73BZ2XqVQIVhTKWJSuXL6l0u+cyi4M9VgYwLeMIaQvQ7dzt8Gu743Hk00GrKpivSqWsaQayu/fFx8er8ojov0UPq6NhVoXy1bnkCBIYLS2ABQa4u0Fq0ybs99xD8Vo0zL8MIg3fsl4RMcxN8bZLqej5BkThgibSzgpceeRE85NyqCfqfIybg4wE/tYxx8bqbRB+QERfj/FPYR6brzwEIQycAhJH2H7eDI6Tt77NDlW4Pu8ZbpfzL+BgAA//8DAFBLAwQUAAYACAAAACEAtVUwI/QAAABMAgAACwAIAl9yZWxzLy5yZWxzIKIEAiigAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKySTU/DMAyG70j8h8j31d2QEEJLd0FIuyFUfoBJ3A+1jaMkG92/JxwQVBqDA0d/vX78ytvdPI3qyCH24jSsixIUOyO2d62Gl/pxdQcqJnKWRnGs4cQRdtX11faZR0p5KHa9jyqruKihS8nfI0bT8USxEM8uVxoJE6UchhY9mYFaxk1Z3mL4rgHVQlPtrYawtzeg6pPPm3/XlqbpDT+IOUzs0pkVyHNiZ9mufMhsIfX5GlVTaDlpsGKecjoieV9kbMDzRJu/E/18LU6cyFIiNBL4Ms9HxyWg9X9atDTxy515xDcJw6vI8MmCix+o3gEAAP//AwBQSwMEFAAGAAgAAAAhABSxJ7teAwAAWQgAAA8AAAB4bC93b3JrYm9vay54bWysVV1vozgUfV9p/wPi3cUmQACVjhI+tJXaUdVm2pdKIxdMsQo4a0yTqpr/PtcQ0nayWmU7GxF/3cvxub7nmtMv26Y2npnsuGgjk5xg02BtLgrePkbmt1WGfNPoFG0LWouWReYL68wvZ3/+cboR8ulBiCcDANouMiul1qFldXnFGtqdiDVrwVIK2VAFU/lodWvJaNFVjKmmtmyMPauhvDVHhFAegyHKkucsEXnfsFaNIJLVVAH9ruLrbkJr8mPgGiqf+jXKRbMGiAdec/UygJpGk4fnj62Q9KGGsLfENbYSHg/+BENjTzuB6WCrhudSdKJUJwBtjaQP4ifYIuTDEWwPz+A4JMeS7JnrHO5ZSe+TrLw9lvcGRvBvoxGQ1qCVEA7vk2junpttnp2WvGa3o3QNul5/pY3OVG0aNe1UWnDFisicw1Rs2IcF2a+XPa/BOsMz2zOts72cr6RRsJL2tVqBkCd4qAzPC2xXe4IwFrVisqWKxaJVoMNdXL+ruQE7rgQo3Lhmf/dcMigs0BfECi3NQ/rQXVFVGb2sIzMO7791EP49zZm8n2qiu38nTHpYBf9BmjTX8VoQ8EhqHP8aPHCT4SS/KyUNGJ8nF5CCG/oMCYG0F7t6PYcT97+/OnPbW5DYRdglCXIWSYL8BfZRFviBZ3t2kHruD4hCemEuaK+qXZI1ZmQ6kNED0yXdThaCw54Xb/u/4t0P6f6XZrL90JHq6+yWs033Jgc9NbZ3vC3EJjIR0SJ++TjdDMY7XqgKZBI4NriMa38x/lgBY4JnWItf2ppZZL6maYpBTSlaJEsHOfEiQL6fxGg2yxJiL2wYLwZG1jtKw8UJ1IbeaAex3+jLlMANrXt9ujCWod5DnhdkyN70Wk7rHMStu8ExINgOtAfbqotODT3oigM94uDFHAcOwunMRY4f2Mh3ZjaKncRO3XmapMshP/riD/+P62+Qdzh9UTTLikq1kjR/gu/QNSuXtAMljQEB3/dkl66/xDOg6GQkQw4JMFouPQe5STZz5ySJUzfTYhrJ6vDLT14+vjW8zajqoTB1TQ7zULfZbnW/WI4Luzx9KLrwOtHnvnv73xxvIPqaHemc3R7pGH+9XF0e6XuRrr7fZYOQ/jFaa8iGbgcNWVMOz34CAAD//wMAUEsDBBQABgAIAAAAIQCBPpSX8wAAALoCAAAaAAgBeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHMgogQBKKAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACsUk1LxDAQvQv+hzB3m3YVEdl0LyLsVesPCMm0KdsmITN+9N8bKrpdWNZLLwNvhnnvzcd29zUO4gMT9cErqIoSBHoTbO87BW/N880DCGLtrR6CRwUTEuzq66vtCw6acxO5PpLILJ4UOOb4KCUZh6OmIkT0udKGNGrOMHUyanPQHcpNWd7LtOSA+oRT7K2CtLe3IJopZuX/uUPb9gafgnkf0fMZCUk8DXkA0ejUISv4wUX2CPK8/GZNec5rwaP6DOUcq0seqjU9fIZ0IIfIRx9/KZJz5aKZu1Xv4XRC+8opv9vyLMv072bkycfV3wAAAP//AwBQSwMEFAAGAAgAAAAhAF2b7M4VBQAAchoAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWykmV2PozYUhu8r9T8g7hMCJJkkSrJasLfdi0pVv+4Z4iRoQpwC86Wq/73HdiDHPtPR7Fqa0ZDHh9cvcOAlnvWnl/oUPImmreR5E8bjSRiIcyl31fmwCf/848toEQZtV5x3xUmexSZ8FW34afvjD+tn2Ty0RyG6ABTO7SY8dt1lFUVteRR10Y7lRZxhZC+buujgY3OI2ksjip3eqT5FyWQyj+qiOodGYdV8REPu91UpmCwfa3HujEgjTkUH/ttjdWl7tbr8iFxdNA+Pl1Ep6wtI3FenqnvVomFQl6uvh7NsivsTHPdLPC3K4KWBnwR+034azclMdVU2spX7bgzKkfFMD38ZLaOiHJTo8X9IJp5GjXiq1AW8SSXfZymeDVrJTSz9TrH5IKZOV7N6rHab8B8+X8wzPp+MltmMj6bJLB0tpiwbJTljixnPp8li+W+4Xe8quMLqqIJG7Dfh53jF0zSMtmvdQH9V4rlF20FX3P8uTqLsBEwSh4Hqz3spH1ThV0ATkGx1gZIsyq56Erk4nTbhTzNo8b/1JLAJE0TDDHi7n+2L7uhfm2An9sXjqftNPv8sqsOxg2mnY9DSLbHavTLRltCjMPU41bpalhVdsV038jmA6w0+20uh7p54BXtqDfjbHavyIZNK8U25KRxLqfb/rAQ24RR22YQt0KftZB09ge3yWpGZCj2/3iV3AXMBN2CuTwUYHdxCS/i5VQK229hxayqQWxcwF3ADqFvoOT+3SsB2mzhuTQVy6wLmAm4AdQuX0M+tElD9Av2rr3PmgtwFzAUcgQhfeHWDOG2azFWrf7xRlYRu56FRU+dkmgq4mkPF1K7IacXMrmC0Ym5XcFpxN1RYxzz3vSBKYBOm+qZ029yM3S5W7gLmAo6A5fPO16cS6H26DW7GkE8XMBdwBCyf6j3C61GnBHqfbu+YMeTTBcwFHAHL59LXpxLofTodnJkx5NMFzAUcActnDG9qntmhFHqnzp2UaXn8PMkJYYRwTGy3/klnUsncT85dncVmEJ1YQhghHBPbrXfSxSaVjNvbE8Y8ma+D2K0pvxFGajgmtlvvpItNKhm3C/cFwgxity5hV4FbDcfEduuddDGJOkJyQhghHBPb4ht5l8J9+A2vZTTuyGntS/rAzmOXMEI4JrZn77yK3wus6yBuAhJZpIZjYrv1Tq34vdi6DmK3JLhIDcfEduudXfF74XUdxG5JfJEajont1jvB4vci7DqI3ZIQIzUcE8tt4h1jWuH/Yuw6iNwSwgjhmNhuvWMscZMqIyQnhBHCMbEtvpFds/jbXtaTPo5u7+JL94uam1j5sFP/QGOEcExs194ZluAMI18rSYZdy1HiEsIxsd16Z1hiMswkrvvWfR3ETUu+u5Eajont9o04Uzny8ThL3GTKCMkJYYRwTGyL3umVuHGUEZITwgjhmNgWvSMrcTMoIyQnhBHCMbEteudU4gZPRkhOCCOEY2Jb9A6nxE2bjJCcEEYIx8SymHonklaw1mIIyQlhhHBMbIveMZSSGCIkJ4QRwjGxLXp/hUrdhMkIyQlhhHBMbIv+K4RurGSwQm0vw+WEMELUuvawl7FolqDNWnEtmoNeqm6DUj6qBWUVGwO9LY/rwHB5soIVUohkl6ewnK5XeG/y2/WlOIhfiuZQndvgJPZ67RqeWo1Z3p6MYbuTF7WifQeRcC+7Ttb9pyP8b0fAmjSsdofBXsqu/6BW1If/Fm3/AwAA//8DAFBLAwQUAAYACAAAACEAwRcQvk4HAADGIAAAEwAAAHhsL3RoZW1lL3RoZW1lMS54bWzsWc2LGzcUvxf6Pwxzd/w1448l3uDPbJPdJGSdlBy1tuxRVjMykrwbEwIlOfVSKKSll0JvPZTSQAMNvfSPCSS06R/RJ83YI63lJJtsSlp2DYtH/r2np/eefnrzdPHSvZh6R5gLwpKWX75Q8j2cjNiYJNOWf2s4KDR8T0iUjBFlCW75Cyz8S9uffnIRbckIx9gD+URsoZYfSTnbKhbFCIaRuMBmOIHfJozHSMIjnxbHHB2D3pgWK6VSrRgjkvhegmJQe30yISPsDZVKf3upvE/hMZFCDYwo31eqsSWhsePDskKIhehS7h0h2vJhnjE7HuJ70vcoEhJ+aPkl/ecXty8W0VYmROUGWUNuoP8yuUxgfFjRc/LpwWrSIAiDWnulXwOoXMf16/1av7bSpwFoNIKVprbYOuuVbpBhDVD61aG7V+9Vyxbe0F9ds7kdqo+F16BUf7CGHwy64EULr0EpPlzDh51mp2fr16AUX1vD10vtXlC39GtQRElyuIYuhbVqd7naFWTC6I4T3gyDQb2SKc9RkA2r7FJTTFgiN+VajO4yPgCAAlIkSeLJxQxP0AiyuIsoOeDE2yXTCBJvhhImYLhUKQ1KVfivPoH+piOKtjAypJVdYIlYG1L2eGLEyUy2/Cug1TcgL549e/7w6fOHvz1/9Oj5w1+yubUqS24HJVNT7tWPX//9/RfeX7/+8OrxN+nUJ/HCxL/8+cuXv//xOvWw4twVL7598vLpkxffffXnT48d2tscHZjwIYmx8K7hY+8mi2GBDvvxAT+dxDBCxJJAEeh2qO7LyAJeWyDqwnWw7cLbHFjGBbw8v2vZuh/xuSSOma9GsQXcY4x2GHc64Kqay/DwcJ5M3ZPzuYm7idCRa+4uSqwA9+czoFfiUtmNsGXmDYoSiaY4wdJTv7FDjB2ru0OI5dc9MuJMsIn07hCvg4jTJUNyYCVSLrRDYojLwmUghNryzd5tr8Ooa9U9fGQjYVsg6jB+iKnlxstoLlHsUjlEMTUdvotk5DJyf8FHJq4vJER6iinz+mMshEvmOof1GkG/CgzjDvseXcQ2kkty6NK5ixgzkT122I1QPHPaTJLIxH4mDiFFkXeDSRd8j9k7RD1DHFCyMdy3CbbC/WYiuAXkapqUJ4j6Zc4dsbyMmb0fF3SCsItl2jy22LXNiTM7OvOpldq7GFN0jMYYe7c+c1jQYTPL57nRVyJglR3sSqwryM5V9ZxgAWWSqmvWKXKXCCtl9/GUbbBnb3GCeBYoiRHfpPkaRN1KXTjlnFR6nY4OTeA1AuUf5IvTKdcF6DCSu79J640IWWeXehbufF1wK35vs8dgX9497b4EGXxqGSD2t/bNEFFrgjxhhggKDBfdgogV/lxEnatabO6Um9ibNg8DFEZWvROT5I3Fz4myJ/x3yh53AXMGBY9b8fuUOpsoZedEgbMJ9x8sa3pontzAcJKsc9Z5VXNe1fj/+6pm014+r2XOa5nzWsb19vVBapm8fIHKJu/y6J5PvLHlMyGU7ssFxbtCd30EvNGMBzCo21G6J7lqAc4i+Jo1mCzclCMt43EmPycy2o/QDFpDZd3AnIpM9VR4MyagY6SHdSsVn9Ct+07zeI+N005nuay6mqkLBZL5eClcjUOXSqboWj3v3q3U637oVHdZlwYo2dMYYUxmG1F1GFFfDkIUXmeEXtmZWNF0WNFQ6pehWkZx5QowbRUVeOX24EW95YdB2kGGZhyU52MVp7SZvIyuCs6ZRnqTM6mZAVBiLzMgj3RT2bpxeWp1aaq9RaQtI4x0s40w0jCCF+EsO82W+1nGupmH1DJPuWK5G3Iz6o0PEWtFIie4gSYmU9DEO275tWoItyojNGv5E+gYw9d4Brkj1FsXolO4dhlJnm74d2GWGReyh0SUOlyTTsoGMZGYe5TELV8tf5UNNNEcom0rV4AQPlrjmkArH5txEHQ7yHgywSNpht0YUZ5OH4HhU65w/qrF3x2sJNkcwr0fjY+9AzrnNxGkWFgvKweOiYCLg3LqzTGBm7AVkeX5d+JgymjXvIrSOZSOIzqLUHaimGSewjWJrszRTysfGE/ZmsGh6y48mKoD9r1P3Tcf1cpzBmnmZ6bFKurUdJPphzvkDavyQ9SyKqVu/U4tcq5rLrkOEtV5Srzh1H2LA8EwLZ/MMk1ZvE7DirOzUdu0MywIDE/UNvhtdUY4PfGuJz/IncxadUAs60qd+PrK3LzVZgd3gTx6cH84p1LoUEJvlyMo+tIbyJQ2YIvck1mNCN+8OSct/34pbAfdStgtlBphvxBUg1KhEbarhXYYVsv9sFzqdSoP4GCRUVwO0+v6AVxh0EV2aa/H1y7u4+UtzYURi4tMX8wXteH64r5c2Xxx7xEgnfu1yqBZbXZqhWa1PSgEvU6j0OzWOoVerVvvDXrdsNEcPPC9Iw0O2tVuUOs3CrVyt1sIaiVlfqNZqAeVSjuotxv9oP0gK2Ng5Sl9ZL4A92q7tv8BAAD//wMAUEsDBBQABgAIAAAAIQCtULXfhQMAANcNAAANAAAAeGwvc3R5bGVzLnhtbNRX227bOBB9X2D/geC7okss1zYkBXEcAQW6iwWSBfpKS5RNlBeBolO5Rf99h5RsK6jTuG7TZv1gk6Ph4eEM52icXLWCoweqG6ZkisOLACMqC1UyuUrxv/e5N8GoMUSWhCtJU7ylDb7K/vwjacyW07s1pQYBhGxSvDamnvl+U6ypIM2FqqmEJ5XSghiY6pXf1JqSsrGLBPejIBj7gjCJO4SZKE4BEUR/2NReoURNDFsyzszWYWEkitnblVSaLDlQbcMRKVAbjnWEWr3bxFm/2kewQqtGVeYCcH1VVaygX9Od+lOfFAckQD4PKYz9IHp09lafiTTyNX1gNn04SyolTYMKtZEmxZdA1IZg9kGqjzK3jyDDvVeWNJ/QA+FgCbGfJYXiSiMDqYPIOYskgnYeN4SzpWbWrSKC8W1njqzBZbv3Ewxib42+5dGxyZKl9Tp5r2vNCD+60yPQPWDwHPlnAR1uA2wZ5/vYRTZMYMgSuGSGapnDBPXj+20NQZJQD91hnd8z3itNtmEUDxb4bkOIj9Il1N8uazHs3JmyhNPKQPQ0W63tr1E1fC+VMXBHs6RkZKUk4TbguxXDlVC3UKIpFrRkGwGwXY71apniPL9xH8fHbtPvcvIax8lROnkJ0N+xP3lNd9iXOWsX0VdB/3GSXxWl/9ON6MsAirmgnN/Z6/++2leWlb62QnIjcmHelimGd50Vqt0QyrgfdlXUTWx1DdE67AHsm7NgUVvt8Z8iFQG/Y6RCEPZ+NSJ1zbdW261qd7O5E5TD/JqzlRS0c8kSEPNuij5qUt/T1i21x2yrpwP00lzWSrNPcAz7RiqAK4UX9mvl57Tv++hBbo6mEsL6U1J5LHzQ1RlWnBvQpxjbruJnXL5fx3j02xk7AQHJGOjSI1Xa6wuyTVeK/7Y9Mx/QXm4YN0weUSTALNuDxrl2yNj+16nffheQupJWZMPN/f5hig/jv1yPALex9/qHPSjjIFJ8GL+zjUg4tk0DyMa7BroG+EUbzVL8+Xb+Zrq4zSNvEswn3uiSxt40ni+8eHQzXyzyaRAFN18GXfgP9ODuTwNoVTiaNRw6dd0ftid/d7CleDDp6LuWB2gPuU+jcXAdh4GXXwahNxqTiTcZX8ZeHofRYjya38Z5POAen9mrB34Ydl2/JR/PDBOUM7nL1S5DQyskCabfOIS/y4R/+EeW/QcAAP//AwBQSwMEFAAGAAgAAAAhAIXckPAXAQAA5AEAABQAAAB4bC9zaGFyZWRTdHJpbmdzLnhtbHSRUU+DMBDH3038Dpe+b0UepjHActM5cMJmgQcfG6hAAi22xei3t2bJTIh7aa73+13+yV2w/hp6+BTadEqG5GbpERCyUnUnm5CUxdPijoCxXNa8V1KE5FsYso6urwJjLLhZaULSWjveU2qqVgzcLNUopCPvSg/cuq9uqBm14LVphbBDT33PW9GBd5JApSZpXa6LnWT3MYmHcyMKTBcFNjqyw45hCvste0Y4sB1mSY55AjlmBUsCaqOA/qon/RHfMAZWxuULvJbMyXMjxRxhg/siAd/zVwv33M6dTM07R60azQeIue64vERTt7dmusw3U8/lZVzwdvoHFyUrM8wAXYHZPPtMj2ybJ24zfwJ1V4p+AAAA//8DAFBLAwQUAAYACAAAACEA+fKZeDwBAABZAgAAEQAIAWRvY1Byb3BzL2NvcmUueG1sIKIEASigAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlJLNTsMwEITvSLxD5HviJC1RsZJUAtQTlZAoAnGz7G1qETuWbUj79jg/DUHlwtE7s9/Orpyvj7IOvsBY0agCJVGMAlCs4UJVBXrZbcIVCqyjitO6UVCgE1i0Lq+vcqYJaww8mUaDcQJs4EnKEqYLdHBOE4wtO4CkNvIO5cV9YyR1/mkqrCn7oBXgNI4zLMFRTh3FHTDUExGNSM4mpP40dQ/gDEMNEpSzOIkS/ON1YKT9s6FXZk4p3En7nca4czZngzi5j1ZMxrZto3bRx/D5E/y2fXzuVw2F6m7FAJU5Z4QZoK4xJWVgcjwrdMerqXVbf+e9AH53Gj2Xdc/pYw8w4IEPQobYZ+V1cf+w26AyjdMsTOIwzXZxRpa3ZLF678b+6u+CDQU5Dv8P8WY5I54BZY4vPkP5DQAA//8DAFBLAwQUAAYACAAAACEAYUkJEIkBAAARAwAAEAAIAWRvY1Byb3BzL2FwcC54bWwgogQBKKAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACckkFv2zAMhe8D+h8M3Rs53VAMgaxiSFf0sGEBkrZnTaZjobIkiKyR7NePttHU2XrqjeR7ePpESd0cOl/0kNHFUInlohQFBBtrF/aVeNjdXX4VBZIJtfExQCWOgOJGX3xSmxwTZHKABUcErERLlFZSom2hM7hgObDSxNwZ4jbvZWwaZ+E22pcOAsmrsryWcCAINdSX6RQopsRVTx8NraMd+PBxd0wMrNW3lLyzhviW+qezOWJsqPh+sOCVnIuK6bZgX7Kjoy6VnLdqa42HNQfrxngEJd8G6h7MsLSNcRm16mnVg6WYC3R/eG1XovhtEAacSvQmOxOIsQbb1Iy1T0hZP8X8jC0AoZJsmIZjOffOa/dFL0cDF+fGIWACYeEccefIA/5qNibTO8TLOfHIMPFOONuBbzpzzjdemU/6J3sdu2TCkYVT9cOFZ3xIu3hrCF7XeT5U29ZkqPkFTus+DdQ9bzL7IWTdmrCH+tXzvzA8/uP0w/XyelF+LvldZzMl3/6y/gsAAP//AwBQSwECLQAUAAYACAAAACEAYu6daF4BAACQBAAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQItABQABgAIAAAAIQC1VTAj9AAAAEwCAAALAAAAAAAAAAAAAAAAAJcDAABfcmVscy8ucmVsc1BLAQItABQABgAIAAAAIQAUsSe7XgMAAFkIAAAPAAAAAAAAAAAAAAAAALwGAAB4bC93b3JrYm9vay54bWxQSwECLQAUAAYACAAAACEAgT6Ul/MAAAC6AgAAGgAAAAAAAAAAAAAAAABHCgAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECLQAUAAYACAAAACEAXZvszhUFAAByGgAAGAAAAAAAAAAAAAAAAAB6DAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsBAi0AFAAGAAgAAAAhAMEXEL5OBwAAxiAAABMAAAAAAAAAAAAAAAAAxREAAHhsL3RoZW1lL3RoZW1lMS54bWxQSwECLQAUAAYACAAAACEArVC134UDAADXDQAADQAAAAAAAAAAAAAAAABEGQAAeGwvc3R5bGVzLnhtbFBLAQItABQABgAIAAAAIQCF3JDwFwEAAOQBAAAUAAAAAAAAAAAAAAAAAPQcAAB4bC9zaGFyZWRTdHJpbmdzLnhtbFBLAQItABQABgAIAAAAIQD58pl4PAEAAFkCAAARAAAAAAAAAAAAAAAAAD0eAABkb2NQcm9wcy9jb3JlLnhtbFBLAQItABQABgAIAAAAIQBhSQkQiQEAABEDAAAQAAAAAAAAAAAAAAAAALAgAABkb2NQcm9wcy9hcHAueG1sUEsFBgAAAAAKAAoAgAIAAG8jAAAAAA=="}};
const workUI = {
    layouts: {},
    request: 0,
    personal: null,
    handovers: null,
    selectedHandover: null,
    backup: null,
    inspection: null,
    meetingIndex: 0,
    meetingIntro: true,
    calendarDay: "",
    receiverRequest: 0,
    importRequest: 0,
    importSheet: "",
    programSelection: null,
    programContext: "",
    programDepartment: "",
    programFrequency: "",
  };
  const workButton = (label, action, id = "", extra = "") =>
    ["my-task-done", "my-followup", "my-carried-task"].includes(action) &&
    !state.data?.access.is_admin &&
    !periodGrants_().some((g) => !g.read_only)
      ? ""
      : `<button type="button" class="button secondary small" data-workspace="${action}" data-id="${esc(id)}" ${extra}>${esc(label)}</button>`;
  function resetWorkspace_() {
    workUI.request++;
    workUI.receiverRequest++;
    workUI.importRequest++;
    workUI.personal = null;
    workUI.handovers = null;
    workUI.selectedHandover = null;
    workUI.backup = null;
    workUI.inspection = null;
    workUI.programSelection = null;
    workUI.programContext = "";
    workUI.importSheet = "";
    workUI.meetingIntro = true;
    workUI.meetingIndex = 0;
    $("#view-controls").replaceChildren();
    $("#meeting-slide").replaceChildren();
  }
  function requestStamp_(page) {
    return {
      page,
      request: ++workUI.request,
      query: JSON.stringify(state.query),
      token: authLive.token,
    };
  }
  function stampCurrent_(stamp) {
    return (
      stamp.page === state.page &&
      stamp.request === workUI.request &&
      stamp.query === JSON.stringify(state.query) &&
      stamp.token === authLive.token
    );
  }
  async function featureData_(page, method, arg, paint) {
    const stamp = requestStamp_(page);
    $("#page").innerHTML = loadingPanel_("Menyiapkan ruang kerja…");
    try {
      const result = await api(method, arg);
      if (stampCurrent_(stamp)) paint(result);
    } catch (e) {
      if (stampCurrent_(stamp))
        $("#page").innerHTML = empty("Data belum dapat dimuat", e.message);
    }
  }
  function workspaceAfterRender_() {
    const enabled = ["Program Kerja", "Arsip & Surat", "Akun & Akses"].includes(
      state.page,
    );
    $("#view-controls").innerHTML = enabled
      ? `<div class="view-switch" aria-label="Pilihan tampilan"><span>Tampilan data</span>${["table", "cards"].map((mode) => `<button type="button" data-workspace="layout" data-id="${mode}" aria-pressed="${(workUI.layouts[state.page] || "table") === mode}">${mode === "table" ? "Tabel" : "Kartu"}</button>`).join("")}</div>`
      : "";
    applyDataLayout_();
    renderCabinetIdentity_();
    if (typeof officeAfterRender_ === "function") officeAfterRender_();
    if (state.page === "Evaluasi Bulanan")
      $("#page").insertAdjacentHTML(
        "afterbegin",
        `<div class="meeting-launch"><div><strong>Musyawarah yang lebih fokus</strong><small>Tampilkan satu bahan pembahasan pada layar rapat.</small></div>${workButton("Buka mode rapat", "meeting-open")}</div>`,
      );
    if ($("#meeting-mode").hasAttribute("open")) renderMeetingSlide_();
  }
  function applyDataLayout_() {
    const cards = (workUI.layouts[state.page] || "table") === "cards";
    document.querySelectorAll("#page .table-wrap").forEach((w) => {
      w.classList.toggle("data-as-cards", cards);
      const labels = [...w.querySelectorAll("thead th")].map(
        (th) => th.textContent,
      );
      const head = w.querySelector("thead th:last-child");
      const actionCells = [...w.querySelectorAll("tbody tr")].map(
        (row) => row.lastElementChild,
      );
      const emptyActions =
        head?.textContent.trim() === "Tindakan" &&
        actionCells.length > 0 &&
        actionCells.every((cell) => !cell?.textContent.trim());
      if (head?.textContent.trim() === "Tindakan") {
        head.hidden = emptyActions;
        actionCells.forEach((cell) => (cell.hidden = emptyActions));
      }
      w.querySelectorAll("tbody tr").forEach((row) =>
        [...row.children].forEach((td, i) =>
          td.setAttribute("data-label", labels[i] || ""),
        ),
      );
    });
  }
  function assignmentField_(record, scope, type) {
    return select(
      "Hubungkan ke akun pelaksana (opsional)",
      "owner_account_id",
      record.owner_account_id || "",
      [{ value: "", label: "Belum dihubungkan ke akun" }],
      {
        required: false,
        help: "Nama penanggung jawab tetap dicatat. Hubungan akun membuat tugas tampil di Tugas Saya.",
      },
    );
  }
  function refreshAssignmentChoices_() {
    const form = $("#editor-form"),
      target = form.elements.owner_account_id;
    if (!target || !state.editor) return;
    const r = state.editor.record,
      old = target.value || r.owner_account_id || "",
      event = state.data.events.find(
        (e) => e.id === (form.elements.event_id?.value || r.event_id),
      );
    const scope =
      form.elements.scope?.value ||
      event?.scope ||
      r.scope ||
      (state.query.scope === "Semua" ? "Santriwan" : state.query.scope);
    const department =
      form.elements.department?.value ||
      form.elements.to_department?.value ||
      r.department ||
      "";
    const choices =
      event?.scope === "Bersama"
        ? state.data.event_assignment_choices || []
        : (state.data.assignment_choices || []).filter((a) =>
            a.contexts.some(
              (c) =>
                c.scope === scope &&
                (c.department === department || (!department && c.department)),
            ),
          );
    target.innerHTML =
      '<option value="">Belum dihubungkan ke akun</option>' +
      choices
        .map(
          (a) =>
            `<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.username)}</option>`,
        )
        .join("");
    if (choices.some((a) => a.id === old)) target.value = old;
  }
  function personalView() {
    featureData_("Tugas Saya", "personalData", state.query, (data) => {
      workUI.personal = data;
      const today = calendarDate_(new Date().toISOString());
      const dueLabel = (r) =>
        r.due
          ? `<span class="due-label ${r.due < today ? "is-overdue" : ""}">${r.due < today ? "Lewat tenggat · " : "Tenggat · "}${esc(date(r.due))}</span>`
          : '<span class="due-label">Tenggat belum ditetapkan</span>';
      const tasks = data.tasks.filter((t) => !t.done);
      $("#page").innerHTML =
        `<section class="personal-intro"><div><span class="eyebrow">AMANAH YANG ANDA PEGANG</span><h2>Selamat bekerja, ${esc(data.account.name)}.</h2><p>Periode ke-${esc(currentPeriod().name)} · ${esc(monthName(state.query.month))}</p></div><div class="personal-total"><strong>${tasks.length + data.issues.length + data.reports.length + (data.carried_tasks || []).length}</strong><span>pekerjaan terbuka</span></div></section>
        <div class="work-grid ${canUI("saveReport") || data.reports.length ? "" : "work-grid-single"}"><section class="panel"><div class="panel-head"><h2>Tugas acara</h2>${badge(tasks.length + " terbuka")}</div>${tasks.length ? tasks.map((t) => `<article class="work-item"><strong>${esc(t.name)}</strong><p>${esc(state.data.events.find((e) => e.id === t.event_id)?.name || "Acara OSDA")}</p>${dueLabel(t)}<div class="actions">${workButton("Tandai selesai", "my-task-done", t.id)}${button("Buka acara", "event-open", t.event_id)}</div></article>`).join("") : empty("Tugas acara tertata", "Belum ada tugas acara terbuka yang dihubungkan ke akun Anda.")}</section>
        ${canUI("saveReport") || data.reports.length ? `<section class="panel"><div class="panel-head"><h2>Laporan bidang yang perlu diisi</h2>${badge(data.reports.length + " program")}</div>${data.reports.length ? data.reports.map((p) => `<article class="work-item"><strong>${esc(p.name)}</strong><p>Bidang ${esc(p.department)} · ${esc(p.scope)}</p><span class="due-label">Penanggung jawab: bidang</span><div class="actions">${p.locked ? badge("Bulan sudah Final") : button("Isi rekap", "report", p.id)}</div></article>`).join("") : empty("Rekap bidang tertata", "Laporan bidang untuk bulan ini sudah tertata.")}</section>` : ""}</div>
        ${(data.carried_tasks || []).length ? `<section class="panel"><div class="panel-head"><h2>Tugas lanjutan serah terima</h2>${badge(data.carried_tasks.length + " terbuka")}</div>${data.carried_tasks.map((t) => `<article class="work-item"><div class="panel-head"><strong>${esc(t.name)}</strong>${badge(t.status)}</div><p>${esc(t.detail || "Pekerjaan dari periode sebelumnya.")}</p>${dueLabel(t)}<div class="actions">${workButton("Perbarui hasil", "my-carried-task", t.id)}</div></article>`).join("")}</section>` : ""}
        <section class="panel"><div class="panel-head"><h2>Tindak lanjut keputusan</h2>${badge(data.issues.length + " terbuka")}</div>${data.issues.length ? data.issues.map((i) => `<article class="work-item"><div class="panel-head"><strong>${esc(i.problem)}</strong>${badge(i.status)}</div><p>${esc(i.decision || "Keputusan belum diisi.")}</p>${dueLabel(i)}<div class="actions">${workButton("Perbarui hasil", "my-followup", i.id)}</div></article>`).join("") : empty("Belum ada tindak lanjut pribadi", "Keputusan yang ditugaskan kepada akun Anda akan muncul di sini.")}</section>
        <section class="panel"><div class="panel-head"><h2>Arahan mentor</h2>${button("Buka pembinaan", "page", "Pembinaan")}</div>${data.mentor_notes.length ? data.mentor_notes.map((n) => `<article class="mentor-note"><strong>${esc(state.data.programs.find((p) => p.id === n.program_id)?.name || "Program")}</strong><p class="prewrap">${esc(n.note)}</p><small>${esc(n.author_name)} · ${esc(monthName(n.month))}</small></article>`).join("") : empty("Arahan akan tersimpan di sini", "Catatan mentor untuk program dalam penugasan bidang Anda akan tampil di ruang ini.")}</section>
`;
    });
  }
  function calendarDate_(stamp) {
    if (!stamp) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return stamp;
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(stamp));
    const get = (t) => parts.find((p) => p.type === t).value;
    return get("year") + "-" + get("month") + "-" + get("day");
  }
  function calendarItems_() {
    const d = state.data,
      month = state.query.month,
      result = [];
    const add = (day, r, kind, label, action, id) => {
      if (day?.startsWith(month))
        result.push({
          day,
          scope: r.scope,
          kind,
          label,
          action,
          id,
          status: r.status || (r.done ? "Selesai" : "Terbuka"),
        });
    };
    d.events.forEach((e) => {
      const start = calendarDate_(e.starts_at),
        end = calendarDate_(e.ends_at || e.starts_at);
      if (!start) return;
      const last = new Date(month + "-01T12:00:00Z");
      last.setUTCMonth(last.getUTCMonth() + 1);
      last.setUTCDate(0);
      for (let day = 1; day <= last.getUTCDate(); day++) {
        const value = month + "-" + String(day).padStart(2, "0");
        if (value >= start && value <= end)
          add(value, e, "Acara", e.name, "event-open", e.id);
      }
    });
    d.meetings.forEach((m) =>
      add(m.date, m, "Rapat", m.name, "calendar-meeting", m.id),
    );
    d.tasks
      .filter((t) => !t.done)
      .forEach((t) =>
        add(t.due, t, "Tugas acara", t.name, "event-open", t.event_id),
      );
    d.issues
      .filter((i) => i.status !== "Selesai")
      .forEach((i) => add(i.due, i, "Tindak lanjut", i.problem, "issue", i.id));
    (d.requirements || [])
      .filter((r) => !r.not_required && !r.archive_id)
      .forEach((r) =>
        add(r.due, r, "Berkas acara", r.title, "event-open", r.event_id),
      );
    (d.carried_tasks || [])
      .filter((t) => t.status !== "Selesai")
      .forEach((t) =>
        add(t.due, t, "Lanjutan serah terima", t.name, "page", "Tugas Saya"),
      );
    return result.sort(
      (a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind),
    );
  }
  function calendarView() {
    const month = state.query.month,
      items = calendarItems_(),
      start = new Date(month + "-01T12:00:00Z"),
      last = new Date(start);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    const offset = (start.getUTCDay() + 6) % 7,
      length = Math.ceil((offset + last.getUTCDate()) / 7) * 7;
    if (!workUI.calendarDay.startsWith(month)) workUI.calendarDay = "";
    $("#page").innerHTML =
      `<div class="calendar-toolbar"><div><h2>${esc(monthName(month))}</h2><p>Acara, rapat, dan tenggat yang sudah ditetapkan.</p></div><div class="actions">${workButton("← Bulan sebelumnya", "calendar-prev")}${workButton("Bulan berikutnya →", "calendar-next")}</div></div><div class="calendar-legend">${["Santriwan", "Santriwati", "Bersama"].map((s) => `<span class="scope-color scope-${s.toLowerCase()}">${s}</span>`).join("")}</div><section class="calendar-sheet" aria-label="Kalender ${esc(monthName(month))}"><div class="calendar-weekdays">${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((n) => `<span>${n}</span>`).join("")}</div><div class="calendar-grid">${Array.from(
        { length },
        (_, i) => {
          const day = i - offset + 1;
          if (day < 1 || day > last.getUTCDate())
            return '<div class="calendar-cell outside" aria-hidden="true"></div>';
          const date = month + "-" + String(day).padStart(2, "0"),
            entries = items.filter((e) => e.day === date);
          return `<div class="calendar-cell ${workUI.calendarDay === date ? "selected" : ""}"><button type="button" class="calendar-day-number" data-workspace="calendar-day" data-id="${date}" aria-label="${esc(date)} · ${entries.length} agenda" aria-pressed="${workUI.calendarDay === date}">${day}</button><div class="calendar-entries">${entries
            .slice(0, 3)
            .map(
              (e) =>
                `<button type="button" class="calendar-entry scope-${e.scope.toLowerCase()}" data-workspace="calendar-day" data-id="${date}" title="${esc(e.kind + ": " + e.label)}"><span>${esc(e.label)}</span></button>`,
            )
            .join(
              "",
            )}${entries.length > 3 ? `<button type="button" class="calendar-more" data-workspace="calendar-day" data-id="${date}">+${entries.length - 3} agenda</button>` : ""}</div></div>`;
        },
      ).join(
        "",
      )}</div></section><section class="panel calendar-agenda"><div class="panel-head"><h2>${workUI.calendarDay ? esc(date(workUI.calendarDay)) : "Agenda bulan ini"}</h2>${workUI.calendarDay ? workButton("Lihat seluruh bulan", "calendar-day", "") : badge(items.length + " agenda")}</div>${(workUI.calendarDay ? items.filter((i) => i.day === workUI.calendarDay) : items).map((e) => `<article class="calendar-agenda-row"><span class="calendar-date-chip">${esc(e.day.slice(8))}<small>${esc(monthName(month).split(" ")[0])}</small></span><div><span class="scope-color scope-${e.scope.toLowerCase()}">${esc(e.scope)} · ${esc(e.kind)}</span><strong>${esc(e.label)}</strong></div>${e.action === "calendar-meeting" ? workButton("Baca rapat", "calendar-meeting", e.id) : button("Buka", e.action, e.id)}</article>`).join("") || empty("Belum ada agenda", "Acara tanpa tanggal dan program tanpa tenggat tetap tersedia pada halaman asalnya.")}</section>`;
  }
  function meetingAgenda_() {
    const agenda = state.data.monthly.agenda;
    return agenda.length
      ? agenda
      : [
          {
            title: "Rangkuman evaluasi",
            reason: "Belum ada bahan otomatis",
            detail:
              "Periksa capaian program, catat pembahasan, dan tetapkan tindak lanjut bersama.",
            scope: state.query.scope,
          },
        ];
  }
  function renderMeetingSlide_() {
    if (!state.data) return;
    const agenda = meetingAgenda_();
    workUI.meetingIndex = Math.max(
      0,
      Math.min(workUI.meetingIndex, agenda.length - 1),
    );
    const a = agenda[workUI.meetingIndex],
      p = state.data.programs.find((p) => p.id === a.program_id),
      issue = state.data.issues.find((i) => i.id === a.issue_id);
    const period = currentPeriod(),
      identity = state.data.identity || {};
    $("#meeting-institution").textContent =
      (identity.organization || "Organisasi Santri") +
      " · " +
      (identity.school || "Dayah Ruhul Qurani");
    $("#meeting-session-meta").textContent =
      monthName(state.query.month) + " · " + state.query.scope;
    $("#meeting-cabinet-name").textContent =
      period.cabinet_name || "Kepengurusan OSDA RQ";
    $("#meeting-period-label").textContent =
      "Periode ke-" +
      (period.name || "—") +
      (period.years ? " · " + period.years : "") +
      " · Putra & Putri";
    $("#meeting-mode").classList.toggle("is-intro", workUI.meetingIntro);
    $('[data-workspace="meeting-cover"]').hidden = workUI.meetingIntro;
    if (workUI.meetingIntro) {
      const count = state.data.monthly.agenda.length;
      const active = state.data.programs.filter((p) => p.active).length;
      const pending = state.data.issues.filter(
        (i) => i.status !== "Selesai",
      ).length;
      $("#meeting-slide").innerHTML =
        `<section class="meeting-intro" aria-labelledby="meeting-intro-title"><div class="meeting-intro-halo" aria-hidden="true"></div><div class="meeting-intro-layout"><div class="meeting-intro-copy"><span class="meeting-intro-kicker"><i aria-hidden="true"></i>FORUM RESMI KEPENGURUSAN</span><div class="meeting-intro-emblem">${$(".meeting-seal").innerHTML}</div><h3 id="meeting-intro-title" tabindex="-1">Musyawarah<br><em>&amp; Evaluasi Bulanan</em></h3><p class="meeting-intro-cabinet">${esc(period.cabinet_name || "Kepengurusan OSDA RQ")}</p><div class="meeting-intro-meta"><span>${esc(monthName(state.query.month))}</span><span>${esc(state.query.scope === "Semua" ? "Seluruh akses kepengurusan" : state.query.scope)}</span><span>OSDA RQ ke-${esc(period.name)}${period.years ? " · " + esc(period.years) : ""}</span></div><p class="meeting-intro-invitation">Meninjau pelaksanaan amanah, mendengarkan kendala, dan menyepakati langkah perbaikan bersama.</p><button type="button" class="button meeting-start" data-workspace="meeting-start">Mulai pembahasan ${symbol("arrow")}</button></div><aside class="meeting-intro-agenda" aria-label="Gambaran forum"><span class="eyebrow">ARAH MUSYAWARAH</span><h4>Satu forum.<br>Satu langkah bersama.</h4><ol><li><span>01</span><div><strong>Tinjau pelaksanaan</strong><small>Program dan laporan bidang</small></div></li><li><span>02</span><div><strong>Dengarkan kendala</strong><small>Perkembangan dan arahan mentor</small></div></li><li><span>03</span><div><strong>Sepakati tindak lanjut</strong><small>Keputusan dan tanggung jawab</small></div></li></ol><div class="meeting-intro-summary"><div><strong>${count}</strong><small>bahan evaluasi</small></div><div><strong>${active}</strong><small>program aktif</small></div><div><strong>${pending}</strong><small>tindak lanjut</small></div></div>${count ? "" : '<p class="meeting-intro-empty">Belum ada bahan otomatis. Pembahasan dapat dimulai dari rangkuman evaluasi.</p>'}</aside></div><span class="meeting-intro-footnote">DAYAH RUHUL QURANI · AMANAH DALAM KEBERSAMAAN</span></section>`;
      $("#meeting-position").textContent = "Pembukaan forum";
      $("#meeting-progress").setAttribute("max", String(agenda.length));
      $("#meeting-progress").setAttribute("value", "0");
      $('[data-workspace="meeting-prev"]').disabled = true;
      $('[data-workspace="meeting-next"]').disabled = false;
      $('[data-workspace="meeting-next"]').textContent = "Mulai pembahasan →";
      $("#meeting-slide").scrollTop = 0;
      return;
    }
    $('[data-workspace="meeting-next"]').textContent = "Berikutnya →";
    $("#meeting-slide").innerHTML =
      `<header class="meeting-agenda-heading"><div><div class="meeting-slide-meta">${badge(a.reason)}<span>${esc(a.department || "Seluruh bidang")} · ${esc(a.scope || state.query.scope)}</span></div><h3 tabindex="-1">${esc(a.title)}</h3></div><div class="meeting-agenda-number" aria-hidden="true"><small>BAHAN RAPAT</small><strong>${String(workUI.meetingIndex + 1).padStart(2, "0")}</strong></div></header>${p ? `<div class="meeting-metrics"><div><small>BIDANG PENANGGUNG JAWAB</small><strong>${esc(p.department)}</strong></div><div><small>PELAKSANAAN PROGRAM</small><strong>${esc(p.result.status)}</strong></div><div><small>LAPORAN BIDANG</small><strong>${p.report ? "Sudah dilaporkan" : "Belum dilaporkan"}</strong></div></div>` : ""}<div class="meeting-discussion"><section class="meeting-obstacles"><div class="meeting-discussion-heading"><span class="meeting-panel-number" aria-hidden="true">01</span><h4>KENDALA & PERKEMBANGAN</h4></div><p class="prewrap">${esc(p?.report?.implementation_notes || p?.report?.obstacles || issue?.problem || a.detail || "Belum ada catatan kendala.")}</p></section><section class="meeting-decisions"><div class="meeting-discussion-heading"><span class="meeting-panel-number" aria-hidden="true">02</span><h4>KEPUTUSAN & TINDAK LANJUT</h4></div><p class="prewrap">${esc(issue?.decision || "Keputusan belum dicatat.")}</p><p class="meeting-pic">${issue ? "Penanggung jawab: " + esc(issue.owner) + " · " + (issue.due ? esc(date(issue.due)) : "Jadwal tindak lanjut belum ditetapkan") : "Penanggung jawab dan jadwal tindak lanjut dicatat saat pembahasan."}</p></section></div><div class="meeting-slide-bottom"><span class="meeting-slide-note">Dengarkan dengan adab. Putuskan dengan musyawarah.</span><div class="actions">${issue ? button("Catat pembahasan / hasil", "issue", issue.id) : p ? button("Catat pembahasan", "issue-program", p.id) : button("Catat rapat", "meeting")}${p ? button("Buka rekap", "report", p.id) : ""}</div></div>`;
    $("#meeting-position").textContent =
      "Bahan " +
      String(workUI.meetingIndex + 1).padStart(2, "0") +
      " / " +
      String(agenda.length).padStart(2, "0");
    $("#meeting-progress").setAttribute("max", String(agenda.length));
    $("#meeting-progress").setAttribute(
      "value",
      String(workUI.meetingIndex + 1),
    );
    $("#meeting-slide").scrollTop = 0;
    $('[data-workspace="meeting-prev"]').disabled = false;
    $('[data-workspace="meeting-next"]').disabled =
      workUI.meetingIndex === agenda.length - 1;
  }
  function moveMeeting_(direction) {
    if (workUI.meetingIntro) {
      if (direction < 0) return;
      workUI.meetingIntro = false;
      workUI.meetingIndex = 0;
    } else if (direction < 0 && workUI.meetingIndex === 0) {
      workUI.meetingIntro = true;
    } else {
      const last = meetingAgenda_().length - 1;
      if (direction > 0 && workUI.meetingIndex >= last) return;
      workUI.meetingIndex = Math.max(
        0,
        Math.min(last, workUI.meetingIndex + direction),
      );
    }
    renderMeetingSlide_();
    $("#meeting-slide h3")?.focus();
  }
  function openFeatureEditor_(type, record, title, fields) {
    state.editor = {
      type,
      record: { ...record },
      id: record.id || clientId(),
      revision: Number(record.revision || 0),
    };
    $("#dialog-title").textContent = title;
    $("#form-fields").innerHTML = fields;
    $("#form-error").textContent = "";
    $("#save-button").hidden = false;
    $("#save-button").disabled = false;
    $("#save-button").textContent = "Simpan";
    $("#editor").showModal();
  }
  function handoverView() {
    featureData_("Serah Terima", "handoverData", state.query, (data) => {
      workUI.handovers = data;
      workUI.selectedHandover = null;
      const canCreate =
        state.data.access.is_admin || scopesFor("saveHandover").length;
      $("#page").innerHTML =
        `<div class="toolbar"><p>Catatan dari pengurus lama untuk melanjutkan amanah pada periode berikutnya.</p>${canCreate ? workButton("+ Susun serah terima", "handover-new") : ""}</div><div class="notice">Serah terima menyimpan salinan program aktif, tugas tertunda, daftar arsip, serta catatan pembinaan. Pengurus penerima meninjau dan menerima menggunakan akunnya sendiri.</div><div class="handover-grid">${data.items.map((r) => `<article class="panel handover-card"><div class="panel-head"><span class="eyebrow">${esc(r.scope)} · ${esc(r.department || "Seluruh bidang")}</span>${badge(r.status)}</div><h2>${esc(r.title)}</h2><p>Periode ke-${esc(data.periods.find((t) => t.id === r.term_id)?.name)} → ke-${esc(data.periods.find((t) => t.id === r.to_term_id)?.name)}</p><p class="muted">Penerima: ${esc(r.receiver_name)}</p><div class="actions">${workButton("Lihat rincian", "handover-open", r.id)}${r.can_edit ? workButton("Ubah draf", "handover-edit", r.id) : ""}</div></article>`).join("") || empty("Belum ada serah terima", "Pengurus lama dapat menyiapkan draf setelah periode dan akun penerima tersedia.")}</div><div id="handover-detail"></div>`;
    });
  }
  function handoverEditor_(r = {}) {
    const data = workUI.handovers,
      terms = data.periods.filter((t) => t.id !== state.query.term_id),
      scope =
        r.scope ||
        (scopesFor("saveHandover").includes(state.query.scope)
          ? state.query.scope
          : scopesFor("saveHandover")[0]);
    if (!terms.length) {
      toast("Tambahkan periode penerima melalui Pengaturan terlebih dahulu.");
      return;
    }
    const depts = departmentsFor("saveHandover"),
      broad =
        state.data.access.is_admin ||
        state.data.access.grants.some(
          (g) =>
            g.term_id === state.query.term_id &&
            !g.department &&
            !g.read_only &&
            g.actions.includes("saveHandover"),
        );
    const record = {
      ...r,
      term_id: state.query.term_id,
      to_term_id: r.to_term_id || terms[0].id,
      scope,
      department: r.department || (broad ? "" : depts[0]),
    };
    openFeatureEditor_(
      "handover",
      record,
      r.id ? "Ubah draf serah terima" : "Susun serah terima",
      field("Judul", "title", r.title || "Serah terima kepengurusan OSDA") +
        select(
          "Kepengurusan",
          "scope",
          record.scope,
          scopesFor("saveHandover"),
        ) +
        select("Bidang", "department", record.department, [
          ...(broad ? [{ value: "", label: "Seluruh bidang" }] : []),
          ...depts.map((d) => ({ value: d, label: d })),
        ]) +
        select(
          "Periode penerima",
          "to_term_id",
          record.to_term_id,
          terms.map((t) => ({ value: t.id, label: "Periode ke-" + t.name })),
        ) +
        select("Akun penerima", "receiver_id", r.receiver_id || "", [
          { value: "", label: "Memuat akun penerima…" },
        ]) +
        '<span id="receiver-loading" class="field-loading" role="status"></span>' +
        field(
          "Catatan untuk pengurus berikutnya",
          "notes",
          r.notes || "",
          "textarea",
          {
            max: 6000,
            help: "Cantumkan prioritas, kendala, lokasi berkas penting, dan hal yang perlu dilanjutkan.",
          },
        ),
    );
    loadHandoverReceivers_();
  }
  async function loadHandoverReceivers_() {
    const ed = state.editor;
    if (ed?.type !== "handover") return;
    const form = $("#editor-form"),
      input = form.elements.receiver_id,
      original = input.value || ed.record.receiver_id || "",
      stamp = ++workUI.receiverRequest || (workUI.receiverRequest = 1);
    input.disabled = true;
    $("#save-button").disabled = true;
    $("#receiver-loading").innerHTML = loadingIndicator_(
      "Memuat akun penerima…",
      "xs",
      false,
    );
    try {
      const result = await api("handoverData", {
        ...state.query,
        term_id: ed.record.term_id,
        to_term_id: form.elements.to_term_id.value,
        scope: form.elements.scope.value,
        department: form.elements.department.value,
      });
      if (state.editor !== ed || stamp !== workUI.receiverRequest) return;
      input.innerHTML =
        '<option value="">Pilih akun penerima</option>' +
        result.receivers
          .map(
            (a) =>
              `<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.username)}</option>`,
          )
          .join("");
      if (result.receivers.some((a) => a.id === original))
        input.value = original;
      $("#form-error").textContent = result.receivers.length
        ? ""
        : "Belum ada akun aktif dengan penugasan yang sesuai di periode penerima. Admin perlu menyiapkan penugasannya terlebih dahulu.";
    } catch (e) {
      if (state.editor === ed) $("#form-error").textContent = e.message;
    } finally {
      if (state.editor === ed && stamp === workUI.receiverRequest) {
        $("#receiver-loading").replaceChildren();
        input.disabled = false;
        $("#save-button").disabled = false;
      }
    }
  }
  async function openHandover_(id) {
    const stamp = requestStamp_("Serah Terima");
    $("#handover-detail").innerHTML = loadingPanel_(
      "Membuka rincian serah terima…",
    );
    let result;
    try {
      result = await api("handoverData", { ...state.query, id });
    } catch (e) {
      if (stampCurrent_(stamp))
        $("#handover-detail").innerHTML = empty(
          "Rincian belum dapat dimuat",
          e.message,
        );
      return;
    }
    if (!stampCurrent_(stamp)) return;
    workUI.selectedHandover = result;
    const r = result.record,
      snap = result.snapshot;
    $("#handover-detail").innerHTML =
      `<section class="panel handover-detail"><div class="panel-head"><div><span class="eyebrow">RINCIAN SERAH TERIMA</span><h2>${esc(r.title)}</h2></div>${badge(r.status)}</div><p class="prewrap">${esc(r.notes)}</p><div class="actions">${r.can_edit ? workButton("Serahkan & kunci catatan", "handover-submit", r.id) : ""}${r.can_accept ? workButton("Tinjau & terima", "handover-accept", r.id) : ""}${r.status === "Diterima" ? workButton("Salin program sebagai rencana nonaktif", "handover-carry", r.id) : ""}</div>${snap ? `<div class="handover-counts"><span><b>${snap.programs.length}</b> program aktif</span><span><b>${snap.issues.length + snap.tasks.length}</b> pekerjaan tertunda</span><span><b>${snap.archives.length}</b> arsip</span></div><h3>Program yang dilanjutkan</h3><div class="handover-programs">${snap.programs.map((p) => `<label class="check-field"><input type="checkbox" name="handover_program" value="${esc(p.id)}" checked><span>${esc(p.name)} · ${esc(p.department)}</span></label>`).join("") || '<p class="muted">Tidak ada program aktif dalam salinan.</p>'}</div><h3>Pekerjaan tertunda</h3>${[...snap.issues.map((i) => ({ name: i.problem, detail: i.decision, owner: i.owner, due: i.due })), ...snap.tasks.map((t) => ({ ...t, detail: "Tugas acara" }))].map((t) => `<article class="work-item"><strong>${esc(t.name)}</strong><p>${esc(t.detail || "Belum ada keputusan.")}</p><small>${esc(t.owner || "PIC belum ditetapkan")} · ${t.due ? esc(date(t.due)) : "Tenggat belum ditetapkan"}</small></article>`).join("") || '<p class="muted">Tidak ada pekerjaan tertunda dalam salinan.</p>'}<h3>Daftar arsip</h3>${snap.archives.map((a) => `<div class="handover-archive"><span>${esc(a.title)} · v${a.version}</span>${a.source_type === "link" ? link(a.url, "Buka tautan") : workButton("Unduh berkas", "handover-download", a.id)}</div>`).join("") || '<p class="muted">Belum ada arsip pada lingkup serah terima.</p>'}<h3>Catatan pembinaan</h3>${snap.mentor_notes.map((n) => `<article class="mentor-note"><p class="prewrap">${esc(n.note)}</p><small>${esc(n.author_name)} · ${esc(n.month)}</small></article>`).join("") || '<p class="muted">Belum ada catatan pembinaan.</p>'}<p class="muted">Diserahkan oleh ${esc(r.submitted_name)} · ${esc(date(r.submitted_at, true))}${r.accepted_at ? " · Diterima oleh " + esc(r.accepted_name) + " · " + esc(date(r.accepted_at, true)) : ""}</p>${r.acceptance_notes ? `<p class="prewrap">Catatan penerima: ${esc(r.acceptance_notes)}</p>` : ""}` : '<p class="muted">Daftar program, tugas, dan arsip akan dibekukan saat draf diserahkan.</p>'}</section>`;
  }
  function visiblePrograms_() {
    return state.data.programs.filter(
      (p) =>
        (!workUI.programDepartment ||
          p.department === workUI.programDepartment) &&
        (!workUI.programFrequency || p.frequency === workUI.programFrequency),
    );
  }
  function updateProgramSelection_() {
    const count = visiblePrograms_().filter((p) =>
      workUI.programSelection.has(p.id),
    ).length;
    if ($("#program-selection-count"))
      $("#program-selection-count").textContent = count + " program dipilih";
    const button = $('[data-workspace="program-print"]');
    if (button) button.disabled = !count;
  }
  function programsView_() {
    document.body.classList.remove("view-report");
    const key = state.query.term_id + "|" + state.query.scope;
    if (workUI.programContext !== key || !workUI.programSelection) {
      workUI.programContext = key;
      workUI.programSelection = new Set(state.data.programs.map((p) => p.id));
      workUI.programDepartment = "";
      workUI.programFrequency = "";
    }
    const list = visiblePrograms_(),
      departments = [...new Set(state.data.programs.map((p) => p.department))];
    $("#page").innerHTML =
      `<div class="toolbar"><p>Program menjadi tanggung jawab bidang. Pilih program untuk dicetak sebagai dokumen formal.</p><div class="toolbar-actions">${workButton("Cetak program terpilih / PDF", "program-print")}${button("+ Program kerja", "program", "", "")}${scopesFor("saveProgram").length ? button("Impor Excel", "page", "Impor Data") : ""}</div></div><section class="panel program-selection"><div class="field-pair">${select("Bidang", "program_department", workUI.programDepartment, [{ value: "", label: "Semua bidang yang dapat diakses" }, ...departments], { required: false })}${select("Jenis program", "program_frequency", workUI.programFrequency, [{ value: "", label: "Semua jenis" }, "Harian", "Mingguan", "Bulanan", "Tahunan"], { required: false })}</div><div class="actions">${workButton("Pilih semua yang tampil", "program-select-all")}${workButton("Kosongkan pilihan", "program-select-none")}<strong id="program-selection-count"></strong></div></section>${list.length ? table(["Pilih", "Program", "Jenis / jadwal", "Bidang penanggung jawab", "Pelaksanaan", "Catatan", "Tindakan"], programRows(list, true)) : empty("Belum ada program pada pilihan ini", "Tambahkan program satu per satu atau unggah Excel melalui Impor Data.")}`;
    applyDataLayout_();
    updateProgramSelection_();
    mountProgramDelete_();
  }
  function programPrintView_() {
    const selected = visiblePrograms_().filter((p) =>
      workUI.programSelection.has(p.id),
    );
    if (!selected.length) {
      toast("Pilih program yang akan dicetak.");
      return;
    }
    const identity = state.data.identity || {},
      period = currentPeriod(),
      logo = $(".brand img")?.getAttribute("src"),
      groups = new Map();
    selected.forEach((p) => {
      const key = p.scope + "|" + p.department;
      if (!groups.has(key))
        groups.set(key, {
          scope: p.scope,
          department: p.department,
          programs: [],
        });
      groups.get(key).programs.push(p);
    });
    const paragraphs = (values) =>
      [...new Set(values.filter(Boolean))]
        .map(
          (t) =>
            `<ol class="program-policy-list">${t
              .split(/\r?\n/)
              .filter((v) => v.trim())
              .map((v) => `<li>${esc(v)}</li>`)
              .join("")}</ol>`,
        )
        .join("");
    const pages = [...groups.values()]
      .map((group) => {
        const roles = [
          ...new Set(group.programs.map((p) => p.formatur_role || "")),
        ];
        return `<article class="monthly-report formal-report program-print-document"><header class="report-letterhead">${logo ? `<img src="${esc(logo)}" alt="Logo OSDA RQ">` : "<span></span>"}<div><strong>${esc((identity.organization || "Organisasi Santri").toUpperCase())}</strong><h2>${esc(identity.school || "DAYAH RUHUL QURANI")}</h2><b>OSDA RQ KE-${esc(period.name)}${period.cabinet_name ? " · KABINET " + esc(period.cabinet_name) : ""}</b><address>${esc(identity.address || "")}</address>${[identity.phone, identity.email, identity.website].some(Boolean) ? `<small>${[identity.phone, identity.email, identity.website].filter(Boolean).map(esc).join(" · ")}</small>` : ""}</div><span class="letterhead-balance" aria-hidden="true"></span></header><div class="formal-report-title"><h2>PROGRAM KERJA ${esc(group.department.toUpperCase())}</h2><p>${esc(group.scope.toUpperCase())} · MASA BAKTI ${esc(period.years || period.name)}</p></div><p>Penanggung jawab: <strong>${esc(group.department)}</strong>. Dokumen memuat ${group.programs.length} program yang dipilih.</p>${roles
          .map((role) => {
            const items = group.programs.filter(
              (p) => (p.formatur_role || "") === role,
            );
            return `<section class="program-role-section">${role ? `<h3>${esc(role.toUpperCase())}</h3>` : ""}${[
              "Harian",
              "Mingguan",
              "Bulanan",
              "Tahunan",
            ]
              .map((f) => {
                const list = items.filter((p) => p.frequency === f);
                return list.length
                  ? `<section class="report-section"><h3>PROGRAM ${f.toUpperCase()}</h3>${table(
                      ["No.", "Program kerja", "Tujuan / pola pelaksanaan"],
                      list.map(
                        (p, i) =>
                          `<tr><td>${i + 1}</td><td><strong>${esc(p.name)}</strong>${p.active ? "" : "<small>Rencana nonaktif</small>"}</td><td class="prewrap">${esc(p.objective || "—")}${p.schedule ? `<small>Jadwal: ${esc(p.schedule)}</small>` : ""}${p.scheduled_month ? `<small>Bulan rencana: ${esc(monthName(p.scheduled_month))}</small>` : ""}</td></tr>`,
                      ),
                    )}</section>`
                  : "";
              })
              .join(
                "",
              )}${items.some((p) => p.rules) ? `<section class="report-section"><h3>TURUNAN ATURAN</h3>${paragraphs(items.map((p) => p.rules))}</section>` : ""}${items.some((p) => p.appreciation) ? `<section class="report-section"><h3>TURUNAN APRESIASI</h3>${paragraphs(items.map((p) => p.appreciation))}</section>` : ""}</section>`;
          })
          .join(
            "",
          )}<p class="report-place">${esc(identity.city || "Meulaboh")}, ${esc(date(calendarDate_(new Date().toISOString())))}</p><div class="formal-signatures program-signatures"><div>Mengetahui,<br>${group.department === "Formatur" ? "Mentor OSDA" : "Mentor Bidang"}<br><br><br><br>( ________________________ )</div><div>Penanggung jawab,<br>${group.department === "Formatur" ? "Ketua OSDA" : "Ketua Bidang " + esc(group.department)}<br><br><br><br>( ________________________ )</div></div><p class="report-provenance">Disusun dari data program OSDA RQ · ${esc(date(state.data.generated_at, true))}</p></article>`;
      })
      .join("");
    document.body.classList.add("view-report");
    $("#page").innerHTML =
      `<div class="toolbar"><p>Pratinjau ${selected.length} program. Pilih Simpan sebagai PDF pada dialog cetak.</p><div class="toolbar-actions">${workButton("Kembali ke pilihan program", "program-back")}${button("Cetak / simpan PDF", "print", "", "")}</div></div>${pages}`;
  }
  function importView() {
    state.importPreview = null;
    workUI.importSheet = "";
    const types = [
      ...(scopesFor("saveMember").length
        ? [{ value: "members", label: "Pengurus" }]
        : []),
      ...(scopesFor("saveProgram").length
        ? [{ value: "programs", label: "Program kerja" }]
        : []),
    ];
    if (!types.length) {
      $("#page").innerHTML = empty(
        "Impor tidak tersedia",
        "Akun Anda tidak memiliki kewenangan menambahkan pengurus atau program.",
      );
      return;
    }
    $("#page").innerHTML =
      `<section class="panel import-panel"><span class="eyebrow">UNGGAH · PERIKSA · SIMPAN</span><h2>Tambahkan data sekaligus</h2><p>Unggah tabel per baris atau format kolom Harian–Mingguan–Bulanan–Tahunan, termasuk blok Formatur. Maksimal 300 program per lembar, 2 MB per file. Periksa hasil sebelum menyimpan.</p><div class="field-pair">${select("Jenis data", "import_type", types[0].value, types)}${select("Kepengurusan", "import_scope", state.query.scope === "Semua" ? "Santriwan" : state.query.scope, scopesFor(types[0].value === "members" ? "saveMember" : "saveProgram"))}</div><div class="program-import-options"><div class="field-pair">${select("Bidang untuk file tanpa kolom bidang", "import_department", departmentsFor("saveProgram").length === 1 ? departmentsFor("saveProgram")[0] : "", [{ value: "", label: "Pilih bidang; blok Formatur dikenali otomatis" }, ...departmentsFor("saveProgram")], { required: false })}${select("Jenis jika tidak tertulis pada tabel", "import_frequency", "", [{ value: "", label: "Ikuti isi file" }, "Harian", "Mingguan", "Bulanan", "Tahunan"], { required: false })}</div><details><summary>Format tabel lain: petakan kolom</summary><p>Untuk tabel satu program per baris. Pilih nomor baris judul, kemudian posisi kolom. Kosongkan untuk pembacaan otomatis.</p>${field("Baris judul kolom", "import_header", "1", "number")}<div class="field-pair">${[
        ["nama", "Nama program"],
        ["bidang", "Bidang"],
        ["frekuensi", "Jenis program"],
        ["jadwal", "Jadwal"],
        ["tujuan", "Tujuan"],
      ]
        .map(([key, label]) =>
          select(
            label,
            "map_" + key,
            "",
            [
              { value: "", label: "Otomatis / tidak ada" },
              ...Array.from({ length: 21 }, (_, i) => ({
                value: String(i + 1),
                label: String.fromCharCode(65 + i),
              })),
            ],
            { required: false },
          ),
        )
        .join(
          "",
        )}</div></details></div><div class="actions">${workButton("Unduh template Excel", "import-template-xlsx")}${workButton("Unduh template CSV", "import-template-csv")}${workButton("Template kolom Harian–Tahunan", "import-template-matrix-xlsx")}</div><label class="field">File CSV / Excel .xlsx<input id="import-file" type="file" accept=".csv,.xlsx"></label><details class="import-paste"><summary>Atau tempel isi CSV</summary><textarea id="import-paste" rows="5" placeholder="Tempel header dan data CSV di sini"></textarea></details><div class="notice">Baris yang sudah ada akan dilewati. Impor ini menambahkan data; akun login dibuat melalui Akun & Akses.</div><p id="import-error" class="form-error" role="alert"></p>${workButton("Periksa & tampilkan pratinjau", "import-preview")}</section><div id="import-result"></div>`;
  }
  function clearImportPreview_() {
    state.importPreview = null;
    if ($("#import-result")) $("#import-result").replaceChildren();
  }
  async function previewImportUI_() {
    clearImportPreview_();
    const type = $('[name="import_type"]').value,
      scope = $('[name="import_scope"]').value,
      file = $("#import-file").files?.[0],
      paste = $("#import-paste").value;
    $("#import-error").textContent = "";
    $("#import-result").innerHTML = loadingPanel_(
      "Membaca dan memeriksa file…",
    );
    try {
      let upload;
      if (file) upload = await filePayload(file);
      else if (paste.trim())
        upload = {
          file_name: "tempel.csv",
          file_base64: btoa(unescape(encodeURIComponent(paste))),
        };
      else throw Error("Pilih file atau tempel isi CSV terlebih dahulu.");
      const query = JSON.stringify(state.query),
        stamp = ++workUI.importRequest || (workUI.importRequest = 1);
      const data = await api("previewImport", {
        type,
        term_id: state.query.term_id,
        scope,
        department: $('[name="import_department"]').value,
        default_frequency: $('[name="import_frequency"]').value,
        header_row: $('[name="import_header"]').value,
        column_map: Object.fromEntries(
          ["nama", "bidang", "frekuensi", "jadwal", "tujuan"].map((k) => [
            k,
            $('[name="map_' + k + '"]').value,
          ]),
        ),
        sheet_name: workUI.importSheet,
        ...upload,
      });
      if (
        state.page !== "Impor Data" ||
        query !== JSON.stringify(state.query) ||
        stamp !== workUI.importRequest
      )
        return;
      state.importPreview = data;
      $("#import-result").innerHTML =
        `<section class="panel"><div class="panel-head"><h2>Hasil pemeriksaan</h2>${badge(data.errors ? "Perlu diperbaiki" : "Siap")}</div><p>${esc(data.detected_format || "Tabel")} · ${esc(data.sheet_name || "CSV")}</p>${data.sheets?.length > 1 ? select("Lembar yang akan diimpor", "import_sheet", data.sheet_name, data.sheets) : ""}<p>${esc(data.notice || "")}</p><p>${data.ready} baris siap · ${data.duplicates} duplikat dilewati · ${data.errors} perlu diperbaiki.</p>${table(
          [
            "Sel / baris",
            "Program",
            "Bidang / bagian",
            "Jenis",
            "Status",
            "Catatan",
          ],
          data.results.map(
            (r) =>
              `<tr><td>${r.row}</td><td>${esc(r.name)}</td><td>${esc(r.department || "")}<small>${esc(r.section || "")}</small></td><td>${esc(r.frequency || "")}</td><td>${badge(r.status)}</td><td>${esc(r.message)}</td></tr>`,
          ),
        )}${data.ready && !data.errors ? workButton("Simpan " + data.ready + " baris baru", "import-commit") : ""}</section>`;
    } catch (e) {
      if ($("#import-result")) $("#import-result").replaceChildren();
      if ($("#import-error")) $("#import-error").textContent = e.message;
    }
  }
  function backupView() {
    featureData_("Cadangan", "backupData", null, (data) => {
      workUI.backup = data;
      workUI.inspection = null;
      $("#page").innerHTML =
        `<section class="panel backup-intro"><div class="panel-head"><div><span class="eyebrow">KELANGSUNGAN DATA ORGANISASI</span><h2>Cadangan & pemulihan</h2></div>${workButton("Buat cadangan sekarang", "backup-create")}</div><p>Cadangan menyimpan database organisasi dan indeks arsip. Berkas asli Drive tetap di folder asal; akun, hak akses, dan sesi dikelola terpisah.</p><div class="backup-schedule"><div><strong>Cadangan terjadwal</strong><p>${data.schedule.mode === "off" ? "Belum diaktifkan" : (data.schedule.mode === "daily" ? "Setiap hari" : "Setiap 7 hari") + " · " + esc(data.schedule.window || "02.00–03.00 WIB") + " · " + (data.schedule.active ? "Aktif" : "Pemicu perlu diperiksa")}</p>${data.schedule.last_success ? `<small>Terakhir berhasil: ${esc(date(data.schedule.last_success, true))}</small>` : ""}</div><div class="actions">${workButton("Harian", "backup-daily")}${workButton("Mingguan", "backup-weekly")}${workButton("Nonaktifkan", "backup-off")}</div></div>${data.schedule.last_error ? `<p class="form-error">Cadangan terakhir belum berhasil: ${esc(data.schedule.last_error)}</p>` : ""}</section><section class="panel"><h2>Cadangan tersimpan</h2>${
          data.items.length
            ? table(
                ["Waktu & keterangan", "Isi", "Pengelola", "Tindakan"],
                data.items.map(
                  (r) =>
                    `<tr><td>${esc(date(r.created_at, true))}<small>${esc(r.reason)}</small></td><td>${r.row_count} baris<small>${Math.ceil(r.size_bytes / 1024)} KB</small></td><td>${esc(r.created_name)}</td><td>${workButton("Periksa cadangan", "backup-inspect", r.id)}</td></tr>`,
                ),
              )
            : empty(
                "Belum ada cadangan",
                "Buat cadangan pertama untuk menyimpan kondisi database saat ini.",
              )
        }</section><div id="backup-inspection"></div>${data.recoveries.length ? `<section class="panel"><h2>Riwayat pemulihan</h2>${data.recoveries.map((r) => `<article class="work-item"><strong>${esc(date(r.at, true))} · ${esc(r.actor_name)}</strong><p>${esc(r.reason)}</p></article>`).join("")}</section>` : ""}${data.previous_db_id ? `<div class="notice">Database sebelum pemulihan tetap tersedia. ${link("https://docs.google.com/spreadsheets/d/" + data.previous_db_id, "Buka database sebelumnya")}</div>` : ""}`;
    });
  }
  async function inspectBackupUI_(id) {
    const stamp = requestStamp_("Cadangan");
    $("#backup-inspection").innerHTML = loadingPanel_(
      "Memeriksa integritas cadangan…",
    );
    let data;
    try {
      data = await api("inspectBackup", { id });
    } catch (e) {
      if (stampCurrent_(stamp))
        $("#backup-inspection").innerHTML = empty(
          "Cadangan belum dapat diperiksa",
          e.message,
        );
      return;
    }
    if (!stampCurrent_(stamp)) return;
    workUI.inspection = data;
    $("#backup-inspection").innerHTML =
      `<section class="panel"><span class="eyebrow">PEMERIKSAAN BERHASIL</span><h2>Cadangan ${esc(date(data.created_at, true))}</h2><p>Integritas dan hubungan data sudah diperiksa. Terdapat ${data.inventory_count} referensi berkas; pemeriksaan ini tidak menyalin atau memeriksa isi setiap berkas Drive.</p>${table(
        ["Tabel", "Jumlah baris"],
        data.counts.map(
          (c) => `<tr><td>${esc(c.table)}</td><td>${c.rows}</td></tr>`,
        ),
      )}<div class="notice">Pemulihan menyiapkan database baru, membuat cadangan kondisi terkini, dan mempertahankan database sebelumnya. Semua pengguna perlu login kembali setelah pemulihan.</div>${workButton("Siapkan pemulihan", "backup-restore", data.id)}</section>`;
  }
  function downloadWorkFile_(name, content, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function workspaceMutation_(method, arg, after) {
    if (state.saving) return;
    state.saving = true;
    try {
      const result = await api(method, arg);
      if (after) await after(result);
      else {
        toast("Perubahan tersimpan.");
        await load();
      }
    } catch (e) {
      toast(e.message);
    } finally {
      state.saving = false;
    }
  }
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-workspace]");
    if (!target || state.saving || loadingUI.buttons.has(target)) return;
    const action = target.dataset.workspace,
      id = target.dataset.id;
    const finish = [
      "my-task-done",
      "handover-open",
      "handover-submit",
      "handover-carry",
      "handover-download",
      "import-preview",
      "import-commit",
      "backup-create",
      "backup-daily",
      "backup-weekly",
      "backup-off",
      "backup-inspect",
    ].includes(action)
      ? beginButtonLoading_(
          target,
          action === "import-preview" || action === "backup-inspect"
            ? "Memeriksa…"
            : "Memproses…",
        )
      : () => {};
    try {
      if (action === "program-print") programPrintView_();
      else if (action === "program-back") programsView_();
      else if (action === "program-select-all") {
        visiblePrograms_().forEach((p) => workUI.programSelection.add(p.id));
        programsView_();
      } else if (action === "program-select-none") {
        visiblePrograms_().forEach((p) => workUI.programSelection.delete(p.id));
        programsView_();
      } else if (action === "layout") {
        workUI.layouts[state.page] = id;
        workspaceAfterRender_();
      } else if (action === "calendar-meeting") {
        const r = state.data.meetings.find((m) => m.id === id);
        if (!r) throw Error("Rapat tidak ditemukan.");
        openFeatureEditor_(
          "meeting-read",
          r,
          r.name,
          `<p class="muted">${esc(date(r.date))} · ${esc(r.scope)} · Evaluasi ${esc(monthName(r.month))}</p><h3>Peserta</h3><p class="prewrap">${esc(r.participants)}</p><h3>Notulen</h3><p class="prewrap">${esc(r.notes || "Notulen belum diisi.")}</p>`,
        );
        $("#save-button").hidden = true;
      } else if (action === "calendar-day") {
        workUI.calendarDay = id;
        calendarView();
      } else if (action === "calendar-prev" || action === "calendar-next") {
        const d = new Date(state.query.month + "-15T12:00:00Z");
        d.setUTCMonth(d.getUTCMonth() + (action === "calendar-prev" ? -1 : 1));
        state.query.month = d.toISOString().slice(0, 7);
        await load();
      } else if (action === "meeting-open") {
        workUI.meetingIndex = 0;
        workUI.meetingIntro = true;
        renderMeetingSlide_();
        document.body.classList.add("meeting-active");
        $("#meeting-mode").showModal();
        $("#meeting-intro-title")?.focus();
      } else if (action === "meeting-close") {
        $("#meeting-mode").close();
        document.body.classList.remove("meeting-active");
      } else if (action === "meeting-start") {
        moveMeeting_(1);
      } else if (action === "meeting-cover") {
        workUI.meetingIntro = true;
        renderMeetingSlide_();
        $("#meeting-intro-title")?.focus();
      } else if (action === "meeting-prev" || action === "meeting-next") {
        moveMeeting_(action === "meeting-prev" ? -1 : 1);
      } else if (action === "my-task-done") {
        const r = workUI.personal.tasks.find((t) => t.id === id);
        await workspaceMutation_("setMyTaskDone", {
          id,
          revision: r.revision,
          done: true,
        });
      } else if (action === "my-followup" || action === "my-carried-task") {
        const carried = action === "my-carried-task";
        const r = (
          carried ? workUI.personal.carried_tasks : workUI.personal.issues
        ).find((t) => t.id === id);
        openFeatureEditor_(
          carried ? "carried-task" : "my-followup",
          r,
          "Perbarui hasil tindak lanjut",
          `<div class="notice">${esc(r.problem || r.name)}</div>` +
            select("Status", "status", r.status, [
              "Terbuka",
              "Diproses",
              "Menunggu pemeriksaan",
              "Selesai",
            ]) +
            field(
              "Hasil tindak lanjut",
              "resolution",
              r.resolution || "",
              "textarea",
              { required: false },
            ),
        );
      } else if (action === "handover-new") handoverEditor_();
      else if (action === "handover-edit")
        handoverEditor_(workUI.handovers.items.find((r) => r.id === id));
      else if (action === "handover-open") await openHandover_(id);
      else if (action === "handover-submit") {
        const r = workUI.selectedHandover.record;
        await workspaceMutation_(
          "submitHandover",
          { id, revision: r.revision },
          async () => {
            await load();
            toast(
              "Serah terima diserahkan. Buka rincian untuk melihat salinan tetapnya.",
            );
          },
        );
      } else if (action === "handover-accept") {
        const r = workUI.selectedHandover.record;
        openFeatureEditor_(
          "handover-accept",
          r,
          "Terima serah terima",
          '<div class="notice">Penerimaan dicatat atas nama akun Anda. Tinjau daftar program, pekerjaan tertunda, dan arsip sebelum menyimpan.</div>' +
            field("Catatan penerima", "notes", "", "textarea"),
        );
      } else if (action === "handover-carry") {
        const program_ids = [
          ...document.querySelectorAll('[name="handover_program"]'),
        ]
          .filter((e) => e.checked)
          .map((e) => e.value);
        await workspaceMutation_(
          "carryHandoverPrograms",
          { id, program_ids },
          async (r) => {
            toast(
              r.record.created +
                " rencana nonaktif ditambahkan. Tinjau PIC dan jadwal pada periode penerima.",
            );
            await load();
          },
        );
      } else if (action === "handover-download") {
        const f = await api("downloadHandoverArchive", {
          id: workUI.selectedHandover.record.id,
          archive_id: id,
        });
        downloadWorkFile_(
          f.name,
          Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)),
          "application/octet-stream",
        );
      } else if (action === "import-preview") {
        target.disabled = true;
        try {
          await previewImportUI_();
        } finally {
          target.disabled = false;
        }
      } else if (action === "import-commit") {
        const preview = state.importPreview;
        if (!preview) throw Error("Periksa file terlebih dahulu.");
        await workspaceMutation_("commitImport", preview, async (r) => {
          toast(
            r.record.created +
              " baris ditambahkan; " +
              r.record.skipped +
              " duplikat dilewati.",
          );
          clearImportPreview_();
          await load();
        });
      } else if (action.startsWith("import-template-")) {
        const type = $('[name="import_type"]').value,
          t =
            IMPORT_XLSX_TEMPLATES[action.includes("matrix") ? "matrix" : type];
        if (action.endsWith("xlsx"))
          downloadWorkFile_(
            t.name,
            Uint8Array.from(atob(t.base64), (c) => c.charCodeAt(0)),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          );
        else
          downloadWorkFile_(
            t.name.replace(/\.xlsx$/, ".csv"),
            "\uFEFF" + t.columns.join(",") + "\r\n",
            "text/csv;charset=utf-8",
          );
      } else if (action === "backup-create")
        await workspaceMutation_("createBackup", {
          reason: "Cadangan manual dari ruang pengurus",
        });
      else if (
        action.startsWith("backup-") &&
        ["daily", "weekly", "off"].includes(action.slice(7))
      )
        await workspaceMutation_("setBackupSchedule", {
          mode: action.slice(7),
        });
      else if (action === "backup-inspect") {
        target.disabled = true;
        try {
          await inspectBackupUI_(id);
        } finally {
          target.disabled = false;
        }
      } else if (action === "backup-restore") {
        const r = workUI.inspection;
        if (!r || r.id !== id) throw Error("Periksa cadangan terlebih dahulu.");
        openFeatureEditor_(
          "backup-restore",
          r,
          "Pulihkan database organisasi",
          '<div class="notice">Database baru disiapkan dari cadangan yang telah diperiksa. Database lama dipertahankan dan semua sesi login akan diakhiri.</div>' +
            field("Alasan pemulihan", "reason", "", "textarea") +
            field("Ketik PULIHKAN", "confirm", ""),
        );
      }
    } catch (e) {
      toast(e.message);
    } finally {
      finish();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset.programSelect) {
      const id = event.target.dataset.programSelect;
      if (event.target.checked) workUI.programSelection.add(id);
      else workUI.programSelection.delete(id);
      updateProgramSelection_();
      return;
    }
    if (
      ["program_department", "program_frequency"].includes(event.target.name)
    ) {
      workUI.programDepartment = $('[name="program_department"]').value;
      workUI.programFrequency = $('[name="program_frequency"]').value;
      programsView_();
      return;
    }
    if (event.target.name === "import_sheet") {
      workUI.importSheet = event.target.value;
      clearImportPreview_();
      return;
    }
    if (event.target.id === "import-file") workUI.importSheet = "";

    if (event.target.closest("#editor-form")) {
      if (["scope", "department", "to_department"].includes(event.target.name))
        refreshAssignmentChoices_();
      if (
        state.editor?.type === "handover" &&
        ["scope", "department", "to_term_id"].includes(event.target.name)
      )
        loadHandoverReceivers_();
    }
    if (event.target.closest(".import-panel")) {
      clearImportPreview_();
      workUI.importRequest = (workUI.importRequest || 0) + 1;
      if (event.target.name === "import_type") {
        const scopes = scopesFor(
          event.target.value === "members" ? "saveMember" : "saveProgram",
        );
        $('[name="import_scope"]').innerHTML = scopes
          .map((s) => `<option>${esc(s)}</option>`)
          .join("");
      }
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "import-paste") {
      clearImportPreview_();
      workUI.importRequest = (workUI.importRequest || 0) + 1;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (
      !$("#meeting-mode").hasAttribute("open") ||
      $("#editor").hasAttribute("open") ||
      /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
    )
      return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveMeeting_(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  document
    .querySelector("#meeting-mode")
    .addEventListener("close", () =>
      document.body.classList.remove("meeting-active"),
    );
  document
    .querySelector("#meeting-mode")
    .addEventListener("cancel", () =>
      document.body.classList.remove("meeting-active"),
    );
const revisionUI = { request: 0, context: null, loadedAt: 0, offset: 0 };
  function implementationOptions_() {
    return [
      "Terlaksana dengan baik",
      "Terlaksana, perlu perbaikan",
      "Belum terlaksana",
      "Tidak dijadwalkan",
    ];
  }
  function resetRevisionUI_() {
    revisionUI.request++;
    revisionUI.context = null;
    revisionUI.loadedAt = 0;
    $("#sidebar-cabinet")?.remove();
  }
  function renderCabinetIdentity_() {
    if (!state.data) return;
    const period = currentPeriod(),
      name = period.cabinet_name || "",
      brand = $(".topbar-brand strong");
    brand.textContent = name ? "OSDA RQ · " + name : "Ruang kerja OSDA RQ";
    brand.title = name
      ? "Kabinet " + name + " · Periode ke-" + period.name
      : "OSDA RQ";
    let label = $("#sidebar-cabinet");
    if (!label) {
      label = document.createElement("div");
      label.id = "sidebar-cabinet";
      label.className = "sidebar-cabinet";
      $(".brand").insertAdjacentElement("afterend", label);
    }
    label.innerHTML = `<span>KABINET · OSDA KE-${esc(period.name)}</span><strong>${esc(name || "Nama kabinet belum ditetapkan")}</strong><small>Satu kabinet · Putra &amp; Putri</small>`;
    label.title =
      (name || "Nama kabinet belum ditetapkan") +
      " · Periode ke-" +
      period.name;
    if (state.page === "Ringkasan") {
      const copy = $(".overview-copy");
      if (copy)
        copy.innerHTML = `<span class="eyebrow">SATU KABINET · PUTRA &amp; PUTRI</span><h2 class="cabinet-wordmark">${esc(name || "OSDA RQ ke-" + period.name)}</h2><p>${canUI("saveReport") ? "Pantau program dan catat pelaksanaan sesuai amanah Anda." : canUI("saveMentorNote") ? "Tinjau pelaksanaan program dan sampaikan arahan untuk bidang dampingan Anda." : "Baca perkembangan program dan catatan kepengurusan."}</p><div class="overview-actions">${button(canUI("saveReport") ? "Isi rekap program" : "Tinjau program", "page", "Program Kerja", "")}${canUI("saveMentorNote") && !canUI("saveReport") ? button("Tulis arahan", "page", "Pembinaan") : button("Laporan bulanan", "page", "Laporan Bulanan")}${state.data.access.is_admin ? button("Atur kabinet", "period-edit", period.id) : ""}</div>`;
    }
  }
  function weatherSymbol_(code) {
    const rainy = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(
      Number(code),
    );
    return `<svg viewBox="0 0 80 64" fill="none" aria-hidden="true"><circle cx="47" cy="22" r="14" fill="#e9cd8d"/><path d="M47 2V0m20 22h8M61 8l5-5M27 22h-7M33 8l-5-5" stroke="#b18d4c" stroke-width="2" stroke-linecap="round"/><path d="M18 45a11 11 0 0 1 0-22 16 16 0 0 1 30-1 12 12 0 0 1 7 23z" fill="#b6d2df" stroke="#5c879e" stroke-width="1.5"/>${rainy ? '<path d="m24 50-4 8m19-8-4 8m19-8-4 8" stroke="#417f9b" stroke-width="3" stroke-linecap="round"/>' : ""}</svg>`;
  }
  function nextOsdaEvent_() {
    return (
      state.data.events
        .filter(
          (e) =>
            e.starts_at &&
            Date.parse(e.starts_at) > Date.now() &&
            !["Selesai", "Dibatalkan", "Ditunda"].includes(e.status),
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] || null
    );
  }
  function dashboardServiceHTML_(data) {
    const identity = state.data.identity || {},
      weather = data?.weather,
      prayer = data?.prayer,
      event = nextOsdaEvent_();
    const value = (n, unit = "") =>
      n === null || n === undefined ? "—" : Math.round(n) + unit;
    return `<section class="weather-widget"><div class="service-heading"><div><span class="eyebrow">PRAKIRAAN CUACA</span><h2>${esc(data?.location || identity.city || "Meulaboh")}</h2></div><span class="service-orbit" aria-hidden="true">✦</span></div>${weather ? `<div class="weather-current">${weatherSymbol_(weather.code)}<div><strong>${value(weather.temperature, "°")}<small>C</small></strong><p>${esc(weather.label)}</p><span>Kelembapan ${value(weather.humidity, "%")}</span></div></div><div class="weather-days">${weather.days.map((d) => `<div><span>${d.date === data.day ? "Hari ini" : esc(new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" }).format(new Date(d.date + "T12:00:00Z")))}</span>${weatherSymbol_(d.code)}<strong>${value(d.max, "°")} <small>/ ${value(d.min, "°")}</small></strong><small>Peluang hujan ${value(d.rain, "%")}</small></div>`).join("")}</div><p class="service-source">${weather.stale ? "Data tersimpan · " : "Diperbarui · "}${esc(date(weather.fetched_at, true))} · <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></p>` : `<div class="service-empty">${data ? weatherSymbol_(3) + "<p>Prakiraan cuaca belum tersedia.</p>" : loadingIndicator_("Memuat prakiraan cuaca…")}</div>`}</section>
      <section class="prayer-widget"><div class="service-heading"><div><span class="eyebrow">JAGA WAKTU, JAGA AMANAH</span><h2>Waktu salat</h2><p>${esc(data?.location || identity.city || "Meulaboh")} · WIB</p></div><span class="prayer-moon" aria-hidden="true">☾</span></div>${prayer ? `<p class="prayer-date">${esc(date(prayer.day))}</p><div class="prayer-times">${prayer.prayers.map((p) => `<div class="prayer-time" data-prayer-time="${p.time}" data-prayer-name="${p.name}"><span>${p.name}</span><strong>${p.time}</strong></div>`).join("")}</div><p class="prayer-next" id="prayer-next-label"></p><p class="service-source">Perhitungan metode Kemenag RI · <a href="https://aladhan.com/prayer-times-api" target="_blank" rel="noopener noreferrer">AlAdhan</a>${state.data.access.is_admin ? "<br>Sesuaikan titik lokasi dengan dayah pada Pengaturan." : ""}</p>` : `<div class="service-empty">${data ? "<p>Jadwal salat hari ini belum tersedia.</p>" : loadingIndicator_("Memuat waktu salat…")}</div>`}</section>
      ${eventCountdownHTML_(event)}`;
  }
  function eventCountdownHTML_(event) {
    return event
      ? `<section class="osda-event-countdown"><div><span class="eyebrow">MENUJU ACARA OSDA RQ</span><h2>${esc(event.name)}</h2><p>${esc(date(event.starts_at, true))}${event.location ? " · " + esc(event.location) : ""}</p>${button("Rincian acara", "event-open", event.id)}</div><div class="countdown" data-start="${esc(event.starts_at)}" aria-label="Hitung mundur menuju ${esc(event.name)}"></div></section>`
      : "";
  }
  function refreshDashboardEvent_() {
    const root = $("#dashboard-live");
    if (!root) return;
    const start = $(".osda-event-countdown [data-start]")?.dataset.start || "";
    const next = nextOsdaEvent_();
    if (start === (next?.starts_at || "")) return;
    $(".osda-event-countdown")?.remove();
    if (next) root.insertAdjacentHTML("beforeend", eventCountdownHTML_(next));
  }
  async function mountDashboardServices_() {
    if (state.page !== "Ringkasan") return;
    const root = document.createElement("div");
    root.id = "dashboard-live";
    root.className = "dashboard-services";
    root.innerHTML = dashboardServiceHTML_(null);
    const hero = $(".dashboard-overview");
    if (hero) hero.insertAdjacentElement("afterend", root);
    else $("#page").prepend(root);
    const request = ++revisionUI.request,
      token = authLive.token;
    try {
      const data = await api("dashboardContext");
      if (
        request !== revisionUI.request ||
        authLive.token !== token ||
        state.page !== "Ringkasan" ||
        !$("#dashboard-live")
      )
        return;
      revisionUI.context = data;
      revisionUI.loadedAt = Date.now();
      revisionUI.offset = Date.parse(data.generated_at) - Date.now();
      $("#dashboard-live").innerHTML = dashboardServiceHTML_(data);
      highlightPrayer_();
      tick();
    } catch (e) {
      if (
        request === revisionUI.request &&
        state.page === "Ringkasan" &&
        $("#dashboard-live")
      )
        $("#dashboard-live").innerHTML = dashboardServiceHTML_({});
    }
  }
  function highlightPrayer_() {
    if (
      state.page !== "Ringkasan" ||
      !revisionUI.context?.prayer ||
      !$("#prayer-next-label")
    )
      return;
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(Date.now() + revisionUI.offset));
    const now =
      parts.find((p) => p.type === "hour").value +
      ":" +
      parts.find((p) => p.type === "minute").value;
    const next = revisionUI.context.prayer.prayers.find((p) => p.time > now);
    document
      .querySelectorAll("[data-prayer-time]")
      .forEach((el) =>
        el.classList.toggle(
          "is-next",
          Boolean(next && el.dataset.prayerTime === next.time),
        ),
      );
    $("#prayer-next-label").textContent = next
      ? "Salat berikutnya: " + next.name + " · " + next.time + " WIB"
      : "Selanjutnya Subuh pada hari berikutnya.";
  }
  function revisionSettingsButton_() {
    return '<button type="button" class="button secondary small" data-revision="identity">Kop surat & lokasi dashboard</button>';
  }
  function siteIdentityEditor_() {
    const r = state.data.identity;
    openFeatureEditor_(
      "site-identity",
      { ...r, id: "site-identity" },
      "Kop surat & lokasi dayah",
      field("Nama organisasi", "organization", r.organization) +
        field("Nama lembaga", "school", r.school) +
        field("Alamat pada kop surat", "address", r.address, "textarea", {
          max: 300,
        }) +
        field("Nama wilayah dashboard", "city", r.city) +
        `<div class="field-pair">${field("Lintang (latitude)", "latitude", r.latitude)}${field("Bujur (longitude)", "longitude", r.longitude)}</div>` +
        '<div class="notice">Koordinat awal adalah perkiraan wilayah Meulaboh. Masukkan titik dayah dari peta agar cuaca dan perhitungan waktu salat lebih sesuai.</div>' +
        field("Telepon pada kop (opsional)", "phone", r.phone || "", "text", {
          required: false,
        }) +
        field("Email pada kop (opsional)", "email", r.email || "", "email", {
          required: false,
        }) +
        field(
          "Website pada kop (opsional)",
          "website",
          r.website || "",
          "url",
          { required: false },
        ),
    );
  }
  function formalReportHTML_(d, period) {
    const identity = d.identity || state.data.identity || {},
      overview = d.monthly,
      counts = overview.counts,
      work = d.programs.filter((p) => p.active || p.report),
      issues = d.issues.filter(
        (i) => i.month === state.query.month || i.status !== "Selesai",
      ),
      meetings = d.meetings.filter((m) => m.month === state.query.month),
      logo = $(".brand img")?.getAttribute("src");
    const plainStatus = (label) =>
      `<span class="report-status">${esc(label)}</span>`;
    return `<article class="monthly-report formal-report"><header class="report-letterhead">${logo ? `<img src="${esc(logo)}" alt="Logo OSDA RQ">` : "<span></span>"}<div><strong>${esc((identity.organization || "Organisasi Santri").toUpperCase())}</strong><h2>${esc(identity.school || "DAYAH RUHUL QURANI")}</h2><b>OSDA RQ KE-${esc(period.name)}${period.cabinet_name ? " · KABINET " + esc(period.cabinet_name) : ""}</b><address>${esc(identity.address || "Meulaboh, Aceh Barat")}</address>${identity.phone || identity.email || identity.website ? `<small>${[identity.phone, identity.email, identity.website].filter(Boolean).map(esc).join(" · ")}</small>` : ""}</div><span class="letterhead-balance" aria-hidden="true"></span></header><div class="formal-report-title"><h2>LAPORAN PELAKSANAAN PROGRAM KERJA</h2><p>DAN EVALUASI BULANAN OSDA RQ</p></div><dl class="formal-report-meta"><div><dt>Periode</dt><dd>OSDA RQ ke-${esc(period.name)}${period.years ? " / " + esc(period.years) : ""}</dd></div><div><dt>Kabinet</dt><dd>${esc(period.cabinet_name || "Belum ditetapkan")}</dd></div><div><dt>Bulan</dt><dd>${esc(monthName(state.query.month))}</dd></div><div><dt>Kepengurusan</dt><dd>${esc(state.query.scope)}</dd></div><div><dt>Status laporan</dt><dd>${d.finalization ? "Final · versi " + esc(d.finalization.version) : "Pemantauan terkini"}</dd></div></dl>
      <section class="report-section"><h3>I. RINGKASAN PELAKSANAAN</h3><p>Terdapat ${counts.monitored} program yang dipantau dengan ${counts.reported} laporan tersedia. Penanggung jawab pelaksanaan adalah masing-masing bidang.</p>${
        overview.groups.length
          ? table(
              [
                "Bidang / rayon",
                "Program",
                "Laporan",
                "Baik / tercapai",
                "Perlu perbaikan",
                "Belum terlaksana",
                "Belum dilaporkan",
              ],
              overview.groups.map(
                (g) =>
                  `<tr><td><strong>${esc(g.department)}</strong><small>${esc(g.scope)}</small></td>${[g.monitored, g.reported, g.achieved, g.partial, g.unexecuted, g.missing + g.no_target + g.no_schedule].map((v) => `<td>${v}</td>`).join("")}</tr>`,
              ),
            )
          : "<p>Belum ada program yang tercatat.</p>"
      }</section>
      <section class="report-section"><h3>II. RINCIAN PROGRAM KERJA</h3>${
        work.length
          ? table(
              [
                "No.",
                "Program / jenis",
                "Bidang penanggung jawab",
                "Pelaksanaan",
                "Catatan / perbaikan",
              ],
              work.map(
                (p, i) =>
                  `<tr><td>${i + 1}</td><td><strong>${esc(p.name)}</strong><small>${esc(p.frequency)} · ${esc(p.scope)}</small>${p.schedule ? `<small>${esc(p.schedule)}</small>` : ""}</td><td>${esc(p.department)}</td><td>${plainStatus(p.result.status)}</td><td class="prewrap">${esc(p.report?.implementation_notes || p.report?.obstacles || (p.report ? "Sudah dilaporkan." : "Pelaksanaan belum dilaporkan."))}${p.report?.next_action ? `<small>Perbaikan: ${esc(p.report.next_action)}</small>` : ""}${p.report?.evidence_url ? `<small>${link(p.report.evidence_url, "Bukti pelaksanaan")}</small>` : ""}</td></tr>`,
              ),
            )
          : "<p>Belum ada rincian program.</p>"
      }</section>
      <section class="report-section"><h3>III. EVALUASI DAN TINDAK LANJUT</h3>${
        issues.length
          ? table(
              [
                "Masalah / bidang",
                "Tanggapan dan keputusan",
                "Penanggung jawab tindak lanjut",
                "Hasil",
              ],
              issues.map(
                (i) =>
                  `<tr><td><strong>${esc(i.problem)}</strong><small>${esc(i.from_department)} → ${esc(i.to_department)} · ${esc(i.scope)}</small></td><td class="prewrap">${esc(i.response || "Tanggapan belum dicatat.")}<small>Keputusan: ${esc(i.decision || "Belum ditetapkan.")}</small></td><td>${esc(i.owner)}${i.due ? `<small>Tindak lanjut: ${esc(date(i.due))}</small>` : ""}</td><td>${plainStatus(i.status)}${i.resolution ? `<small>${esc(i.resolution)}</small>` : ""}</td></tr>`,
              ),
            )
          : "<p>Belum ada keputusan tindak lanjut yang dicatat.</p>"
      }</section>
      <section class="report-section"><h3>IV. NOTULEN DAN ARAHAN PEMBINAAN</h3>${meetings.length ? meetings.map((m) => `<div class="report-meeting"><h4>${esc(m.name)} · ${esc(date(m.date))}</h4><p>Peserta: ${esc(m.participants)}</p><p class="prewrap">${esc(m.notes || "Notulen belum diisi.")}</p></div>`).join("") : "<p>Rapat bulan ini belum dicatat.</p>"}${(
        d.mentor_notes || []
      )
        .filter((n) => n.month === state.query.month)
        .map(
          (n) =>
            `<div class="report-meeting"><h4>Arahan ${esc(n.author_name)} · ${esc(n.department)}</h4><p class="prewrap">${esc(n.note)}</p></div>`,
        )
        .join("")}</section>
      <p class="report-note">Program tanpa laporan masih perlu dikonfirmasi. Program tahunan di luar bulan pelaksanaan tidak dianggap gagal. ${d.finalization ? "Data mengikuti versi yang disimpan pada waktu finalisasi." : "Dokumen ini memuat kondisi pemantauan saat dicetak."}</p><p class="report-place">${esc(identity.city || "Meulaboh")}, ${esc(date(calendarDate_(new Date().toISOString())))}</p><div class="formal-signatures"><div>Mengetahui,<br>Mentor OSDA<br><br><br><br><span>( ________________________ )</span></div><div>Ketua OSDA<br><br><br><br><br><span>( ________________________ )</span></div><div>Disusun oleh,<br>Sekretaris OSDA<br><br><br><br><span>( ________________________ )</span></div></div><p class="report-provenance">Sumber data: OSDA RQ · ${esc(date(d.generated_at, true))}${d.finalization ? " · Final versi " + esc(d.finalization.version) : ""}</p></article>`;
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-revision="identity"]') && !state.saving)
      siteIdentityEditor_();
  });
  setInterval(() => {
    highlightPrayer_();
    if (
      state.page === "Ringkasan" &&
      authLive.token &&
      revisionUI.loadedAt &&
      (Date.now() - revisionUI.loadedAt > 30 * 60 * 1000 ||
        revisionUI.context?.day !== calendarDate_(new Date().toISOString()))
    ) {
      $("#dashboard-live")?.remove();
      mountDashboardServices_();
    }
  }, 60000);
const archiveBulk = {
    queue: [],
    preview: null,
    running: false,
    stop: false,
    generation: 0,
    term: "",
  };
  function archiveBulkLaunchButton_() {
    return scopesFor("saveArchive").length
      ? '<button type="button" class="button secondary small" data-bulk="open">Unggah banyak berkas</button>'
      : "";
  }
  function archiveFileMime_(file) {
    const types = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      txt: "text/plain",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    return types[file.name.split(".").pop().toLowerCase()] || "";
  }
  function ensureBulkDialog_() {
    if ($("#archive-bulk-dialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "archive-bulk-dialog";
    dialog.className = "archive-bulk-dialog";
    dialog.setAttribute("aria-labelledby", "archive-bulk-title");
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      if (archiveBulk.running) {
        event.preventDefault();
        archiveBulk.stop = true;
        bulkMessage_("Unggahan akan dijeda setelah berkas aktif selesai.");
      } else closeBulkDialog_();
    });
  }
  function resetArchiveBulk_() {
    archiveBulk.generation++;
    archiveBulk.stop = true;
    archiveBulk.queue = [];
    archiveBulk.preview = null;
    const dialog = $("#archive-bulk-dialog");
    if (dialog) {
      dialog.close();
      dialog.replaceChildren();
    }
  }
  function openBulkDialog_() {
    ensureBulkDialog_();
    archiveBulk.queue = [];
    archiveBulk.preview = null;
    archiveBulk.running = false;
    archiveBulk.stop = false;
    archiveBulk.generation++;
    archiveBulk.term = state.query.term_id;
    const scopes = archiveScopes_(),
      selectedEvent = state.data.events.find(
        (e) => e.id === state.archiveEventId,
      ),
      scope =
        selectedEvent?.scope ||
        (scopes.includes(state.query.scope) ? state.query.scope : scopes[0]),
      depts = departmentsFor("saveArchive"),
      broad =
        state.data.access.is_admin ||
        state.data.access.grants.some(
          (g) =>
            g.term_id === state.query.term_id &&
            !g.department &&
            !g.read_only &&
            g.actions.includes("saveArchive"),
        );
    $("#archive-bulk-dialog").innerHTML =
      `<div class="dialog-heading"><div><span class="eyebrow">ARSIP ORGANISASI · UNGGAH MASSAL</span><h2 id="archive-bulk-title">Satu batch, banyak berkas</h2></div><button type="button" class="iconbutton" data-bulk="close" aria-label="Tutup">×</button></div><p class="bulk-intro">OSDA RQ ke-${esc(currentPeriod().name)}${currentPeriod().cabinet_name ? " · " + esc(currentPeriod().cabinet_name) : ""}. Pilih hingga 50 berkas, maksimal 5 MB per berkas.</p><div id="bulk-context"><div class="field-pair">${select("Kepengurusan", "bulk_scope", scope, scopes)}${select("Bidang arsip", "bulk_department", broad ? "" : depts[0], [...(broad ? [{ value: "", label: "Umum organisasi" }] : []), ...depts.map((d) => ({ value: d, label: d }))])}</div><div class="field-pair">${select(
        "Kategori bersama",
        "bulk_category",
        state.category || state.data.categories[0]?.id,
        state.data.categories.map((c) => ({ value: c.id, label: c.name })),
      )}${select("Acara (opsional)", "bulk_event", state.archiveEventId || "", [{ value: "", label: "Arsip umum" }], { required: false })}</div><div class="field-pair">${field("Tanggal dokumen bersama (opsional)", "bulk_date", "", "date", { required: false })}${field("Keterangan bersama (opsional)", "bulk_description", "", "text", { required: false })}</div><label class="field">Pilih berkas<input id="bulk-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></label></div><div class="notice">Judul awal mengikuti nama berkas dan bisa disunting sebelum diperiksa. Berkas diunggah satu per satu; unggahan berhasil tetap tersimpan saat proses dijeda.</div><p id="bulk-message" role="status"></p><div id="bulk-progress" class="bulk-progress" hidden><span></span></div><div id="bulk-results"></div><div class="dialog-actions bulk-actions"><button type="button" class="button secondary" data-bulk="reset">Batch baru</button><button type="button" class="button secondary" data-bulk="preview">Periksa daftar</button><button type="button" class="button" data-bulk="start" disabled>Mulai / lanjutkan unggah</button><button type="button" class="button secondary" data-bulk="pause" hidden>Jeda</button><button type="button" class="button secondary" data-bulk="close">Tutup</button></div>`;
    refreshBulkEvents_();
    $("#archive-bulk-dialog").showModal();
  }
  function bulkMessage_(message, error = false) {
    const el = $("#bulk-message");
    if (el) {
      el.textContent = message;
      el.classList.toggle("form-error", error);
    }
  }
  function bulkContext_() {
    return {
      term_id: archiveBulk.term,
      scope: $('[name="bulk_scope"]').value,
      department: $('[name="bulk_department"]').value,
      category_id: $('[name="bulk_category"]').value,
      event_id: $('[name="bulk_event"]').value,
      document_date: $('[name="bulk_date"]').value,
      description: $('[name="bulk_description"]').value,
    };
  }
  function refreshBulkEvents_() {
    const target = $('[name="bulk_event"]');
    if (!target) return;
    const previous = target.value || state.archiveEventId || "",
      scope = $('[name="bulk_scope"]').value,
      events = state.data.events.filter((e) => e.scope === scope);
    target.innerHTML =
      '<option value="">Arsip umum</option>' +
      events
        .map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`)
        .join("");
    if (events.some((e) => e.id === previous)) target.value = previous;
  }
  function renderBulkQueue_() {
    const el = $("#bulk-results");
    if (!el) return;
    el.innerHTML = archiveBulk.queue.length
      ? table(
          ["Pilih", "Berkas / ukuran", "Judul arsip", "Status"],
          archiveBulk.queue.map(
            (row, i) =>
              `<tr><td><input type="checkbox" aria-label="Pilih ${esc(row.file.name)}" data-bulk-index="${i}" data-bulk-field="include" ${row.include ? "checked" : ""} ${archiveBulk.preview || archiveBulk.running ? "disabled" : ""}></td><td><strong>${esc(row.file.name)}</strong><small>${Math.ceil(row.file.size / 1024)} KB</small></td><td><input aria-label="Judul ${esc(row.file.name)}" data-bulk-index="${i}" data-bulk-field="title" value="${esc(row.title)}" ${archiveBulk.preview || archiveBulk.running ? "disabled" : ""}></td><td><strong class="bulk-status status-${row.status}">${row.status === "uploading" ? loadingIndicator_("Mengunggah…", "xs", false) : esc({ waiting: "Menunggu", ready: "Siap", success: "Berhasil", skipped: "Dilewati", error: "Perlu diperiksa" }[row.status])}</strong><small>${esc(row.message || "")}</small></td></tr>`,
          ),
        )
      : empty(
          "Pilih berkas terlebih dahulu",
          "PDF, gambar, dokumen, dan presentasi dapat diunggah dalam satu batch.",
        );
    const active = archiveBulk.queue.filter((r) => r.include),
      done = active.filter((r) =>
        ["success", "skipped"].includes(r.status),
      ).length,
      progress = $("#bulk-progress");
    progress.hidden = !active.length;
    progress.querySelector("span").style.width =
      (active.length ? Math.round((done / active.length) * 100) : 0) + "%";
    $('[data-bulk="start"]').disabled =
      archiveBulk.running ||
      !archiveBulk.preview ||
      !active.some((r) => !["success", "skipped"].includes(r.status));
    $('[data-bulk="preview"]').disabled =
      archiveBulk.running || !active.length || Boolean(archiveBulk.preview);
    $('[data-bulk="reset"]').disabled = archiveBulk.running;
    $('[data-bulk="pause"]').hidden = !archiveBulk.running;
    document
      .querySelectorAll('[data-bulk="close"]')
      .forEach((b) => (b.disabled = archiveBulk.running));
    document
      .querySelectorAll("#bulk-context input,#bulk-context select")
      .forEach(
        (e) =>
          (e.disabled = archiveBulk.running || Boolean(archiveBulk.preview)),
      );
  }
  async function previewBulkQueue_() {
    const selected = archiveBulk.queue.filter((r) => r.include);
    if (!selected.length) throw Error("Pilih berkas yang akan diunggah.");
    if (selected.length > 50) throw Error("Maksimal 50 berkas per batch.");
    if (selected.some((r) => r.validationError))
      throw Error(
        "Keluarkan berkas yang format atau ukurannya belum sesuai dari pilihan.",
      );
    const generation = archiveBulk.generation,
      button = $('[data-bulk="preview"]');
    const finish = beginButtonLoading_(button, "Memeriksa…");
    $("#bulk-message").innerHTML = loadingIndicator_(
      "Memeriksa daftar berkas…",
      "xs",
      false,
    );
    try {
      const data = await api("previewArchiveBatch", {
        ...bulkContext_(),
        files: selected.map((r) => ({
          name: r.file.name,
          size_bytes: r.file.size,
          mime_type: r.mime,
          title: r.title,
        })),
      });
      if (generation !== archiveBulk.generation) return;
      archiveBulk.preview = data;
      selected.forEach((r, i) => {
        r.signed = data.items[i];
        r.status = "ready";
        r.message = data.items[i].name_seen
          ? "Nama berkas pernah digunakan; arsip lama tetap dipertahankan."
          : "Siap diunggah.";
      });
      bulkMessage_(
        selected.length + " berkas siap. Klik Mulai untuk mengunggah.",
      );
      renderBulkQueue_();
    } catch (e) {
      bulkMessage_(e.message, true);
    } finally {
      finish();
      if (generation === archiveBulk.generation) renderBulkQueue_();
    }
  }
  async function startBulkQueue_() {
    if (archiveBulk.running || !archiveBulk.preview) return;
    const generation = archiveBulk.generation,
      preview = archiveBulk.preview;
    const finish = beginButtonLoading_($('[data-bulk="start"]'), "Mengunggah…");
    archiveBulk.running = true;
    archiveBulk.stop = false;
    renderBulkQueue_();
    try {
      for (const row of archiveBulk.queue) {
        if (archiveBulk.stop || generation !== archiveBulk.generation) break;
        if (!row.include || ["success", "skipped"].includes(row.status))
          continue;
        row.status = "uploading";
        row.message = "Mengirim berkas ke arsip privat…";
        renderBulkQueue_();
        try {
          const file = await filePayload(row.file);
          if (generation !== archiveBulk.generation) break;
          const result = await api("saveArchiveBatchFile", {
            ...preview,
            batch_item: row.signed,
            file_base64: file.file_base64,
          });
          if (generation !== archiveBulk.generation) break;
          row.status = result.record.skipped_duplicate ? "skipped" : "success";
          row.message = result.record.skipped_duplicate
            ? "Berkas yang sama sudah tercatat."
            : result.record.already_saved
              ? "Sudah tersimpan pada percobaan sebelumnya."
              : "Tersimpan sebagai arsip baru.";
        } catch (e) {
          if (generation !== archiveBulk.generation) break;
          row.status = "error";
          row.message = e.message;
        }
        renderBulkQueue_();
      }
    } finally {
      archiveBulk.running = false;
      finish();
      if (generation === archiveBulk.generation) {
        const done = archiveBulk.queue.filter((r) =>
          ["success", "skipped"].includes(r.status),
        ).length;
        bulkMessage_(
          archiveBulk.stop
            ? "Dijeda. " +
                done +
                " berkas selesai; lanjutkan untuk memproses sisanya."
            : "Proses selesai. " +
                done +
                " berkas berhasil atau sudah tersedia. Berkas gagal dapat dicoba kembali.",
        );
        renderBulkQueue_();
      }
    }
  }
  function closeBulkDialog_() {
    if (archiveBulk.running) return;
    const changed = archiveBulk.queue.some((r) => r.status === "success");
    $("#archive-bulk-dialog").close();
    archiveBulk.generation++;
    if (changed && state.page === "Arsip & Surat") archives();
  }
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-bulk]");
    if (!target) return;
    try {
      const action = target.dataset.bulk;
      if (action === "open") openBulkDialog_();
      else if (action === "close") closeBulkDialog_();
      else if (action === "reset" && !archiveBulk.running) openBulkDialog_();
      else if (action === "preview") await previewBulkQueue_();
      else if (action === "start") await startBulkQueue_();
      else if (action === "pause") {
        archiveBulk.stop = true;
        bulkMessage_("Menunggu berkas aktif selesai, lalu proses dijeda.");
      }
    } catch (e) {
      bulkMessage_(e.message, true);
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "bulk-files") {
      archiveBulk.preview = null;
      archiveBulk.queue = [...(event.target.files || [])].map((file) => {
        const mime = archiveFileMime_(file),
          error = !mime
            ? "Format berkas belum didukung."
            : !file.size || file.size > 5 * 1024 * 1024
              ? "Ukuran harus 1 byte sampai 5 MB."
              : "";
        return {
          file,
          mime,
          title: file.name.replace(/\.[^.]+$/, ""),
          include: !error,
          status: error ? "error" : "waiting",
          validationError: error,
          message: error,
        };
      });
      renderBulkQueue_();
    } else if (event.target.dataset.bulkField === "include") {
      archiveBulk.queue[Number(event.target.dataset.bulkIndex)].include =
        event.target.checked;
      renderBulkQueue_();
    } else if (event.target.name === "bulk_scope") refreshBulkEvents_();
  });
  document.addEventListener("input", (event) => {
    if (event.target.dataset.bulkField === "title")
      archiveBulk.queue[Number(event.target.dataset.bulkIndex)].title =
        event.target.value;
  });
const officeUI = {
    generation: 0,
    editor: null,
    data: null,
    guide: null,
    notices: null,
    noticeContext: "",
    noticeRequest: 0,
    lastNoticeAt: 0,
    guideContext: "",

    saving: false,
  };
  const officeButton_ = (label, action, id = "", primary = false) =>
    `<button type="button" class="button ${primary ? "" : "secondary small"}" data-office="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
  const officeField_ = (
    label,
    name,
    value = "",
    type = "text",
    optional = false,
    help = "",
  ) =>
    `<label class="field">${esc(label)}${type === "textarea" ? `<textarea name="${esc(name)}" rows="6" ${optional ? "" : "required"}>${esc(value)}</textarea>` : `<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${optional ? "" : "required"}>`}${help ? `<small>${esc(help)}</small>` : ""}</label>`;
  function officePair_(a, b) {
    return `<div class="field-pair">${a}${b}</div>`;
  }
  function officeValues_(form) {
    const values = {};
    form
      .querySelectorAll("input[name],select[name],textarea[name]")
      .forEach((e) => {
        values[e.name] = e.type === "checkbox" ? e.checked : e.value;
      });
    return values;
  }
  function resetOfficeUI_() {
    officeUI.generation++;
    officeUI.noticeRequest++;
    officeUI.editor = null;
    officeUI.data = null;
    officeUI.guide = null;
    officeUI.notices = null;
    officeUI.noticeContext = "";
    officeUI.lastNoticeAt = 0;
    officeUI.guideContext = "";
    officeUI.saving = false;
    const dialog = $("#office-dialog");
    if (dialog) {
      dialog.close();
      dialog.replaceChildren();
    }
    $("#notification-bell")?.setAttribute("hidden", "");
  }
  async function officeLoad_(method, paint) {
    const generation = ++officeUI.generation,
      page = state.page,
      query = JSON.stringify(state.query),
      token = authLive.token;
    $("#page").innerHTML = loadingPanel_("Menyiapkan ruang administrasi…");
    try {
      const data = await api(method, state.query);
      if (
        generation !== officeUI.generation ||
        state.page !== page ||
        query !== JSON.stringify(state.query) ||
        authLive.token !== token
      )
        return;
      officeUI.data = data;
      paint(data);
    } catch (e) {
      if (generation === officeUI.generation && authLive.token === token)
        $("#page").innerHTML = empty("Data belum dapat dimuat", e.message);
    }
  }
  function openOfficeEditor_(type, title, fields, record = {}) {
    let dialog = $("#office-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "office-dialog";
      dialog.className = "office-dialog";
      document.body.append(dialog);
      dialog.addEventListener("close", () => {
        officeUI.editor = null;
      });
    }
    officeUI.editor = {
      type,
      record,
      term_id: state.query.term_id,
      token: authLive.token,
    };
    dialog.setAttribute("aria-labelledby", "office-title");
    dialog.innerHTML = `<form id="office-form"><div class="dialog-heading"><div><span class="eyebrow">ADMINISTRASI OSDA RQ</span><h2 id="office-title">${esc(title)}</h2></div><button type="button" class="iconbutton" data-office="dialog-close" aria-label="Tutup formulir">×</button></div>${fields}<p class="form-error" id="office-error" role="alert"></p><div class="dialog-actions">${officeButton_("Batal", "dialog-close")}<button class="button" type="submit" id="office-save">Simpan</button></div></form>`;
    dialog.showModal();
  }
  function officeAfterRender_() {
    const ready = OSDA_BOOT.office_ready !== false;

    if (!ready || !authLive.token) return;
    $("#notification-bell")?.removeAttribute("hidden");
    const context =
      authLive.token +
      "|" +
      JSON.stringify(state.query) +
      "|" +
      (state.data.generated_at || "");
    if (officeUI.noticeContext !== context) {
      officeUI.noticeContext = context;
      officeRefreshBell_();
    }
    if (state.page === "Ringkasan" && officeUI.guideContext !== context) {
      officeUI.guideContext = context;
      const token = authLive.token,
        query = JSON.stringify(state.query);
      api("guideData", state.query)
        .then((data) => {
          if (
            token !== authLive.token ||
            state.page !== "Ringkasan" ||
            query !== JSON.stringify(state.query) ||
            data.checked.length >= data.steps.length
          )
            return;
          $(".guide-welcome")?.remove();
          $("#page").insertAdjacentHTML(
            "afterbegin",
            `<section class="guide-welcome"><div><span class="eyebrow">PANDUAN SESUAI JABATAN</span><h2>Mulai dengan langkah yang jelas.</h2><p>${esc(data.roles.join(" · "))} · ${data.checked.length} dari ${data.steps.length} langkah dipahami.</p></div>${officeButton_("Buka panduan saya", "guide-open", "", true)}</section>`,
          );
        })
        .catch(() => {});
    }
  }
  async function officeRefreshBell_() {
    if (!authLive.token || OSDA_BOOT.office_ready === false) return;
    officeUI.lastNoticeAt = Date.now();
    const request = ++officeUI.noticeRequest,
      token = authLive.token,
      query = JSON.stringify(state.query);
    try {
      const data = await api("notificationData", state.query);
      if (
        token !== authLive.token ||
        query !== JSON.stringify(state.query) ||
        request !== officeUI.noticeRequest
      )
        return;
      officeUI.notices = data;
      const count = $("#notification-count");
      if (count) {
        count.textContent = data.unread > 99 ? "99+" : String(data.unread);
        count.hidden = !data.unread;
      }
      $("#notification-bell")?.setAttribute(
        "aria-label",
        `Notifikasi, ${data.unread} belum dibaca`,
      );
    } catch (e) {
      /* Other pages stay available if this read fails. */
    }
  }
  function officeTick_() {
    if (
      authLive.token &&
      state.data &&
      OSDA_BOOT.office_ready !== false &&
      Date.now() - officeUI.lastNoticeAt > 60000
    )
      officeRefreshBell_();
  }
  function officeGuideView_() {
    officeLoad_("guideData", (data) => {
      officeUI.guide = data;
      $("#page").innerHTML =
        `<section class="office-intro"><span class="eyebrow">PANDUAN PENGURUS</span><h2>Kenali alur kerja sesuai amanah Anda.</h2><p>${esc(data.roles.join(" · "))}. Tandai langkah yang sudah dipahami; kemajuan tersimpan untuk akun dan penugasan Anda.</p><div class="office-progress"><span style="width:${Math.round((data.checked.length / data.steps.length) * 100)}%"></span></div><small>${data.checked.length} / ${data.steps.length} langkah dipahami</small></section><div class="office-guide-grid">${data.steps.map((step, i) => `<article class="panel guide-step"><span class="guide-step-number">${String(i + 1).padStart(2, "0")}</span><span class="eyebrow">${esc(step.role || "DASAR PENGGUNAAN")}</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p><div class="actions">${pageVisible_(step.page) ? button("Buka " + step.page, "page", step.page) : ""}</div><label class="check-field"><input type="checkbox" data-guide-step value="${esc(step.id)}" ${data.checked.includes(step.id) ? "checked" : ""}><span>Sudah saya pahami</span></label></article>`).join("")}</div><div class="office-save-bar">${officeButton_("Simpan kemajuan panduan", "guide-save", "", true)}</div>`;
    });
  }

  function officeNotificationsView_() {
    officeLoad_("notificationData", (data) => {
      officeUI.notices = data;
      $("#page").innerHTML =
        `<div class="toolbar"><p>${data.unread} notifikasi belum dibaca · menampilkan paling banyak ${data.limit} pemberitahuan terbaru yang masih dapat Anda akses.</p><div class="actions">${officeButton_("Tandai semua dibaca", "notice-all")}${officeButton_("Muat ulang", "notice-refresh")}</div></div><section class="panel notification-list">${data.items.map((r) => `<article class="notification-item ${r.read ? "is-read" : "is-unread"}"><span class="notification-dot" aria-hidden="true"></span><div><strong>${esc(r.title)}</strong><p>${esc(r.detail)}</p><small>${esc(date(r.at, true))} · ${r.read ? "Sudah dibaca" : "Belum dibaca"}</small></div>${officeButton_("Buka", "notice-open", r.key)}</article>`).join("") || empty("Belum ada notifikasi", "Tugas, arahan, surat dan perkembangan yang berkaitan dengan akun Anda akan tampil di sini.")}</section>`;
      officeRefreshBell_();
    });
  }
  function officeLettersView_() {
    document.body.classList.remove("view-report");
    officeLoad_("officeData", (data) => {
      $("#page").innerHTML =
        `<div class="toolbar"><p>Susun draf dari template. Nomor surat dicatat saat diterbitkan.</p><div class="actions">${data.can_create ? officeButton_("+ Buat surat", "letter-new", "", true) : ""}${data.is_admin ? officeButton_("Format nomor", "letter-settings") + officeButton_("Kelola template", "templates") : ""}${officeButton_("Muat ulang", "letter-refresh")}</div></div><div class="notice">Periksa isi, penerima dan penandatangan sebelum menerbitkan. Tanda tangan tetap mengikuti prosedur organisasi. Nomor surat yang dibatalkan tetap tercatat.</div><section class="panel"><div class="panel-head"><h2>Register surat OSDA</h2>${badge(data.letters.length + " surat")}</div>${table(
          [
            "Nomor / perihal",
            "Tanggal / penerima",
            "Kepengurusan",
            "Status",
            "Tindakan",
          ],
          data.letters.map(
            (r) =>
              `<tr><td><strong>${esc(r.letter_number || "Draf · belum bernomor")}</strong><small>${esc(r.subject)}</small></td><td>${esc(date(r.letter_date))}<small>${esc(r.recipient)}</small></td><td>${esc(r.scope)}</td><td>${badge(r.status)}</td><td><div class="actions">${officeButton_("Lihat / cetak", "letter-print", r.id)}${r.can_edit ? officeButton_("Ubah draf", "letter-edit", r.id) : ""}${r.can_issue ? officeButton_("Terbitkan & beri nomor", "letter-issue", r.id, true) : ""}${r.can_cancel ? officeButton_("Batalkan", "letter-cancel", r.id) : ""}</div></td></tr>`,
          ),
        )}</section>`;
    });
  }
  function officeLetterEditor_(r = {}) {
    const data = officeUI.data,
      template =
        data.templates.find((t) => t.id === r.template_id) ||
        data.templates.find((t) => t.active);
    if (!template) {
      toast("Mentor OSDA perlu menyiapkan template surat aktif.");
      return;
    }
    const scopes = data.scopes || [];
    openOfficeEditor_(
      "letter",
      r.id ? "Ubah draf surat" : "Susun surat dari template",
      `<div class="notice">Mengganti template akan mengisi ulang perihal, pembuka, isi dan penutup. Sesuaikan seluruh bagian sebelum menyimpan.</div>${officePair_(
        select(
          "Template",
          "template_id",
          r.template_id || template.id,
          data.templates
            .filter((t) => t.active)
            .map((t) => ({ value: t.id, label: t.name })),
        ),
        select(
          "Kepengurusan surat",
          "scope",
          r.scope ||
            (scopes.includes(state.query.scope)
              ? state.query.scope
              : scopes[0]),
          scopes,
        ),
      )}${officePair_(officeField_("Tanggal surat", "letter_date", r.letter_date || calendarDate_(new Date().toISOString()), "date"), officeField_("Lampiran (opsional)", "attachment", r.attachment || "", "text", true))}${officeField_("Perihal", "subject", r.subject || template.subject)}${officePair_(officeField_("Penerima", "recipient", r.recipient || ""), officeField_("Alamat penerima (opsional)", "recipient_address", r.recipient_address || "", "text", true))}${officeField_("Pembuka", "opening", r.opening ?? template.opening, "textarea", true)}${officeField_("Isi surat", "body", r.body ?? template.body, "textarea")}${officeField_("Penutup", "closing", r.closing ?? template.closing, "textarea", true)}${officePair_(officeField_("Nama penandatangan", "signatory_name", r.signatory_name || ""), officeField_("Jabatan penandatangan", "signatory_position", r.signatory_position || ""))}`,
      r,
    );
  }
  async function officeLetterPrint_(id) {
    const token = authLive.token,
      data = await api("getLetter", { id });
    if (token !== authLive.token || state.page !== "Persuratan") return;
    const r = data.record,
      identity = data.identity,
      period = data.period,
      logo = $(".brand img")?.src || $(".brand img")?.getAttribute("src") || "";
    document.body.classList.add("view-report");
    $("#page").innerHTML =
      `<div class="toolbar no-print"><p>${r.status === "Draf" ? "Pratinjau draf belum memiliki nomor surat." : "Nomor dan isi mengikuti register surat tersimpan."}</p><div class="actions">${officeButton_("Kembali ke register", "letter-refresh")}${button("Cetak / simpan PDF", "print")}</div></div><article class="formal-report letter-document"><header class="report-letterhead">${logo ? `<img src="${esc(logo)}" alt="Logo OSDA RQ">` : "<span></span>"}<div><strong>${esc((identity.organization || "Organisasi Santri").toUpperCase())}</strong><h2>${esc(identity.school || "DAYAH RUHUL QURANI")}</h2><b>OSDA RQ KE-${esc(period.name)}${period.cabinet_name ? " · KABINET " + esc(period.cabinet_name) : ""}</b><address>${esc(identity.address || "")}</address><small>${[identity.phone, identity.email, identity.website].filter(Boolean).map(esc).join(" · ")}</small></div><span class="letterhead-balance" aria-hidden="true"></span></header>${r.status !== "Terbit" ? `<div class="letter-state">${esc(r.status.toUpperCase())}${r.cancel_reason ? " · " + esc(r.cancel_reason) : ""}</div>` : ""}<p class="letter-date">${esc(identity.city || "Meulaboh")}, ${esc(date(r.letter_date))}</p><dl class="letter-reference"><dt>Nomor</dt><dd>: ${esc(r.letter_number || "DRAF — BELUM DITERBITKAN")}</dd><dt>Lampiran</dt><dd>: ${esc(r.attachment || "—")}</dd><dt>Perihal</dt><dd>: <strong>${esc(r.subject)}</strong></dd></dl><div class="letter-recipient">Yth. ${esc(r.recipient)}<br><span class="prewrap">${esc(r.recipient_address || "di tempat")}</span></div><p class="prewrap">${esc(r.opening)}</p><div class="letter-body prewrap">${esc(r.body)}</div><p class="prewrap">${esc(r.closing)}</p><div class="letter-signature"><p>${esc(r.signatory_position)}</p><div></div><strong>${esc(r.signatory_name)}</strong></div></article>`;
  }
  function officeTemplatesView_() {
    const data = officeUI.data;
    $("#page").innerHTML =
      `<div class="toolbar"><p>Template adalah naskah awal yang perlu disesuaikan saat membuat surat.</p><div class="actions">${officeButton_("Kembali ke register", "letter-refresh")}${officeButton_("+ Template", "template-new", "", true)}</div></div><div class="office-card-grid">${data.templates.map((r) => `<article class="panel"><span class="eyebrow">${esc(r.code)} · ${r.active ? "AKTIF" : "NONAKTIF"}</span><h3>${esc(r.name)}</h3><p>${esc(r.subject)}</p>${officeButton_("Ubah template", "template-edit", r.id)}</article>`).join("")}</div>`;
  }
  function officeManualsView_() {
    document.body.classList.remove("view-report");
    officeLoad_("manualData", (data) => {
      $("#page").innerHTML =
        `<div class="toolbar"><p>Pedoman terbit menjadi rujukan pengurus. Draf dan perubahan diperiksa Mentor OSDA sebelum diterbitkan.</p><div class="actions">${data.can_create ? officeButton_("+ Susun pedoman", "manual-new", "", true) : ""}${officeButton_("Muat ulang", "manual-refresh")}</div></div><label class="field manual-search">Cari pedoman<input type="search" id="manual-search" placeholder="Judul, kategori atau kata dalam naskah"></label><div class="office-card-grid" id="manual-list">${data.items.map((r) => `<article class="panel manual-card" data-manual-search="${esc((r.title + " " + r.category + " " + r.body).toLowerCase())}"><div class="panel-head"><span class="eyebrow">${esc(r.category)} · ${esc(r.scope)}</span>${badge(r.status)}</div><h3>${esc(r.title)}</h3><p>${esc(r.body.slice(0, 170))}${r.body.length > 170 ? "…" : ""}</p><small class="muted">${r.is_draft && Number(r.published_version) ? "Draf revisi · versi " + r.published_version + " masih berlaku" : Number(r.published_version) ? "Versi " + r.published_version : "Belum diterbitkan"}</small><div class="actions">${officeButton_("Baca naskah", "manual-read", r.id)}${Number(r.published_version) ? officeButton_("Riwayat versi", "manual-history", r.id) : ""}${r.can_edit ? officeButton_("Ubah draf", "manual-edit", r.id) : ""}${r.can_publish && r.status === "Draf" ? officeButton_("Terbitkan pedoman", "manual-publish", r.id, true) : ""}${r.can_publish && Number(r.published_version) && r.status !== "Ditarik" ? officeButton_("Tarik pedoman", "manual-withdraw", r.id) : ""}</div></article>`).join("") || empty("Belum ada pedoman terbit", "Pengelola dapat menyusun naskah berdasarkan dokumen resmi organisasi.")}</div>`;
    });
  }
  function officeManualEditor_(r = {}) {
    const scopes = state.data.access.is_admin
      ? scopeOptions
      : [...new Set([...scopesFor("saveProgram"), "Bersama"])];
    openOfficeEditor_(
      "manual",
      r.id ? "Ubah draf pedoman" : "Susun buku pedoman",
      officePair_(
        officeField_("Judul pedoman", "title", r.title || ""),
        officeField_(
          "Kategori",
          "category",
          r.category || "Pedoman organisasi",
        ),
      ) +
        select("Berlaku untuk", "scope", r.scope || "Bersama", scopes) +
        officeField_("Isi pedoman", "body", r.body || "", "textarea") +
        officeField_(
          "Rujukan resmi",
          "source_ref",
          r.source_ref || "",
          "textarea",
          true,
          "Wajib sebelum diterbitkan, misalnya nomor SK, tanggal keputusan, atau dokumen sumber.",
        ),
      r,
    );
  }

  async function officeMutation_(method, argument, after) {
    if (officeUI.saving) return;
    officeUI.saving = true;
    try {
      const result = await api(method, argument);
      if (after) await after(result);
      else toast("Perubahan tersimpan.");
      officeUI.noticeContext = "";
      officeRefreshBell_();
    } catch (e) {
      toast(e.message);
    } finally {
      officeUI.saving = false;
    }
  }
  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-office]");
    if (!el || loadingUI.buttons.has(el)) return;
    const action = el.dataset.office,
      id = el.dataset.id;
    const finish = [
      "guide-save",
      "notice-all",
      "notice-open",
      "letter-print",
      "letter-issue",
      "manual-history",
      "manual-publish",
    ].includes(action)
      ? beginButtonLoading_(
          el,
          action === "letter-issue" || action === "manual-publish"
            ? "Menerbitkan…"
            : "Memproses…",
        )
      : () => {};
    try {
      if (action === "dialog-close") {
        $("#office-dialog")?.close();
        officeUI.editor = null;
        return;
      }
      if (!authLive.token) return;
      if (action === "guide-open") activate("Panduan");
      else if (action === "guide-save") {
        const checked = [...document.querySelectorAll("[data-guide-step]")]
          .filter((e) => e.checked)
          .map((e) => e.value);
        await officeMutation_(
          "saveGuideProgress",
          { ...state.query, checked, revision: officeUI.guide.revision },
          () => officeGuideView_(),
        );
      } else if (action === "notice-refresh") officeNotificationsView_();
      else if (action === "notice-all")
        await officeMutation_(
          "readNotifications",
          { ...state.query, all: true },
          () => officeNotificationsView_(),
        );
      else if (action === "notice-open") {
        const r = officeUI.notices.items.find((r) => r.key === id);
        if (!r) return;
        await officeMutation_(
          "readNotifications",
          { ...state.query, keys: [id] },
          () => activate(r.page),
        );
      } else if (action === "letter-refresh") officeLettersView_();
      else if (action === "letter-new") officeLetterEditor_();
      else if (action === "letter-edit")
        officeLetterEditor_(officeUI.data.letters.find((r) => r.id === id));
      else if (action === "letter-print") await officeLetterPrint_(id);
      else if (action === "letter-issue") {
        const r = officeUI.data.letters.find((r) => r.id === id);
        await officeMutation_("issueLetter", { id, revision: r.revision }, () =>
          officeLettersView_(),
        );
      } else if (action === "letter-cancel") {
        const r = officeUI.data.letters.find((r) => r.id === id);
        openOfficeEditor_(
          "letter-cancel",
          "Batalkan surat " + r.letter_number,
          officeField_("Alasan pembatalan", "reason", "", "textarea"),
          r,
        );
      } else if (action === "letter-settings") {
        const r = officeUI.data.settings;
        openOfficeEditor_(
          "letter-settings",
          "Format nomor surat",
          officeField_(
            "Kode organisasi",
            "organization_code",
            r.organization_code,
          ) +
            officeField_(
              "Pola nomor",
              "pattern",
              r.pattern,
              "text",
              false,
              "Token: {urut}, {jenis}, {organisasi}, {bulan_romawi}, {bulan}, {tahun}. Wajib memuat {urut} dan {tahun}.",
            ) +
            officeField_("Jumlah digit urut", "padding", r.padding, "number") +
            officePair_(
              officeField_(
                "Tahun register",
                "counter_year",
                Number(calendarDate_(new Date().toISOString()).slice(0, 4)),
                "number",
              ),
              officeField_(
                "Urutan terakhir register lama (opsional)",
                "last_number",
                "",
                "number",
                true,
                "Isi untuk melanjutkan register lama. Urutan tidak dapat diturunkan.",
              ),
            ) +
            '<p class="muted">Nomor yang telah terbit tetap dipertahankan. Urutan berjalan bersama untuk seluruh rayon dalam satu tahun.</p>',
          r,
        );
      } else if (action === "templates") officeTemplatesView_();
      else if (action === "template-new" || action === "template-edit") {
        const r =
          action === "template-new"
            ? {}
            : officeUI.data.templates.find((r) => r.id === id);
        openOfficeEditor_(
          "template",
          "Template surat",
          officePair_(
            officeField_("Nama template", "name", r.name || ""),
            officeField_("Kode jenis", "code", r.code || ""),
          ) +
            officeField_("Perihal bawaan", "subject", r.subject || "") +
            officeField_(
              "Pembuka",
              "opening",
              r.opening || "",
              "textarea",
              true,
            ) +
            officeField_("Isi bawaan", "body", r.body || "", "textarea") +
            officeField_(
              "Penutup",
              "closing",
              r.closing || "",
              "textarea",
              true,
            ) +
            `<label class="check-field"><input type="checkbox" name="active" ${r.active !== false ? "checked" : ""}><span>Template aktif</span></label>`,
          r,
        );
      } else if (action === "manual-refresh") officeManualsView_();
      else if (action === "manual-new") officeManualEditor_();
      else if (action === "manual-edit")
        officeManualEditor_(officeUI.data.items.find((r) => r.id === id));
      else if (action === "manual-read") {
        const r = officeUI.data.items.find((r) => r.id === id);
        openOfficeEditor_(
          "manual-read",
          r.title,
          `<p class="muted">${esc(r.category)} · ${esc(r.scope)} · ${r.is_draft ? "Draf" : "Versi " + r.published_version}</p><div class="manual-body prewrap">${esc(r.body)}</div><p class="manual-source"><strong>Rujukan:</strong> ${esc(r.source_ref || "Belum diisi")}</p>`,
          r,
        );
        $("#office-save").hidden = true;
      } else if (action === "manual-history") {
        const token = authLive.token,
          rows = await api("manualVersions", { id });
        if (token !== authLive.token || state.page !== "Buku Pedoman") return;
        openOfficeEditor_(
          "manual-read",
          "Riwayat versi pedoman",
          rows
            .map(
              (r) =>
                `<details class="manual-version"><summary>Versi ${r.version} · ${esc(date(r.published_at, true))}</summary><h3>${esc(r.title)}</h3><p class="muted">Diterbitkan oleh ${esc(r.published_name)}</p><div class="manual-body prewrap">${esc(r.body)}</div><p>Rujukan: ${esc(r.source_ref)}</p></details>`,
            )
            .join(""),
        );
        $("#office-save").hidden = true;
      } else if (action === "manual-publish") {
        const r = officeUI.data.items.find((r) => r.id === id);
        await officeMutation_(
          "publishManual",
          { id, revision: r.revision },
          () => officeManualsView_(),
        );
      } else if (action === "manual-withdraw") {
        const r = officeUI.data.items.find((r) => r.id === id);
        openOfficeEditor_(
          "manual-withdraw",
          "Tarik pedoman",
          officeField_("Alasan penarikan", "reason", "", "textarea"),
          r,
        );
      }
    } catch (e) {
      toast(e.message);
    } finally {
      finish();
    }
  });

  document.addEventListener("change", (event) => {
    if (
      event.target.name === "template_id" &&
      event.target.closest("#office-form") &&
      officeUI.editor?.type === "letter"
    ) {
      const template = officeUI.data.templates.find(
        (r) => r.id === event.target.value,
      );
      if (template)
        for (const name of ["subject", "opening", "body", "closing"])
          $("#office-form").elements[name].value = template[name];
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "manual-search") {
      const query = event.target.value.toLowerCase();
      document
        .querySelectorAll("[data-manual-search]")
        .forEach((e) => (e.hidden = !e.dataset.manualSearch.includes(query)));
    }
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.id === "office-form") {
      event.preventDefault();
      if (officeUI.saving || !officeUI.editor) return;
      const ed = officeUI.editor;
      if (ed.token !== authLive.token) return;
      const values = officeValues_(form),
        argument = {
          ...values,
          id: ed.record.id || clientId(),
          revision: ed.record.revision || 0,
          term_id: ed.record.term_id || ed.term_id,
        };
      const method = {
        letter: "saveLetter",
        "letter-settings": "saveLetterSettings",
        template: "saveLetterTemplate",

        manual: "saveManual",
        "manual-withdraw": "withdrawManual",
        "letter-cancel": "cancelLetter",
      }[ed.type];
      if (!method) return;
      officeUI.saving = true;
      const finish = beginButtonLoading_($("#office-save"), "Menyimpan…");
      $("#office-error").textContent = "";
      try {
        await api(method, argument);
        if (ed.token !== authLive.token || officeUI.editor !== ed) return;
        $("#office-dialog").close();
        officeUI.editor = null;
        toast("Perubahan tersimpan.");
        officeUI.noticeContext = "";
        if (ed.type.startsWith("manual")) officeManualsView_();
        else officeLettersView_();
        officeRefreshBell_();
      } catch (e) {
        if (ed.token === authLive.token && $("#office-error"))
          $("#office-error").textContent = e.message;
      } finally {
        officeUI.saving = false;
        finish();
      }
    }
  });
const OSDA_MEDIA = {
    masjid: new URL("dayah-masjid-biru.jpg", document.currentScript?.src || document.baseURI || "https://osdarq.github.io/osda-rq-web/assets/client.js").href,
    kebersamaan: new URL("dayah-kebersamaan-santri.jpg", document.currentScript?.src || document.baseURI || "https://osdarq.github.io/osda-rq-web/assets/client.js").href,
    jamaah: new URL("dayah-jamaah.jpg", document.currentScript?.src || document.baseURI || "https://osdarq.github.io/osda-rq-web/assets/client.js").href,
    cahaya: new URL("dayah-kubah-cahaya.jpg", document.currentScript?.src || document.baseURI || "https://osdarq.github.io/osda-rq-web/assets/client.js").href,
  };
  const manageUI = {
    serial: 0,
    table: "Program",
    search: "",
    page: 1,
    selected: new Set(),
    data: null,
    gallery: null,
    plan: null,
    editor: null,
    busy: false,
    tab: "data",
  };
  const workspaceHeroUI = {
    node: null,
    observer: null,
    inView: true,
    page: "",
    layout: "",
    preference: null,
    initialized: false,
  };
  function syncWorkspaceHeroMotion_() {
    workspaceHeroUI.node?.style.setProperty(
      "--hero-motion-state",
      !document.hidden &&
        workspaceHeroUI.inView &&
        !$("#workspace")?.hidden &&
        !workspaceHeroUI.preference?.matches
        ? "running"
        : "paused",
    );
  }
  function sizeWorkspaceHero_() {
    const meaning = $("#hero-meaning");
    if (!meaning) return;
    const mode = $(".workspace-header-compact")
      ? "unified"
      : (window.innerWidth || 1024) <= 760 ? "compact" : "full";
    if (mode !== workspaceHeroUI.layout) {
      workspaceHeroUI.layout = mode;
      meaning.toggleAttribute("open", mode === "full");
    }
  }
  function mountWorkspaceHero_() {
    const hero = $(".workspace-hero");
    if (!hero) return;
    if (!workspaceHeroUI.initialized) {
      workspaceHeroUI.initialized = true;
      workspaceHeroUI.node = hero;
      workspaceHeroUI.preference = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      );
      workspaceHeroUI.preference?.addEventListener?.(
        "change",
        syncWorkspaceHeroMotion_,
      );
      document.addEventListener("visibilitychange", syncWorkspaceHeroMotion_);
      window.addEventListener("resize", sizeWorkspaceHero_, { passive: true });
      document.addEventListener("click", (event) => {
        const meaning = $("#hero-meaning");
        if ($(".workspace-header-compact") && !event.target.closest?.("#hero-meaning"))
          meaning?.removeAttribute("open");
      });
      document.addEventListener("keydown", (event) => {
        const meaning = $("#hero-meaning");
        if (event.key !== "Escape" || !$(".workspace-header-compact") || !meaning?.hasAttribute("open") || $("dialog[open]")) return;
        const restore = document.activeElement && meaning.contains(document.activeElement);
        meaning.removeAttribute("open");
        if (restore) meaning.querySelector("summary")?.focus?.();
      });
      if (typeof window.IntersectionObserver === "function") {
        workspaceHeroUI.observer = new window.IntersectionObserver(
          (entries) => {
            workspaceHeroUI.inView = entries.some(
              (entry) => entry.isIntersecting,
            );
            syncWorkspaceHeroMotion_();
          },
        );
        workspaceHeroUI.observer.observe(hero);
      }
    }
    sizeWorkspaceHero_();
    syncWorkspaceHeroMotion_();
    if (workspaceHeroUI.page !== state.page) {
      workspaceHeroUI.page = state.page;
      if ($(".workspace-header-compact")) $("#hero-meaning")?.removeAttribute("open");
      if (!workspaceHeroUI.preference?.matches && !document.hidden)
        hero.querySelector(".page-heading")?.animate?.(
          [
            { opacity: 0.45, transform: "translateY(5px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)" },
        );
    }
  }
  function resetManagement_() {
    manageUI.serial++;
    manageUI.selected.clear();
    manageUI.data = null;
    manageUI.gallery = null;
    manageUI.plan = null;
    manageUI.editor = null;
    manageUI.busy = false;
    $("#manage-dialog")?.close();
    $("#manage-dialog")?.replaceChildren();
    manageUI.table = "Program";
    manageUI.search = "";
    manageUI.page = 1;
    manageUI.tab = "data";
    workspaceHeroUI.page = "";
    workspaceHeroUI.layout = "";
    $("#hero-meaning")?.removeAttribute("open");
    workspaceHeroUI.node?.style.setProperty("--hero-motion-state", "paused");
  }
  const manageButton_ = (label, action, id = "", danger = false) =>
    `<button type="button" class="button secondary small${danger ? " danger-action" : ""}" data-manage="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
  function manageDialog_(title, body, footer = "") {
    let d = $("#manage-dialog");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "manage-dialog";
      d.className = "manage-dialog";
      document.body.append(d);
      d.addEventListener("cancel", (e) => {
        if (manageUI.busy) e.preventDefault();
      });
    }
    d.setAttribute("aria-labelledby", "manage-dialog-title");
    d.innerHTML = `<header class="manage-dialog-head"><div><span class="eyebrow">OSDA RQ · RUANG PENGURUS</span><h2 id="manage-dialog-title">${esc(title)}</h2></div>${manageButton_("Tutup", "close")}</header>${body}<p class="form-error" id="manage-error" role="alert"></p>${footer}`;
    if (!d.hasAttribute("open")) d.showModal();
    return d;
  }
  function manageStamp_() {
    return {
      serial: ++manageUI.serial,
      page: state.page,
      term: state.query.term_id,
      token: authLive.token,
    };
  }
  function manageCurrent_(s) {
    return (
      s.serial === manageUI.serial &&
      s.page === state.page &&
      s.term === state.query.term_id &&
      s.token === authLive.token
    );
  }
  function interiorAfterRender_() {
    renderAccountIdentity_();
    mountWorkspaceHero_();
    const workspace = $("#workspace");
    workspace.style.setProperty(
      "--rq-mosque-photo",
      `url("${OSDA_MEDIA.masjid}")`,
    );
    workspace.style.setProperty(
      "--rq-community-photo",
      `url("${OSDA_MEDIA.kebersamaan}")`,
    );
    const cabinet = currentPeriod();
    if (state.page === "Ringkasan" && !$(".cabinet-welcome")) {
      const welcome = document.createElement("section");
      welcome.className = "cabinet-welcome";
      welcome.innerHTML = `<div class="cabinet-welcome-copy"><span class="eyebrow">RUHUL QURANI · RUMAH PENGABDIAN</span><h2>${esc(cabinet.cabinet_name || "Bersama menjaga amanah.")}</h2><p>Setiap langkah tercatat. Setiap karya menjadi jejak untuk generasi berikutnya.</p><div>${button("Lihat capaian kabinet", "page", "Galeri Capaian")}${button("Program kerja", "page", "Program Kerja")}</div></div><div class="cabinet-welcome-photo"><span>OSDA RQ <b>ke-${esc(cabinet.name)}</b></span></div>`;
      $("#page").prepend(welcome);
    }
    mountProgramDelete_();
  }
  function mountProgramDelete_() {
    if (state.page !== "Program Kerja" || !state.data?.access.is_admin) return;
    document
      .querySelectorAll('#page [data-action="program"][data-id]')
      .forEach((b) => {
        if (
          !b.dataset.id ||
          b.parentElement.querySelector('[data-manage="program-delete"]')
        )
          return;
        b.insertAdjacentHTML(
          "afterend",
          manageButton_("Hapus", "program-delete", b.dataset.id, true),
        );
      });
    const actions = $("#page .toolbar-actions");
    if (
      actions &&
      !actions.querySelector('[data-manage="program-delete-selected"]')
    )
      actions.insertAdjacentHTML(
        "beforeend",
        manageButton_(
          "Hapus program terpilih",
          "program-delete-selected",
          "",
          true,
        ),
      );
  }
  async function dataManagerView_() {
    if (!state.data?.access.is_admin) {
      $("#page").innerHTML = empty(
        "Akses dibatasi",
        "Penghapusan data dikelola Mentor OSDA atau admin.",
      );
      return;
    }
    const s = manageStamp_();
    $("#page").innerHTML = loadingPanel_("Memuat pengelolaan data…");
    try {
      const data = await api("dataManager", {
        term_id: s.term,
        table: manageUI.table,
        search: manageUI.search,
        page: manageUI.page,
      });
      if (!manageCurrent_(s)) return;
      manageUI.data = data;
      manageUI.page = data.page;
      manageUI.selected.clear();
      paintDataManager_();
    } catch (e) {
      if (manageCurrent_(s))
        $("#page").innerHTML = empty("Daftar belum dapat dimuat", e.message);
    }
  }
  function paintDataManager_() {
    const d = manageUI.data;
    if (!d) return;
    $("#page").innerHTML =
      `<section class="management-intro"><span class="management-icon">${symbol("database")}</span><div><span class="eyebrow">DATA RAPI · AMANAH TERJAGA</span><h2>Ruang merapikan data</h2><p>Pilih catatan uji, periksa data terkait, lalu pindahkan ke tempat sampah. Nomor surat yang pernah terbit tetap dicadangkan.</p></div></section><div class="manage-tabs" role="group" aria-label="Tampilan pengelolaan">${manageButton_("Data organisasi", "tab-data")}${manageButton_("Tempat sampah (" + d.trash.length + ")", "tab-trash")}</div>${
        manageUI.tab === "trash"
          ? paintDataTrash_(d)
          : `<section class="panel"><div class="manage-filters">${select("Jenis data", "manage_table", d.table, d.types)}<label class="field">Cari catatan<input id="manage-search" value="${esc(manageUI.search)}" placeholder="Nama, judul, atau bidang" maxlength="200"></label>${manageButton_("Cari", "search")}</div><div class="manage-batch"><label><input type="checkbox" id="manage-select-page"> Pilih yang tampil (maks. 25)</label><span id="manage-selection-count">0 dipilih</span>${manageButton_("Hapus pilihan", "delete-selected", "", true)}</div><p class="manage-help">${d.total} catatan · periode yang dipilih di bagian atas. Akun dikelola melalui Akun &amp; Akses; riwayat aktivitas tetap tercatat.</p>${
              d.items.length
                ? table(
                    ["Pilih", "Catatan", "Bidang / konteks", "Tindakan"],
                    d.items.map(
                      (r) =>
                        `<tr><td><input type="checkbox" data-manage-check="${esc(r.id)}" aria-label="Pilih ${esc(r.title)}"></td><td><strong>${esc(r.title)}</strong><small>${esc(r.detail)}</small></td><td>${esc(r.department || "Umum")}<small>${esc(r.scope)}</small></td><td>${manageButton_("Hapus", "delete-one", r.id, true)}</td></tr>`,
                    ),
                  )
                : empty(
                    "Belum ada catatan",
                    "Pilih jenis data atau kata pencarian lain.",
                  )
            }<div class="manage-pagination">${manageButton_("← Sebelumnya", "prev")}<span>Halaman ${d.page} / ${d.pages}</span>${manageButton_("Berikutnya →", "next")}</div></section>`
      }`;
    const tabs = [...document.querySelectorAll(".manage-tabs [data-manage]")];
    tabs.forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.manage === "tab-" + manageUI.tab),
      ),
    );
  }
  function paintDataTrash_(d) {
    return `<section class="panel"><p class="manage-help">Pulihkan seluruh kelompok agar hubungan antarcatatan tetap lengkap. Hapus permanen mengosongkan catatan dari tempat sampah; berkas Drive tetap tersedia untuk cadangan lama.</p>${
      d.trash.length
        ? table(
            ["Catatan dihapus", "Rincian", "Tindakan"],
            d.trash.map(
              (r) =>
                `<tr><td><strong>${esc(r.title)}</strong><small>${esc(r.reason)}</small></td><td>${r.count} catatan terkait<small>${esc(r.deleted_by)} · ${esc(r.deleted_at.slice(0, 10))}</small></td><td><div class="actions">${manageButton_("Pulihkan", "restore", r.id)}${manageButton_("Hapus permanen", "purge", r.id, true)}</div></td></tr>`,
            ),
          )
        : empty(
            "Tempat sampah kosong",
            "Data yang dihapus akan muncul di sini.",
          )
    }</section>`;
  }
  async function previewDeleteUI_(tableName, ids) {
    if (!ids.length) {
      toast("Pilih catatan yang akan dihapus.");
      return;
    }
    if (ids.length > 25) {
      toast("Pilih maksimal 25 catatan dalam satu penghapusan.");
      return;
    }
    const token = authLive.token,
      term = state.query.term_id,
      plan = await api("previewDataTrash", { table: tableName, ids });
    if (token !== authLive.token || term !== state.query.term_id) return;
    manageUI.plan = plan;
    manageDialog_(
      "Periksa penghapusan",
      `<form data-manage-form="trash"><div class="manage-warning"><strong>${esc(plan.title)}</strong><p>${plan.total} catatan akan dipindahkan bersama data yang bergantung padanya.</p></div><ul class="delete-counts">${plan.counts.map((r) => `<li><span>${esc(r.label)}</span><b>${r.count}</b></li>`).join("")}</ul><label class="field">Alasan penghapusan<textarea name="reason" required maxlength="500" placeholder="Contoh: data uji sebelum pemakaian resmi" rows="3"></textarea></label><button class="button danger-action" type="submit">Pindahkan ke tempat sampah</button></form>`,
    );
  }
  async function galleryView_() {
    const s = manageStamp_();
    $("#page").innerHTML = loadingPanel_("Menyiapkan galeri capaian…");
    try {
      const d = await api("galleryData", state.query);
      if (!manageCurrent_(s)) return;
      manageUI.gallery = d;
      $("#page").innerHTML =
        `<section class="gallery-heading"><div><span class="eyebrow">JEJAK KARYA · ESTAFET AMANAH</span><h2>Cerita dari setiap pengabdian.</h2><p>${esc(currentPeriod().cabinet_name || "Kabinet OSDA RQ")} · dokumentasi kegiatan dan hasil pelaksanaan.</p></div>${d.can_edit ? manageButton_("+ Tambah capaian", "gallery-new") : ""}${d.public_url ? `<a class="button secondary small" href="${esc(d.public_url)}" target="_blank" rel="noopener">Lihat galeri umum ↗</a>` : ""}</section>${d.items.length ? `<div class="achievement-grid">${d.items.map((r) => `<article class="achievement-card"><button class="achievement-image" data-manage="gallery-photo" data-id="${esc(r.id)}" aria-label="Perbesar foto ${esc(r.title)}"><img src="${esc(OSDA_MEDIA[r.photo_key] || OSDA_MEDIA.kebersamaan)}" alt="${esc(r.title)}" loading="lazy" data-gallery-image="${esc(r.id)}"><span class="achievement-status ${r.status === "Terbit" ? "is-published" : ""}">${esc(r.status)}</span><span class="achievement-zoom" aria-hidden="true">↗</span></button><div class="achievement-copy"><span class="eyebrow">${esc(r.department || "KARYA BERSAMA")} · ${esc(r.date)}</span><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p><div class="actions">${d.can_edit ? manageButton_("Ubah", "gallery-edit", r.id) : ""}${d.can_publish ? manageButton_(r.status === "Terbit" ? "Tarik publikasi" : "Terbitkan", "gallery-publish", r.id) : ""}${state.data.access.is_admin ? manageButton_("Hapus", "gallery-delete", r.id, true) : ""}</div></div></article>`).join("")}</div>` : empty("Capaian kabinet belum ditambahkan", "Tambahkan foto, judul kegiatan, dan hasil singkatnya. Publikasi dipilih Mentor OSDA/admin.")}`;
      for (const r of d.items.filter((x) => x.file_id)) {
        try {
          const photo = await api("getGalleryPhoto", { id: r.id });
          if (!manageCurrent_(s)) return;
          const img = [
            ...document.querySelectorAll("[data-gallery-image]"),
          ].find((x) => x.dataset.galleryImage === r.id);
          if (img) img.src = galleryImageURL_(photo, r.photo_key);
        } catch (e) {
          if (manageCurrent_(s)) toast("Salah satu foto belum dapat dimuat.");
        }
      }
    } catch (e) {
      if (manageCurrent_(s))
        $("#page").innerHTML = empty("Galeri belum dapat dimuat", e.message);
    }
  }
  function galleryImageURL_(p, key) {
    return p?.base64 &&
      ["image/jpeg", "image/png", "image/webp"].includes(p.mime)
      ? `data:${p.mime};base64,${p.base64}`
      : OSDA_MEDIA[p?.photo_key || key] || OSDA_MEDIA.kebersamaan;
  }
  function galleryEditor_(r) {
    r = r || {
      id: clientId(),
      revision: 0,
      term_id: state.query.term_id,
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      photo_key: "kebersamaan",
    };
    manageUI.editor = { ...r };
    const f = officeField_;
    manageDialog_(
      r.revision ? "Ubah capaian kabinet" : "Capaian baru",
      `<form data-manage-form="gallery"><p class="manage-help">Simpan sebagai draf, lalu pilih Terbitkan untuk menampilkannya di halaman umum. Mengubah capaian terbit akan mengembalikannya ke draf.</p>${f("Judul kegiatan / capaian", "title", r.title || "")}${f("Hasil singkat kegiatan", "summary", r.summary || "", "textarea")}${officePair_(f("Tanggal kegiatan", "date", r.date, "date"), select("Bidang pelaksana", "department", r.department || "", [{ value: "", label: "Kegiatan bersama" }, "Formatur", ...state.data.departments], { required: false }))}${select(
        "Foto Dayah sebagai pilihan",
        "photo_key",
        r.photo_key,
        [
          { value: "kebersamaan", label: "Kebersamaan santri" },
          { value: "masjid", label: "Masjid Ruhul Qurani" },
          { value: "jamaah", label: "Kegiatan berjamaah" },
          { value: "cahaya", label: "Dayah & langit jingga" },
        ],
      )}<label class="field">Unggah foto kegiatan sendiri (opsional)<input name="gallery_file" type="file" accept="image/jpeg,image/png,image/webp"><small>Foto diperkecil di perangkat sebelum diunggah. Maksimal hasil unggahan 800 KB.</small></label>${r.file_id ? '<label class="manage-help"><input type="checkbox" name="use_preset"> Ganti foto unggahan lama dengan pilihan foto Dayah di atas</label>' : ""}<button class="button" type="submit">Simpan draf capaian</button></form>`,
    );
  }
  async function resizeGalleryPhoto_(file) {
    if (file.size > 15 * 1024 * 1024) throw Error("Pilih foto di bawah 15 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw Error("Gunakan foto JPG, PNG, atau WebP.");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1400 / img.width, 1100 / img.height),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw Error("Perangkat belum mendukung pengolahan foto.");
      context.fillStyle = "#e8eee9";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL("image/jpeg", 0.84);
      if (data.length > 1080000) data = canvas.toDataURL("image/jpeg", 0.66);
      if (data.length > 1080000)
        throw Error("Foto masih terlalu besar. Pilih foto lain.");
      return { mime: "image/jpeg", base64: data.split(",")[1] };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  document.addEventListener("change", (e) => {
    if (e.target.name === "manage_table") {
      manageUI.table = e.target.value;
      manageUI.page = 1;
      dataManagerView_();
    }
    if (e.target.id === "manage-select-page") {
      manageUI.selected.clear();
      if (e.target.checked)
        manageUI.data.items
          .slice(0, 25)
          .forEach((r) => manageUI.selected.add(r.id));
      document
        .querySelectorAll("[data-manage-check]")
        .forEach(
          (x) => (x.checked = manageUI.selected.has(x.dataset.manageCheck)),
        );
    }
    if (e.target.matches("[data-manage-check]")) {
      if (e.target.checked) {
        if (manageUI.selected.size >= 25) {
          e.target.checked = false;
          toast("Maksimal 25 catatan.");
        } else manageUI.selected.add(e.target.dataset.manageCheck);
      } else manageUI.selected.delete(e.target.dataset.manageCheck);
    }
    if ($("#manage-selection-count"))
      $("#manage-selection-count").textContent =
        manageUI.selected.size + " dipilih";
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "manage-search" && e.key === "Enter") {
      e.preventDefault();
      manageUI.search = e.target.value;
      manageUI.page = 1;
      dataManagerView_();
    }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-manage]");
    if (!b || manageUI.busy || !authLive.token) return;
    const a = b.dataset.manage,
      id = b.dataset.id;
    if (a === "close") {
      $("#manage-dialog")?.close();
      return;
    }
    manageUI.busy = true;
    const finish = beginButtonLoading_(b, "Memproses…");
    try {
      if (a === "search") {
        manageUI.search = $("#manage-search").value;
        manageUI.page = 1;
        await dataManagerView_();
      } else if (a === "prev" || a === "next") {
        manageUI.page = Math.max(
          1,
          Math.min(
            manageUI.data.pages,
            manageUI.page + (a === "next" ? 1 : -1),
          ),
        );
        await dataManagerView_();
      } else if (a === "tab-data" || a === "tab-trash") {
        manageUI.tab = a.slice(4);
        paintDataManager_();
      } else if (a === "delete-one" || a === "delete-selected")
        await previewDeleteUI_(
          manageUI.table,
          a === "delete-one" ? [id] : [...manageUI.selected],
        );
      else if (a === "program-delete" || a === "program-delete-selected")
        await previewDeleteUI_(
          "Program",
          a === "program-delete"
            ? [id]
            : visiblePrograms_()
                .filter((p) => workUI.programSelection.has(p.id))
                .map((p) => p.id),
        );
      else if (a === "restore") {
        await api("restoreData", { id });
        toast("Data beserta catatan terkait dipulihkan.");
        await load();
      } else if (a === "account-delete") {
        manageUI.plan = { id };
        manageDialog_(
          "Hapus akun nonaktif",
          `<form data-manage-form="account"><p>Akun beserta sesi dan hak aksesnya dihapus permanen. Nama pada struktur organisasi dan catatan kegiatan tetap tersimpan.</p><label class="field">Ketik HAPUS AKUN<input name="confirmation" required autocomplete="off"></label><button class="button danger-action" type="submit">Hapus akun nonaktif</button></form>`,
        );
      } else if (a === "purge") {
        manageUI.plan = { id };
        manageDialog_(
          "Hapus permanen",
          `<form data-manage-form="purge"><p>Catatan dalam kelompok ini tidak dapat dipulihkan melalui tempat sampah setelah dihapus permanen. Berkas Drive tetap tersedia bagi cadangan yang sudah dibuat.</p><label class="field">Ketik HAPUS PERMANEN<input name="confirmation" required autocomplete="off"></label><button class="button danger-action" type="submit">Hapus permanen</button></form>`,
        );
      } else if (a === "gallery-new") galleryEditor_();
      else if (a === "gallery-edit")
        galleryEditor_(manageUI.gallery.items.find((r) => r.id === id));
      else if (a === "gallery-publish") {
        const r = manageUI.gallery.items.find((r) => r.id === id);
        await api("setGalleryPublication", {
          id,
          revision: r.revision,
          published: r.status !== "Terbit",
        });
        toast(
          r.status === "Terbit"
            ? "Publikasi ditarik."
            : "Capaian diterbitkan di halaman umum.",
        );
        await galleryView_();
      } else if (a === "gallery-delete") await previewDeleteUI_("Galeri", [id]);
      else if (a === "gallery-photo") {
        const r = manageUI.gallery.items.find((r) => r.id === id),
          token = authLive.token,
          photo = await api("getGalleryPhoto", { id });
        if (token !== authLive.token) return;
        manageDialog_(
          r.title,
          `<img class="gallery-full-photo" src="${esc(galleryImageURL_(photo, r.photo_key))}" alt="${esc(r.title)}"><p>${esc(r.summary)}</p>`,
        );
      }
    } catch (err) {
      toast(err.message);
    } finally {
      manageUI.busy = false;
      finish();
    }
  });
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-manage-form]");
    if (!form) return;
    e.preventDefault();
    if (manageUI.busy || !authLive.token) return;
    manageUI.busy = true;
    const token = authLive.token,
      b = form.querySelector('[type="submit"]'),
      finish = beginButtonLoading_(b, "Menyimpan…");
    try {
      const p = officeValues_(form),
        kind = form.dataset.manageForm;
      if (kind === "trash")
        await api("setDataTrash", { ...manageUI.plan, reason: p.reason });
      else if (kind === "purge")
        await api("purgeData", {
          id: manageUI.plan.id,
          confirmation: p.confirmation,
        });
      else if (kind === "account")
        await api("deleteAccount", {
          id: manageUI.plan.id,
          confirmation: p.confirmation,
        });
      else if (kind === "gallery") {
        const r = manageUI.editor,
          file = form.querySelector('[name="gallery_file"]').files?.[0];
        const upload = file ? await resizeGalleryPhoto_(file) : undefined;
        if (token !== authLive.token) return;
        await api("saveGallery", { ...r, ...p, upload });
      }
      if (token !== authLive.token) return;
      $("#manage-dialog").close();
      toast(
        kind === "gallery"
          ? "Draf capaian tersimpan."
          : kind === "purge"
            ? "Tempat sampah dibersihkan."
            : kind === "account"
              ? "Akun nonaktif dihapus."
              : "Data dipindahkan ke tempat sampah.",
      );
      workUI.programContext = "";
      await load();
    } catch (err) {
      if (token === authLive.token && $("#manage-error"))
        $("#manage-error").textContent = err.message;
    } finally {
      manageUI.busy = false;
      finish();
    }
  });// One archive catalog across Putra/Putri; program/report scopes remain unchanged.
function archiveCanWrite_(permission, record = {}) {
  if (!state.data) return false;
  if (state.data.access.is_admin) return true;
  return state.data.access.grants.some(
    (g) =>
      !g.read_only &&
      g.term_id === (record.term_id || state.query.term_id) &&
      g.actions.includes(permission) &&
      (!Object.hasOwn(record, "department") ||
        !g.department ||
        g.department === record.department),
  );
}
const scopedPermissionScopes_ = scopesFor;
scopesFor = function (permission) {
  if (["saveArchive", "setArchiveTrash"].includes(permission))
    return scopedPermissionScopes_(permission).length ? ["Bersama"] : [];
  return scopedPermissionScopes_(permission);
};
const scopedRender_ = render;
render = function () {
  scopedRender_();
  const archive = state.page === "Arsip & Surat";
  $("#scope-filter").closest("label").hidden ||= archive;
  $("#month-filter").closest("label").hidden ||= archive;
  if (archive && !$("#archive-unified-note"))
    $("#page").insertAdjacentHTML(
      "afterbegin",
      '<p class="archive-unified-note" id="archive-unified-note">Arsip organisasi · Satu daftar untuk Putra dan Putri, tersusun menurut periode, kategori, dan bidang.</p>',
    );
};
const scopedEdit_ = edit;
edit = function (...args) {
  scopedEdit_(...args);
  if (args[0] === "archive") {
    const field = $("#editor-form").elements.scope;
    if (field) {
      field.innerHTML = '<option value="Bersama">Arsip organisasi</option>';
      field.value = "Bersama";
      field.closest("label").hidden = true;
    }
  }
};
const scopedBulkDialog_ = openBulkDialog_;
openBulkDialog_ = function () {
  scopedBulkDialog_();
  const field = $('[name="bulk_scope"]');
  if (field) {
    field.innerHTML = '<option value="Bersama">Arsip organisasi</option>';
    field.value = "Bersama";
    field.closest("label").hidden = true;
    refreshBulkEvents_();
  }
};
refreshBulkEvents_ = function () {
  const target = $('[name="bulk_event"]');
  if (!target) return;
  const previous = target.value || state.archiveEventId || "";
  target.innerHTML =
    '<option value="">Arsip umum</option>' +
    state.data.events
      .map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`)
      .join("");
  if (state.data.events.some((e) => e.id === previous)) target.value = previous;
};
const scopedShowLogin_ = showLogin;
showLogin = function (...args) {
  scopedShowLogin_(...args);
  $("#scope-filter").closest("label").hidden = false;
  $("#month-filter").closest("label").hidden = false;
};

async function startOsdaClient_(){try{if(window.OSDA_BOOT_READY)await window.OSDA_BOOT_READY;initializeClient_()}catch(e){window.OSDA_STARTUP?.fail(e)}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startOsdaClient_,{once:true});else startOsdaClient_();
