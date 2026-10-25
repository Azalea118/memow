/* ============================================================
   ⚙️  CONFIG — EDIT THIS BEFORE SHIPPING
   ============================================================ */
const CONFIG = {
  BASE_URL: "http://127.0.0.1:8000",
};

const STORAGE_KEYS = {
  baseUrl: "vt.baseUrl",
  configBase: "vt.configBase",
  actor: "vt.actor", // sessionStorage — per browser tab session
};
if (localStorage.getItem(STORAGE_KEYS.configBase) !== CONFIG.BASE_URL) {
  localStorage.setItem(STORAGE_KEYS.configBase, CONFIG.BASE_URL);
  localStorage.removeItem(STORAGE_KEYS.baseUrl);
}

const state = {
  view: "dashboard",
  baseUrl: localStorage.getItem(STORAGE_KEYS.baseUrl) || CONFIG.BASE_URL,
  actor: sessionStorage.getItem(STORAGE_KEYS.actor) || "",
  connected: null,
  explorerEp: null,
  analyticsTab: "activity",
  activityTab: "timeline",
  calendarMonth: (() => {
    const d = new Date();
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  })(),
};

const view = document.getElementById("view");
const modalRoot = document.getElementById("modalRoot");
const statusDot = document.getElementById("statusDot");
const baseUrlInput = document.getElementById("baseUrl");
const actorChip = document.getElementById("actorChip");
const actorNameEl = document.getElementById("actorName");

/* ============================================================
   HELPERS
   ============================================================ */
const esc = (s) =>
  String(s ?? "").replace(
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

function parseUTC(s) {
  if (!s) return null;
  let str = String(s);
  if (!/[Zz]$|[+-]\d{2}:?\d{2}$/.test(str)) str += "Z";
  const d = new Date(str);
  return isNaN(d) ? null : d;
}
function fmtDate(iso) {
  const d = parseUTC(iso);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDateShort(iso) {
  const d = parseUTC(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function fmtTimeOnly(iso) {
  const d = parseUTC(iso);
  if (!d) return "—";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function relTime(iso) {
  const d = parseUTC(iso);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  const days = Math.round(h / 24);
  if (days < 30) return days + "d ago";
  return fmtDateShort(iso);
}
function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
function toast(title, detail, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = `<div class="t">${esc(title)}</div>${detail ? `<div class="d">${esc(detail)}</div>` : ""}`;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 320);
  }, 4200);
}
function highlightJSON(data) {
  const json = JSON.stringify(data, null, 2);
  if (json === undefined) return '<span class="faint">undefined</span>';
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (m) => {
      let cls = "j-num";
      if (/^"/.test(m)) cls = /:$/.test(m) ? "j-key" : "j-str";
      else if (/true|false/.test(m)) cls = "j-bool";
      else if (/null/.test(m)) cls = "j-null";
      return `<span class="${cls}">${esc(m)}</span>`;
    },
  );
}
function dayKey(d) {
  return d.toISOString().slice(0, 10);
}
function todayKey() {
  return dayKey(new Date());
}

/* ============================================================
   ACTOR  (X-Actor header)
   ============================================================ */
function updateActorChip() {
  if (state.actor) {
    actorChip.classList.remove("unset");
    actorNameEl.textContent = state.actor;
    actorChip.title = `Acting as "${state.actor}". Click to change.`;
  } else {
    actorChip.classList.add("unset");
    actorNameEl.textContent = "Set name";
    actorChip.title = "Set your name — required for writes (X-Actor).";
  }
}

function promptActor() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("actorOverlay");
    const card = overlay.querySelector(".actor-card");
    card.innerHTML = `
      <h3>Who's making this change?</h3>
      <p class="desc">Your name is recorded on every create, update and delete — it appears in the activity log. Stored for this browser session only.</p>
      <div class="form-row" style="margin-top:16px">
        <label>Your name <span class="req">*</span> <span class="faint">(1–150 chars)</span></label>
        <input type="text" id="actorInput" maxlength="150" value="${esc(state.actor)}" placeholder="e.g. Juan Dela Cruz" autocomplete="off">
      </div>
      <div class="row-flex" style="gap:8px;justify-content:flex-end">
        <button class="btn" id="actorCancel">Cancel</button>
        <button class="btn primary" id="actorSave">Save</button>
      </div>
    `;
    overlay.classList.add("open");

    const input = card.querySelector("#actorInput");
    const finish = (name) => {
      overlay.classList.remove("open");
      card.innerHTML = "";
      resolve(name);
    };
    const save = () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      state.actor = name;
      sessionStorage.setItem(STORAGE_KEYS.actor, name);
      updateActorChip();
      finish(name);
    };
    const cancel = () => finish(null);

    card.querySelector("#actorSave").addEventListener("click", save);
    card.querySelector("#actorCancel").addEventListener("click", cancel);
    overlay.querySelector(".actor-backdrop").onclick = cancel;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 40);
  });
}

actorChip.addEventListener("click", () => promptActor());
updateActorChip();

/* ============================================================
   HTTP LAYER
   ============================================================ */
class ApiError extends Error {
  constructor(kind, message, result) {
    super(message);
    this.kind = kind;
    this.result = result;
  }
}

/* Determine if a write endpoint requires X-Actor.
   Removals use removed_by in the body instead. */
function pathNeedsActor(method, path) {
  if (method === "GET") return false;
  if (!/^\/(employees|violation-types|violations)(\/|$)/.test(path))
    return false;
  if (/\/remove$/.test(path)) return false;
  if (/\/violations\/clear$/.test(path)) return false;
  return true;
}

function buildQuery(query) {
  if (!query) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    usp.append(k, v);
  }
  const s = usp.toString();
  return s ? "?" + s : "";
}

async function req(method, path, { query, body } = {}) {
  // Auto-prompt for actor before writes
  if (pathNeedsActor(method, path) && !state.actor) {
    const name = await promptActor();
    if (!name)
      throw new ApiError("cancelled", "Cancelled — no actor set.", null);
  }

  const base = state.baseUrl.replace(/\/+$/, "");
  const url = base + path + buildQuery(query);

  const headers = {};
  if (body !== undefined && body !== null)
    headers["Content-Type"] = "application/json";
  if (pathNeedsActor(method, path)) headers["X-Actor"] = state.actor;

  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body:
        body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError(
      "network",
      "Network error — API unreachable, or CORS is blocking the request.",
      null,
    );
  }
  const ms = Math.round(performance.now() - t0);

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: res.ok, status: res.status, data, ms, url, method };
}

async function call(method, path, opts) {
  const r = await req(method, path, opts);
  if (!r.ok) throw new ApiError("http", `HTTP ${r.status}`, r);
  return r.data;
}

function describeError(result) {
  if (!result) return { title: "Request failed", detail: "", fields: [] };
  const d = result.data;
  if (!d || typeof d !== "object")
    return {
      title: `HTTP ${result.status}`,
      detail: typeof d === "string" ? d : "",
      fields: [],
    };
  if (Array.isArray(d.detail)) {
    return {
      title: "Validation failed (422)",
      detail: "",
      fields: d.detail.map((f) => ({
        loc: Array.isArray(f.loc) ? f.loc.join(".") : String(f.loc || ""),
        msg: f.msg || "",
      })),
    };
  }
  return {
    title: d.error || `HTTP ${result.status}`,
    detail: d.detail || "",
    fields: [],
  };
}

function errorBanner(err) {
  if (!err) return "";
  if (err.kind === "cancelled") return "";
  if (err.kind === "network") {
    return `<div class="callout err"><div class="ic">⚠</div><div><strong>Cannot reach the API.</strong> The server may be down, or CORS is blocking the browser.<br>Add this to <code>app/main.py</code> on the backend:
      <pre>from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)</pre></div></div>`;
  }
  const d = describeError(err.result);
  let html = `<div class="callout err"><div class="ic">✕</div><div><strong>${esc(d.title)}</strong>`;
  if (d.detail) html += `<br>${esc(d.detail)}`;
  if (d.fields.length)
    html +=
      "<br>" +
      d.fields
        .map((f) => `<code>${esc(f.loc)}</code> — ${esc(f.msg)}`)
        .join("<br>");
  html += "</div></div>";
  return html;
}
const isCancelled = (e) => e && e.kind === "cancelled";

function setStatus(kind, title) {
  statusDot.className = "dot " + kind;
  statusDot.title = title || "";
}
async function ping() {
  setStatus("busy", "Checking…");
  try {
    const r = await req("GET", "/violation-types");
    if (r.ok) {
      state.connected = true;
      setStatus("ok", `Connected · ${r.ms}ms`);
      toast("Connected", `${state.baseUrl} · ${r.ms}ms`, "ok");
    } else {
      state.connected = false;
      setStatus("err", `HTTP ${r.status}`);
      toast("Reached server", `Unexpected status ${r.status}`, "warn");
    }
  } catch (e) {
    state.connected = false;
    setStatus("err", "Unreachable");
    toast("Connection failed", e.message, "err");
  }
  return state.connected;
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal(html, opts = {}) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal ${opts.wide ? "wide" : ""}">${html}</div></div>`;
  modalRoot.classList.add("open");
  const backdrop = modalRoot.querySelector(".modal-backdrop");
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", onEsc);
  backdrop
    .querySelectorAll("[data-close]")
    .forEach((b) => b.addEventListener("click", closeModal));
  if (opts.onMount) opts.onMount(backdrop.querySelector(".modal"));
}
function closeModal() {
  modalRoot.classList.remove("open");
  modalRoot.innerHTML = "";
  document.removeEventListener("keydown", onEsc);
}
function onEsc(e) {
  if (e.key === "Escape") closeModal();
}

function confirmModal({
  title,
  body,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
}) {
  openModal(
    `
    <div class="modal-head"><h3>${esc(title)}</h3><button class="close" data-close>✕</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancel</button>
      <button class="btn ${danger ? "danger" : "primary"}" id="mConfirm">${esc(confirmLabel)}</button>
    </div>
  `,
    {
      onMount(m) {
        m.querySelector("#mConfirm").addEventListener("click", async () => {
          const btn = m.querySelector("#mConfirm");
          btn.disabled = true;
          try {
            await onConfirm();
          } catch (e) {
            if (!isCancelled(e)) throw e;
          } finally {
            btn.disabled = false;
          }
        });
      },
    },
  );
}

/* ============================================================
   NAV
   ============================================================ */
const elHamburger = document.getElementById("hamburger");
const elSidenav = document.getElementById("sidenav");
const elNavOverlay = document.getElementById("navOverlay");
const MOBILE_BREAKPOINT = 900;

function openNav() {
  elSidenav.classList.add("open");
  elNavOverlay.classList.add("open");
  elHamburger.setAttribute("aria-expanded", "true");
  document.body.classList.add("nav-open");
}
function closeNav() {
  elSidenav.classList.remove("open");
  elNavOverlay.classList.remove("open");
  elHamburger.setAttribute("aria-expanded", "false");
  document.body.classList.remove("nav-open");
}
elHamburger.addEventListener("click", () =>
  elSidenav.classList.contains("open") ? closeNav() : openNav(),
);
elNavOverlay.addEventListener("click", closeNav);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && elSidenav.classList.contains("open")) closeNav();
});
window.addEventListener("resize", () => {
  if (window.innerWidth > MOBILE_BREAKPOINT) closeNav();
});

const ROUTES = {
  dashboard: renderDashboard,
  employees: renderEmployees,
  types: renderTypes,
  violations: renderViolations,
  removals: renderRemovals,
  activity: renderActivity,
  analytics: renderAnalytics,
  explorer: renderExplorer,
};

function navigate(name) {
  state.view = name;
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.classList.toggle("active", b.dataset.nav === name));
  view.scrollTop = 0;
  ROUTES[name]();
}

elSidenav.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (btn) {
    navigate(btn.dataset.nav);
    if (window.innerWidth <= MOBILE_BREAKPOINT) closeNav();
  }
});

/* ============================================================
   DASHBOARD
   ============================================================ */
async function renderDashboard() {
  view.innerHTML = `
    <div class="page-head">
      <div><h2>Dashboard</h2><p class="sub">Live overview pulled from every corner of the API.</p></div>
      <div class="actions"><button class="btn" id="refreshDash">↻ Refresh</button></div>
    </div>
    <div id="dashContent"><div class="loading"><span class="spinner"></span>Loading dashboard…</div></div>
  `;
  document
    .getElementById("refreshDash")
    .addEventListener("click", loadDashboard);
  loadDashboard();
}

async function loadDashboard() {
  const el = document.getElementById("dashContent");
  el.innerHTML = `<div class="loading"><span class="spinner"></span>Loading dashboard…</div>`;

  const [empRes, actRes, offRes, watchRes, feedRes, deptRes, remRes] =
    await Promise.allSettled([
      call("GET", "/employees", { query: { limit: 1 } }),
      call("GET", "/analytics/activity", {
        query: { days: 30, bucket: "day" },
      }),
      call("GET", "/analytics/top-offenders", {
        query: { by: "points", limit: 6 },
      }),
      call("GET", "/analytics/watchlist", { query: { min_strikes: 2 } }),
      call("GET", "/violations/recent", {
        query: { days: 14, limit: 6 },
      }),
      call("GET", "/analytics/departments"),
      call("GET", "/violation-removals", { query: { limit: 5 } }),
    ]);

  const allFailed = [empRes, actRes, offRes, watchRes, feedRes, deptRes].every(
    (r) => r.status === "rejected",
  );
  if (allFailed) {
    el.innerHTML = errorBanner(empRes.reason);
    return;
  }

  const employees =
    empRes.status === "fulfilled" ? empRes.value : { items: [], total: 0 };
  const activity = actRes.status === "fulfilled" ? actRes.value : [];
  const offenders = offRes.status === "fulfilled" ? offRes.value : [];
  const watchlist = watchRes.status === "fulfilled" ? watchRes.value : [];
  const feed = feedRes.status === "fulfilled" ? feedRes.value : [];
  const departments = deptRes.status === "fulfilled" ? deptRes.value : [];
  const removals =
    remRes.status === "fulfilled" ? remRes.value : { items: [], total: 0 };

  const totalPoints = departments.reduce(
    (s, d) => s + (d.total_points || 0),
    0,
  );
  const totalRecords = departments.reduce(
    (s, d) => s + (d.total_records || 0),
    0,
  );
  const filled = fillActivity(activity, 30, "day");

  let html = "";

  html += `<div class="stat-grid">
    <div class="stat"><div class="k">Employees</div><div class="v">${empRes.status === "fulfilled" ? employees.total : "—"}</div><div class="m">active records on file</div></div>
    <div class="stat danger"><div class="k">Total Violations</div><div class="v">${deptRes.status === "fulfilled" ? totalRecords : "—"}</div><div class="m">across all departments</div></div>
    <div class="stat warn"><div class="k">Total Points</div><div class="v">${deptRes.status === "fulfilled" ? totalPoints : "—"}</div><div class="m">issued company-wide</div></div>
    <div class="stat ok"><div class="k">Watchlist</div><div class="v">${watchRes.status === "fulfilled" ? watchlist.length : "—"}</div><div class="m">at ≥ 2 strikes</div></div>
  </div>`;

  html += `<div class="card">
    <div class="card-head"><h3>Violation Activity</h3><span class="hint">GET /analytics/activity?days=30&amp;bucket=day</span><div class="right"><span class="badge info">${filled.reduce((s, r) => s + r.count, 0)} events · 30d</span></div></div>
    <div class="chart-wrap">${renderBarChart(filled)}</div>
  </div>`;

  html += `<div class="grid-2" style="margin-top:18px">`;

  html += `<div class="card">
    <div class="card-head"><h3>Top Offenders</h3><span class="hint">by points</span></div>
    <div class="card-body tight">
      ${
        offenders.length
          ? `<table><tbody>${offenders
              .map(
                (o) => `
        <tr class="clickable" data-emp="${o.id}">
          <td style="width:36px"><div class="feed-avatar" style="width:28px;height:28px;font-size:10px">${esc(initials(o.full_name))}</div></td>
          <td><div style="font-weight:550">${esc(o.full_name)}</div><div class="faint" style="font-size:11.5px">${esc(o.employee_code)}${o.department ? " · " + esc(o.department) : ""}</div></td>
          <td class="num">${o.total_points}</td>
          <td class="num">${o.total_strikes > 0 ? `<span class="badge strike">${o.total_strikes}★</span>` : '<span class="faint">—</span>'}</td>
        </tr>`,
              )
              .join("")}</tbody></table>`
          : `<div class="empty">No offenders yet</div>`
      }
    </div>
  </div>`;

  html += `<div class="card">
    <div class="card-head"><h3>Recent Activity</h3><span class="hint">last 14 days</span></div>
    <div class="card-body tight">
      ${
        feed.length
          ? feed
              .map(
                (f) => `
        <div class="feed-item">
          <div class="feed-avatar">${esc(initials(f.employee ? f.employee.full_name : "?"))}</div>
          <div class="feed-body">
            <div class="line1"><span class="who">${esc(f.employee ? f.employee.full_name : "Unknown")}</span>${f.is_strike ? '<span class="badge strike">strike</span>' : ""}</div>
            <div class="line2">${esc(f.violation_type_name || "—")} · +${f.points} pts</div>
          </div>
          <div class="feed-meta"><div class="faint" style="font-size:11px">${esc(relTime(f.issued_at))}</div></div>
        </div>`,
              )
              .join("")
          : `<div class="empty">No recent violations</div>`
      }
    </div>
  </div>`;

  html += `</div>`;

  if (departments.length) {
    html += `<div class="card" style="margin-top:18px">
      <div class="card-head"><h3>Department Rollup</h3><span class="hint">GET /analytics/departments</span></div>
      <div class="card-body tight">
        <table>
          <thead><tr><th>Department</th><th class="num">Employees</th><th class="num">Records</th><th class="num">Points</th><th class="num">Strikes</th></tr></thead>
          <tbody>${departments
            .map(
              (d) => `
            <tr><td>${d.department ? esc(d.department) : '<span class="faint">— unassigned —</span>'}</td><td class="num">${d.employees}</td><td class="num">${d.total_records}</td><td class="num">${d.total_points}</td><td class="num">${d.total_strikes}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
    </div>`;
  }

  if (removals.items && removals.items.length) {
    html += `<div class="card" style="margin-top:18px">
      <div class="card-head"><h3>Recent Removals</h3><span class="hint">GET /violation-removals</span><div class="right"><button class="btn sm" id="dashViewRemovals">View all →</button></div></div>
      <div class="card-body tight">
        ${removals.items
          .map(
            (r) => `
          <div class="feed-item">
            <div class="feed-avatar" style="background:rgba(139,109,255,.15);color:#a891ff;border-color:rgba(139,109,255,.3)">✕</div>
            <div class="feed-body">
              <div class="line1"><span class="who">${esc(r.employee_full_name)}</span><span class="badge audit">removed</span></div>
              <div class="line2">${esc(r.violation_type_name)} · +${r.points} pts · by ${esc(r.removed_by)}</div>
            </div>
            <div class="feed-meta"><div class="faint" style="font-size:11px">${esc(relTime(r.removed_at))}</div></div>
          </div>`,
          )
          .join("")}
      </div>
    </div>`;
  }

  el.innerHTML = html;
  el.querySelectorAll("[data-emp]").forEach((row) =>
    row.addEventListener("click", () => openEmployee(Number(row.dataset.emp))),
  );
  const vr = el.querySelector("#dashViewRemovals");
  if (vr) vr.addEventListener("click", () => navigate("removals"));
}

function monthKey(d) {
  return d.toISOString().slice(0, 7);
}
function weekKey(date) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function fillActivity(rows, days, bucket) {
  const map = new Map(rows.map((r) => [r.bucket, r]));
  const now = new Date();
  const start = new Date(now.getTime() - (days - 1) * 86400000);
  const keys = [];
  if (bucket === "day") {
    const d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    while (d <= end) {
      keys.push(dayKey(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else if (bucket === "week") {
    const d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    while (d <= now) {
      keys.push(weekKey(d));
      d.setUTCDate(d.getUTCDate() + 7);
    }
  } else {
    const d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    while (d <= now) {
      keys.push(monthKey(d));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(map.get(k) || { bucket: k, count: 0, points: 0 });
  }
  return out;
}
function renderBarChart(rows) {
  if (!rows.length) return '<div class="empty">No data</div>';
  const max = Math.max(...rows.map((r) => r.count), 1);
  const bars = rows
    .map((r) => {
      const pct = r.count === 0 ? 0 : Math.max(3, (r.count / max) * 100);
      return `<div class="bar ${r.count === 0 ? "zero" : ""}" style="height:${pct}%" data-tip="${esc(r.bucket)} · ${r.count} violation${r.count === 1 ? "" : "s"} · ${r.points} pts"></div>`;
    })
    .join("");
  return `<div class="chart">${bars}</div><div class="xaxis"><span>${esc(rows[0].bucket)}</span><span>${esc(rows[rows.length - 1].bucket)}</span></div>`;
}

/* ============================================================
   EMPLOYEES
   ============================================================ */
const empState = { offset: 0, limit: 25 };

async function renderEmployees() {
  view.innerHTML = `
    <div class="page-head">
      <div><h2>Employees</h2><p class="sub">Search, filter, and manage every employee record.</p></div>
      <div class="actions">
        <button class="btn" id="bulkBtn">Bulk import</button>
        <button class="btn primary" id="newEmpBtn">+ New Employee</button>
      </div>
    </div>
    <div class="card">
      <div class="filters">
        <input type="text" id="fSearch" placeholder="Search name or code…">
        <input type="text" id="fDept" placeholder="Department">
        <input type="text" id="fPos" placeholder="Position">
        <input type="number" id="fMinPts" min="0" placeholder="Min points" style="width:110px">
        <input type="number" id="fMinStrikes" min="0" placeholder="Min strikes" style="width:110px">
        <label class="chk"><input type="checkbox" id="fInactive"> Include inactive</label>
        <button class="btn" id="fApply">Search</button>
        <button class="btn ghost" id="fClear">Clear</button>
      </div>
      <div id="empWarn"></div>
      <div id="empList"><div class="loading"><span class="spinner"></span>Loading…</div></div>
      <div class="pager" id="empPager"></div>
    </div>
  `;
  document.getElementById("fApply").addEventListener("click", () => {
    empState.offset = 0;
    loadEmployees();
  });
  document.getElementById("fClear").addEventListener("click", () => {
    ["fSearch", "fDept", "fPos", "fMinPts", "fMinStrikes"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    document.getElementById("fInactive").checked = false;
    empState.offset = 0;
    loadEmployees();
  });
  document.getElementById("fSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      empState.offset = 0;
      loadEmployees();
    }
  });
  document
    .getElementById("newEmpBtn")
    .addEventListener("click", newEmployeeModal);
  document
    .getElementById("bulkBtn")
    .addEventListener("click", bulkEmployeeModal);
  loadEmployees();
}

function readEmpFilters() {
  return {
    search: document.getElementById("fSearch").value.trim(),
    department: document.getElementById("fDept").value.trim(),
    position: document.getElementById("fPos").value.trim(),
    min_points: document.getElementById("fMinPts").value.trim(),
    min_strikes: document.getElementById("fMinStrikes").value.trim(),
    include_inactive: document.getElementById("fInactive").checked
      ? "true"
      : "",
  };
}

async function loadEmployees() {
  const list = document.getElementById("empList");
  const pager = document.getElementById("empPager");
  const warn = document.getElementById("empWarn");
  list.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;
  warn.innerHTML = "";
  pager.innerHTML = "";
  const f = readEmpFilters();
  try {
    const data = await call("GET", "/employees", {
      query: { ...f, limit: empState.limit, offset: empState.offset },
    });
    const unreliable = f.search || f.position || f.min_points || f.min_strikes;
    if (unreliable) {
      warn.innerHTML = `<div class="callout" style="margin:0;border-radius:0;border-left:none;border-right:none"><div class="ic">⚠</div>
        <div><strong>Heads up:</strong> with <code>search</code>, <code>position</code>, <code>min_points</code> or <code>min_strikes</code> active, the server's <code>total</code> is over-counted (rows are correct).</div></div>`;
    }
    if (!data.items.length) {
      list.innerHTML = `<div class="empty"><div class="big">◌</div>No employees match those filters.</div>`;
      return;
    }

    list.innerHTML = `<table>
      <thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Position</th><th>Status</th><th class="num">Points</th><th class="num">Strikes</th><th></th></tr></thead>
      <tbody>${data.items
        .map(
          (e) => `
        <tr class="clickable" data-id="${e.id}">
          <td class="mono">${esc(e.employee_code)}</td>
          <td style="font-weight:550">${esc(e.full_name)}</td>
          <td>${e.department ? esc(e.department) : '<span class="faint">—</span>'}</td>
          <td>${e.position ? esc(e.position) : '<span class="faint">—</span>'}</td>
          <td>${e.status === "active" ? '<span class="badge ok">active</span>' : '<span class="badge off">inactive</span>'}</td>
          <td class="num">${e.total_points}</td>
          <td class="num">${e.total_strikes > 0 ? `<span class="badge strike">${e.total_strikes}</span>` : '<span class="faint">0</span>'}</td>
          <td style="width:32px"><span class="faint">›</span></td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>`;

    list
      .querySelectorAll("tr[data-id]")
      .forEach((tr) =>
        tr.addEventListener("click", () => openEmployee(Number(tr.dataset.id))),
      );

    const shownEnd = empState.offset + data.items.length;
    const total = unreliable ? null : data.total;
    const hasNext = data.items.length === empState.limit;
    pager.innerHTML = `
      <span class="info">${empState.offset + 1}–${shownEnd}${total !== null ? " of " + total : ""}</span>
      ${total === null ? '<span class="badge warn">total unreliable</span>' : ""}
      <span class="spacer"></span>
      <button class="btn sm" id="pPrev" ${empState.offset === 0 ? "disabled" : ""}>← Prev</button>
      <button class="btn sm" id="pNext" ${!hasNext ? "disabled" : ""}>Next →</button>
    `;
    const prev = pager.querySelector("#pPrev");
    const next = pager.querySelector("#pNext");
    if (prev)
      prev.addEventListener("click", () => {
        empState.offset = Math.max(0, empState.offset - empState.limit);
        loadEmployees();
      });
    if (next)
      next.addEventListener("click", () => {
        empState.offset += empState.limit;
        loadEmployees();
      });
  } catch (e) {
    list.innerHTML = errorBanner(e);
  }
}

async function openEmployee(id) {
  openModal(
    `
    <div class="modal-head"><h3>Employee</h3><button class="close" data-close>✕</button></div>
    <div class="modal-body"><div class="loading"><span class="spinner"></span>Loading…</div></div>
  `,
    { wide: true },
  );
  try {
    const emp = await call("GET", `/employees/${id}`);
    renderEmployeeDetail(modalRoot.querySelector(".modal"), emp);
  } catch (e) {
    modalRoot.querySelector(".modal-body").innerHTML = errorBanner(e);
  }
}

function renderEmployeeDetail(modal, emp) {
  const isActive = emp.status === "active";
  const records = emp.violation_records || [];

  modal.querySelector(".modal-head").innerHTML = `
    <div class="feed-avatar" style="width:38px;height:38px;font-size:13px">${esc(initials(emp.full_name))}</div>
    <div style="min-width:0">
      <h3 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(emp.full_name)}</h3>
      <div class="faint mono" style="font-size:11.5px">${esc(emp.employee_code)}</div>
    </div>
    <button class="close" data-close>✕</button>
  `;
  modal.querySelector(".close").addEventListener("click", closeModal);

  modal.querySelector(".modal-body").innerHTML = `
    <div class="row-flex" style="gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${isActive ? '<span class="badge ok">active</span>' : '<span class="badge off">inactive</span>'}
      ${emp.department ? `<span class="badge info">${esc(emp.department)}</span>` : ""}
      ${emp.position ? `<span class="badge info">${esc(emp.position)}</span>` : ""}
      <span class="right faint mono" style="font-size:11px">updated ${esc(relTime(emp.updated_at || emp.created_at))}</span>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
      <div class="stat" style="padding:12px 14px"><div class="k">Points</div><div class="v" style="font-size:22px">${emp.total_points}</div></div>
      <div class="stat danger" style="padding:12px 14px"><div class="k">Strikes</div><div class="v" style="font-size:22px">${emp.total_strikes}</div></div>
      <div class="stat" style="padding:12px 14px"><div class="k">Records</div><div class="v" style="font-size:22px">${records.length}</div></div>
    </div>

    <div class="divider"></div>

    <div style="display:flex;align-items:center;margin-bottom:10px"><strong style="font-size:13px">Violation history</strong><span class="right faint mono" style="font-size:11px">newest first</span></div>

    ${
      records.length
        ? `<div style="border:1px solid var(--border);border-radius:9px;overflow:hidden">
      ${records
        .map(
          (r) => `
        <div class="feed-item" style="padding:11px 14px">
          <div class="feed-body">
            <div class="line1">
              <span class="who">${esc(r.violation_type_name || (r.violation_type ? r.violation_type.name : "Unknown"))}</span>
              ${r.is_strike ? '<span class="badge strike">strike</span>' : ""}
              <span class="badge info">+${r.points}</span>
            </div>
            <div class="line2">${esc(fmtDate(r.issued_at))}${r.issued_by ? " · by " + esc(r.issued_by) : ""}${r.notes ? "<br>" + esc(r.notes) : ""}</div>
          </div>
          <div class="feed-meta"><button class="btn sm danger" data-remove-rec="${r.id}" title="Remove violation (audited)">Remove</button></div>
        </div>`,
        )
        .join("")}
    </div>`
        : '<div class="empty" style="padding:24px">Clean record — no violations.</div>'
    }

    <div class="divider"></div>
    <div class="row-flex modal-actions" style="flex-wrap:wrap;gap:8px">
      <button class="btn primary" id="mIssue">+ Issue violation</button>
      ${isActive ? '<button class="btn" id="mDeactivate">Deactivate</button>' : '<button class="btn" id="mReactivate">Reactivate</button>'}
      <button class="btn" id="mEdit">Edit details</button>
      <span class="right"></span>
      <button class="btn danger" id="mClearAll" ${records.length ? "" : "disabled"}>Clear all violations</button>
      <button class="btn danger" id="mDelete">Delete employee</button>
    </div>
    <div class="faint" style="font-size:11px;margin-top:10px">
      Clearing and removing are audited (<code>removed_by</code> + <code>reason</code>). Deleting the employee <strong>bypasses the audit trail</strong> — prefer deactivate.
    </div>
  `;

  const body = modal.querySelector(".modal-body");
  body
    .querySelector("#mIssue")
    .addEventListener("click", () => issueViolationModal(emp));
  body
    .querySelector("#mEdit")
    .addEventListener("click", () =>
      editEmployeeModal(emp, () => openEmployee(emp.id)),
    );

  const dact = body.querySelector("#mDeactivate");
  if (dact)
    dact.addEventListener("click", () =>
      simpleAction(
        "POST",
        `/employees/${emp.id}/deactivate`,
        "Employee deactivated",
        () => openEmployee(emp.id),
      ),
    );
  const ract = body.querySelector("#mReactivate");
  if (ract)
    ract.addEventListener("click", () =>
      simpleAction(
        "POST",
        `/employees/${emp.id}/reactivate`,
        "Employee reactivated",
        () => openEmployee(emp.id),
      ),
    );

  body.querySelector("#mClearAll").addEventListener("click", () => {
    if (!records.length) return;
    clearAllFormModal(emp, {
      count: records.length,
      onDone: () => {
        if (state.view === "employees") loadEmployees();
        if (state.view === "removals") renderRemovals();
        else openEmployee(emp.id);
      },
    });
  });

  body.querySelector("#mDelete").addEventListener("click", () => {
    confirmModal({
      title: "Delete employee?",
      danger: true,
      confirmLabel: "Delete permanently",
      body: `
        <div class="callout err" style="margin-bottom:14px">
          <div class="ic">⚠</div>
          <div><strong>This bypasses the audit trail.</strong> All ${records.length} violation record${records.length === 1 ? "" : "s"} will be deleted <em>silently</em> — no <code>violation_removals</code> entries are written.</div>
        </div>
        <p style="font-size:13px;color:var(--muted)">Hard-deletes <strong>${esc(emp.full_name)}</strong> and cascades. If you need every removal logged, use <em>deactivate</em> instead.</p>
      `,
      onConfirm: async () => {
        try {
          await call("DELETE", `/employees/${emp.id}`);
          toast("Employee deleted", emp.full_name, "ok");
          closeModal();
          if (state.view === "employees") loadEmployees();
        } catch (e) {
          if (isCancelled(e)) return;
          toast("Delete failed", describeError(e.result).title, "err");
        }
      },
    });
  });

  body.querySelectorAll("[data-remove-rec]").forEach((b) => {
    b.addEventListener("click", () => {
      const rec = records.find((r) => r.id === Number(b.dataset.removeRec));
      if (!rec) return;
      const enriched = {
        ...rec,
        employee_full_name: emp.full_name,
        employee_code: emp.employee_code,
      };
      removalFormModal(enriched, {
        onDone: () => {
          openEmployee(emp.id);
          if (state.view === "removals") renderRemovals();
        },
      });
    });
  });
}

async function simpleAction(method, path, okMsg, after) {
  try {
    await call(method, path);
    toast(okMsg, "", "ok");
    if (after) after();
    if (state.view === "employees") loadEmployees();
  } catch (e) {
    if (isCancelled(e)) return;
    toast("Action failed", describeError(e.result).title, "err");
  }
}

function newEmployeeModal() {
  openModal(
    `
    <div class="modal-head"><h3>New Employee</h3><button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div id="neErr"></div>
      <div class="form-grid">
        <div class="form-row"><label>Employee code</label><input type="text" id="neCode" placeholder="EMP-001"></div>
        <div class="form-row"><label>Department <span class="opt">optional</span></label><input type="text" id="neDept"></div>
        <div class="form-row"><label>First name</label><input type="text" id="neFirst"></div>
        <div class="form-row"><label>Last name</label><input type="text" id="neLast"></div>
        <div class="form-row full"><label>Position <span class="opt">optional</span></label><input type="text" id="nePos"></div>
      </div>
      <div class="faint" style="font-size:11.5px">New employees are always created with status <code>active</code>.</div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="neSave">Create</button></div>
  `,
    {
      onMount(m) {
        m.querySelector("#neSave").addEventListener("click", async () => {
          const errBox = m.querySelector("#neErr");
          errBox.innerHTML = "";
          const payload = {
            employee_code: m.querySelector("#neCode").value.trim(),
            first_name: m.querySelector("#neFirst").value.trim(),
            last_name: m.querySelector("#neLast").value.trim(),
            department: m.querySelector("#neDept").value.trim() || null,
            position: m.querySelector("#nePos").value.trim() || null,
          };
          try {
            const created = await call("POST", "/employees", {
              body: payload,
            });
            toast(
              "Employee created",
              `${created.full_name} · ${created.employee_code}`,
              "ok",
            );
            closeModal();
            empState.offset = 0;
            loadEmployees();
          } catch (e) {
            if (isCancelled(e)) return;
            errBox.innerHTML = errorBanner(e);
          }
        });
      },
    },
  );
}

function editEmployeeModal(emp, after) {
  openModal(
    `
    <div class="modal-head"><h3>Edit Employee</h3><button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div id="eeErr"></div>
      <div class="form-grid">
        <div class="form-row"><label>Employee code</label><input type="text" id="eeCode" value="${esc(emp.employee_code)}"></div>
        <div class="form-row"><label>Department</label><input type="text" id="eeDept" value="${esc(emp.department || "")}"></div>
        <div class="form-row"><label>First name</label><input type="text" id="eeFirst" value="${esc(emp.first_name)}"></div>
        <div class="form-row"><label>Last name</label><input type="text" id="eeLast" value="${esc(emp.last_name)}"></div>
        <div class="form-row full"><label>Position</label><input type="text" id="eePos" value="${esc(emp.position || "")}"></div>
      </div>
      <div class="callout" style="margin:0"><div class="ic">⚠</div><div><strong>Known limitation:</strong> sending <code>null</code> is a no-op — you cannot currently clear a field through the API.</div></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="eeSave">Save changes</button></div>
  `,
    {
      onMount(m) {
        m.querySelector("#eeSave").addEventListener("click", async () => {
          const errBox = m.querySelector("#eeErr");
          errBox.innerHTML = "";
          const payload = {};
          const code = m.querySelector("#eeCode").value.trim();
          const first = m.querySelector("#eeFirst").value.trim();
          const last = m.querySelector("#eeLast").value.trim();
          const dept = m.querySelector("#eeDept").value.trim();
          const pos = m.querySelector("#eePos").value.trim();
          if (code && code !== emp.employee_code) payload.employee_code = code;
          if (first && first !== emp.first_name) payload.first_name = first;
          if (last && last !== emp.last_name) payload.last_name = last;
          if (dept && dept !== (emp.department || ""))
            payload.department = dept;
          if (pos && pos !== (emp.position || "")) payload.position = pos;
          if (!Object.keys(payload).length) {
            toast("Nothing to update", "No fields changed", "warn");
            return;
          }
          try {
            await call("PATCH", `/employees/${emp.id}`, {
              body: payload,
            });
            toast("Employee updated", emp.full_name, "ok");
            closeModal();
            if (after) after();
            if (state.view === "employees") loadEmployees();
          } catch (e) {
            if (isCancelled(e)) return;
            errBox.innerHTML = errorBanner(e);
          }
        });
      },
    },
  );
}

function bulkEmployeeModal() {
  const sample = JSON.stringify(
    [
      {
        employee_code: "EMP-101",
        first_name: "Ada",
        last_name: "Lovelace",
        department: "Engineering",
      },
      {
        employee_code: "EMP-102",
        first_name: "Alan",
        last_name: "Turing",
        department: "Engineering",
      },
    ],
    null,
    2,
  );

  openModal(
    `
    <div class="modal-head"><h3>Bulk Import Employees</h3><button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div id="biErr"></div>
      <div class="callout" style="margin-bottom:14px"><div class="ic">⚠</div><div><strong>All-or-nothing.</strong> If any <code>employee_code</code> already exists, the entire batch fails with <code>409</code> and nothing is inserted.</div></div>
      <div class="form-row"><label>JSON array of EmployeeCreate</label><textarea id="biBody" rows="12" spellcheck="false">${esc(sample)}</textarea></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="biSend">Import</button></div>
  `,
    {
      wide: true,
      onMount(m) {
        m.querySelector("#biSend").addEventListener("click", async () => {
          const errBox = m.querySelector("#biErr");
          errBox.innerHTML = "";
          let payload;
          try {
            payload = JSON.parse(m.querySelector("#biBody").value);
          } catch (e) {
            errBox.innerHTML = `<div class="callout err"><div class="ic">✕</div><div>Invalid JSON: ${esc(e.message)}</div></div>`;
            return;
          }
          try {
            const res = await call("POST", "/employees/bulk", {
              body: payload,
            });
            toast(
              "Bulk import complete",
              `${res.created} employee(s) created`,
              "ok",
            );
            closeModal();
            empState.offset = 0;
            loadEmployees();
          } catch (e) {
            if (isCancelled(e)) return;
            errBox.innerHTML = errorBanner(e);
          }
        });
      },
    },
  );
}

async function issueViolationModal(emp) {
  let types = [];
  try {
    types = await call("GET", "/violation-types");
  } catch (e) {
    toast(
      "Could not load violation types",
      describeError(e.result).title,
      "err",
    );
    return;
  }
  if (!types.length) {
    toast(
      "No violation types",
      "Create one first, or all types are deactivated.",
      "warn",
    );
    return;
  }

  openModal(
    `
    <div class="modal-head">
      <h3>Issue violation</h3>
      <div class="faint mono" style="font-size:11.5px">${esc(emp.full_name)} · ${esc(emp.employee_code)}</div>
      <button class="close" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div id="ivErr"></div>
      <div class="form-row"><label>Violation type</label>
        <select id="ivType">${types.map((t) => `<option value="${t.id}">${esc(t.name)} — ${t.default_points} pts${t.is_strike ? " · strike" : ""}</option>`).join("")}</select>
      </div>
      <div class="callout" style="margin:0 0 14px"><div class="ic">ℹ</div><div><code>points</code> and <code>is_strike</code> are snapshotted from the type — historical records never change if the type is later edited.</div></div>
      <div class="form-grid">
        <div class="form-row"><label>Issued by <span class="opt">optional</span></label><input type="text" id="ivBy" placeholder="Supervisor name"></div>
        <div class="form-row"><label>Issued at <span class="opt">optional</span></label><input type="datetime-local" id="ivAt"></div>
        <div class="form-row full"><label>Notes <span class="opt">optional</span></label><textarea id="ivNotes" rows="3" placeholder="Context…"></textarea></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ivSend">Issue violation</button></div>
  `,
    {
      onMount(m) {
        m.querySelector("#ivSend").addEventListener("click", async () => {
          const errBox = m.querySelector("#ivErr");
          errBox.innerHTML = "";
          const payload = {
            violation_type_id: Number(m.querySelector("#ivType").value),
          };
          const by = m.querySelector("#ivBy").value.trim();
          const notes = m.querySelector("#ivNotes").value.trim();
          const at = m.querySelector("#ivAt").value;
          if (by) payload.issued_by = by;
          if (notes) payload.notes = notes;
          if (at) payload.issued_at = new Date(at).toISOString();
          try {
            const rec = await call("POST", `/employees/${emp.id}/violations`, {
              body: payload,
            });
            toast(
              "Violation issued",
              `${rec.violation_type_name || "Record"} · +${rec.points} pts`,
              "ok",
            );
            closeModal();
            if (state.view === "violations") loadRecentFeed();
            if (state.view === "employees") loadEmployees();
          } catch (e) {
            if (isCancelled(e)) return;
            errBox.innerHTML = errorBanner(e);
          }
        });
      },
    },
  );
}

/* ============================================================
   VIOLATION TYPES
   ============================================================ */
async function renderTypes() {
  view.innerHTML = `
    <div class="page-head">
      <div><h2>Violation Types</h2><p class="sub">The rulebook. Editing a type never rewrites historical records.</p></div>
      <div class="actions"><button class="btn primary" id="newTypeBtn">+ New Type</button></div>
    </div>
    <div class="card">
      <div class="filters">
        <label class="chk"><input type="checkbox" id="tInactive" checked> Include inactive</label>
        <select id="tStrikes" style="width:160px">
          <option value="">All types</option><option value="true">Strikes only</option><option value="false">Non-strike only</option>
        </select>
        <button class="btn" id="tApply">Apply</button>
      </div>
      <div id="typeList"><div class="loading"><span class="spinner"></span>Loading…</div></div>
    </div>
  `;
  document.getElementById("tApply").addEventListener("click", loadTypes);
  document.getElementById("tInactive").addEventListener("change", loadTypes);
  document.getElementById("tStrikes").addEventListener("change", loadTypes);
  document.getElementById("newTypeBtn").addEventListener("click", newTypeModal);
  loadTypes();
}

async function loadTypes() {
  const el = document.getElementById("typeList");
  el.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;
  const includeInactive = document.getElementById("tInactive").checked
    ? "true"
    : "false";
  const onlyStrikes = document.getElementById("tStrikes").value;
  try {
    const types = await call("GET", "/violation-types/all", {
      query: {
        include_inactive: includeInactive,
        only_strikes: onlyStrikes || null,
      },
    });
    if (!types.length) {
      el.innerHTML = `<div class="empty"><div class="big">◌</div>No violation types.</div>`;
      return;
    }

    el.innerHTML = `<table>
      <thead><tr><th>Name</th><th>Description</th><th class="num">Default pts</th><th>Strike</th><th>Status</th><th></th></tr></thead>
      <tbody>${types
        .map(
          (t) => `
        <tr>
          <td style="font-weight:550">${esc(t.name)}</td>
          <td class="faint trunc" title="${esc(t.description || "")}">${t.description ? esc(t.description) : "—"}</td>
          <td class="num">${t.default_points}</td>
          <td>${t.is_strike ? '<span class="badge strike">strike</span>' : '<span class="faint">—</span>'}</td>
          <td>${t.is_active ? '<span class="badge ok">active</span>' : '<span class="badge off">inactive</span>'}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn sm" data-edit="${t.id}">Edit</button>
            ${t.is_active ? `<button class="btn sm" data-deact="${t.id}">Deactivate</button>` : `<button class="btn sm" data-act="${t.id}">Activate</button>`}
            <button class="btn sm danger" data-del="${t.id}">Delete</button>
          </td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>`;

    el.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () =>
        editTypeModal(
          types.find((x) => x.id === Number(b.dataset.edit)),
          loadTypes,
        ),
      ),
    );
    el.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", () =>
        typeAction(
          `/violation-types/${b.dataset.act}/activate`,
          "Type activated",
        ),
      ),
    );
    el.querySelectorAll("[data-deact]").forEach((b) =>
      b.addEventListener("click", () =>
        typeAction(
          `/violation-types/${b.dataset.deact}/deactivate`,
          "Type deactivated",
        ),
      ),
    );
    el.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () =>
        deleteTypeFlow(types.find((x) => x.id === Number(b.dataset.del))),
      ),
    );
  } catch (e) {
    el.innerHTML = errorBanner(e);
  }
}

async function typeAction(path, okMsg) {
  try {
    await call("POST", path);
    toast(okMsg, "", "ok");
    loadTypes();
  } catch (e) {
    if (isCancelled(e)) return;
    const d = describeError(e.result);
    toast("Action failed", d.title + (d.detail ? " — " + d.detail : ""), "err");
  }
}

function deleteTypeFlow(t) {
  confirmModal({
    title: "Delete violation type?",
    danger: true,
    confirmLabel: "Delete",
    body: `<p style="font-size:13px;color:var(--muted)">Deleting <strong>${esc(t.name)}</strong> only works if no violation record references it. Otherwise the server returns <code>409</code>.</p>`,
    onConfirm: async () => {
      try {
        await call("DELETE", `/violation-types/${t.id}`);
        toast("Type deleted", t.name, "ok");
        closeModal();
        loadTypes();
      } catch (e) {
        if (isCancelled(e)) return;
        const d = describeError(e.result);
        if (e.result && e.result.status === 409) {
          closeModal();
          confirmModal({
            title: "Type is in use",
            confirmLabel: "Deactivate instead",
            body: `<p style="font-size:13px;color:var(--muted)">${esc(d.detail || "This violation type is referenced by existing records and cannot be deleted.")}</p>
                   <p style="font-size:13px;color:var(--muted);margin-top:10px">Deactivating hides it from the issue dropdown while preserving history.</p>`,
            onConfirm: async () => {
              try {
                await call("POST", `/violation-types/${t.id}/deactivate`);
                toast("Type deactivated", t.name, "ok");
                closeModal();
                loadTypes();
              } catch (e2) {
                if (isCancelled(e2)) return;
                toast("Failed", describeError(e2.result).title, "err");
              }
            },
          });
        } else {
          toast("Delete failed", d.title, "err");
        }
      }
    },
  });
}

function newTypeModal() {
  typeFormModal(null, null);
}
function editTypeModal(t, after) {
  typeFormModal(t, after);
}

function typeFormModal(existing, after) {
  const isEdit = !!existing;
  openModal(
    `
    <div class="modal-head"><h3>${isEdit ? "Edit Violation Type" : "New Violation Type"}</h3><button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div id="tpErr"></div>
      <div class="form-row"><label>Name</label><input type="text" id="tpName" value="${existing ? esc(existing.name) : ""}" placeholder="Late Arrival"></div>
      <div class="form-row"><label>Description <span class="opt">optional</span></label><textarea id="tpDesc" rows="2">${existing && existing.description ? esc(existing.description) : ""}</textarea></div>
      <div class="form-grid">
        <div class="form-row"><label>Default points</label><input type="number" id="tpPoints" min="0" value="${existing ? existing.default_points : 0}"></div>
        <div class="form-row" style="justify-content:flex-end"><label>&nbsp;</label><label class="chk" style="height:34px"><input type="checkbox" id="tpStrike" ${existing && existing.is_strike ? "checked" : ""}> Counts as a strike</label></div>
      </div>
      ${isEdit ? `<div class="callout" style="margin:0"><div class="ic">⚠</div><div>Changing <code>default_points</code> or <code>is_strike</code> does <strong>not</strong> rewrite historical records.</div></div>` : ""}
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="tpSave">${isEdit ? "Save changes" : "Create type"}</button></div>
  `,
    {
      onMount(m) {
        m.querySelector("#tpSave").addEventListener("click", async () => {
          const errBox = m.querySelector("#tpErr");
          errBox.innerHTML = "";
          const name = m.querySelector("#tpName").value.trim();
          const desc = m.querySelector("#tpDesc").value.trim();
          const points = Number(m.querySelector("#tpPoints").value) || 0;
          const strike = m.querySelector("#tpStrike").checked;
          if (!name) {
            errBox.innerHTML = `<div class="callout err"><div class="ic">✕</div><div>Name is required.</div></div>`;
            return;
          }
          try {
            if (isEdit) {
              const payload = {};
              if (name !== existing.name) payload.name = name;
              if (desc && desc !== (existing.description || ""))
                payload.description = desc;
              if (points !== existing.default_points)
                payload.default_points = points;
              if (strike !== existing.is_strike) payload.is_strike = strike;
              if (!Object.keys(payload).length) {
                toast("Nothing to update", "", "warn");
                return;
              }
              await call("PATCH", `/violation-types/${existing.id}`, {
                body: payload,
              });
              toast("Type updated", name, "ok");
            } else {
              const payload = {
                name,
                default_points: points,
                is_strike: strike,
              };
              if (desc) payload.description = desc;
              await call("POST", "/violation-types", { body: payload });
              toast("Type created", name, "ok");
            }
            closeModal();
            if (after) after();
            else loadTypes();
          } catch (e) {
            if (isCancelled(e)) return;
            errBox.innerHTML = errorBanner(e);
          }
        });
      },
    },
  );
}

/* ============================================================
   VIOLATIONS
   ============================================================ */
async function renderViolations() {
  view.innerHTML = `
    <div class="page-head">
      <div><h2>Violations</h2><p class="sub">Company-wide activity feed — every record, newest first.</p></div>
      <div class="actions"><button class="btn" id="issueBtn">+ Issue violation</button><button class="btn" id="feedRefresh">↻ Refresh</button></div>
    </div>
    <div class="card">
      <div class="filters">
        <label class="chk">Look-back</label>
        <select id="feedDays" style="width:130px">
          <option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option><option value="365">365 days</option>
        </select>
        <label class="chk"><input type="checkbox" id="feedStrikes"> Strikes only</label>
        <input type="number" id="feedLimit" value="50" min="1" max="200" style="width:100px" title="Limit (1-200)">
      </div>
      <div id="feedList"><div class="loading"><span class="spinner"></span>Loading…</div></div>
    </div>
  `;
  document
    .getElementById("feedRefresh")
    .addEventListener("click", loadRecentFeed);
  document
    .getElementById("feedDays")
    .addEventListener("change", loadRecentFeed);
  document
    .getElementById("feedStrikes")
    .addEventListener("change", loadRecentFeed);
  document
    .getElementById("feedLimit")
    .addEventListener("change", loadRecentFeed);
  document
    .getElementById("issueBtn")
    .addEventListener("click", issueByLookupModal);
  loadRecentFeed();
}

async function loadRecentFeed() {
  const el = document.getElementById("feedList");
  el.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;
  const days = document.getElementById("feedDays").value;
  const onlyStrikes = document.getElementById("feedStrikes").checked
    ? "true"
    : "false";
  const limit = Math.min(
    200,
    Math.max(1, Number(document.getElementById("feedLimit").value) || 50),
  );
  try {
    const items = await call("GET", "/violations/recent", {
      query: { days, only_strikes: onlyStrikes, limit },
    });
    if (!items.length) {
      el.innerHTML = `<div class="empty"><div class="big">◌</div>No violations in the last ${days} days.</div>`;
      return;
    }
    el.innerHTML = items
      .map(
        (f) => `
      <div class="feed-item">
        <div class="feed-avatar">${esc(initials(f.employee ? f.employee.full_name : "?"))}</div>
        <div class="feed-body">
          <div class="line1">
            <span class="who">${f.employee ? esc(f.employee.full_name) : "Unknown employee"}</span>
            ${f.employee ? `<span class="faint mono" style="font-size:11px">${esc(f.employee.employee_code)}</span>` : ""}
            ${f.is_strike ? '<span class="badge strike">strike</span>' : ""}
          </div>
          <div class="line2">${esc(f.violation_type_name || (f.violation_type ? f.violation_type.name : "—"))} · +${f.points} pts${f.issued_by ? " · " + esc(f.issued_by) : ""}${f.notes ? '<br><span style="color:var(--muted)">' + esc(f.notes) + "</span>" : ""}</div>
        </div>
        <div class="feed-meta">
          <div style="font-size:11.5px" class="muted">${esc(fmtDateShort(f.issued_at))}</div>
          <div class="faint" style="font-size:11px">${esc(relTime(f.issued_at))}</div>
          <button class="btn sm danger" data-remove="${f.id}" style="margin-top:6px">Remove</button>
        </div>
      </div>`,
      )
      .join("");
    el.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => {
        const f = items.find((x) => x.id === Number(b.dataset.remove));
        if (f) removalFormModal(f, { onDone: () => loadRecentFeed() });
      }),
    );
  } catch (e) {
    el.innerHTML = errorBanner(e);
  }
}

function issueByLookupModal() {
  openModal(
    `
    <div class="modal-head"><h3>Issue a violation</h3><button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div id="lkErr"></div>
      <div class="form-row">
        <label>Employee code or search</label>
        <div class="row-flex"><input type="text" id="lkCode" placeholder="EMP-001"><button class="btn" id="lkFind" style="flex:0 0 auto">Find</button></div>
      </div>
      <div id="lkResults"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button></div>
  `,
    {
      onMount(m) {
        const doFind = async () => {
          const q = m.querySelector("#lkCode").value.trim();
          const box = m.querySelector("#lkResults");
          const errBox = m.querySelector("#lkErr");
          errBox.innerHTML = "";
          if (!q) return;
          box.innerHTML = `<div class="loading"><span class="spinner"></span>Searching…</div>`;
          try {
            let results;
            try {
              results = [
                await call(
                  "GET",
                  `/employees/by-code/${encodeURIComponent(q)}`,
                ),
              ];
            } catch {
              const page = await call("GET", "/employees", {
                query: { search: q, limit: 10 },
              });
              results = page.items;
            }
            if (!results.length) {
              box.innerHTML = `<div class="empty" style="padding:20px">No match.</div>`;
              return;
            }
            box.innerHTML = results
              .map(
                (e) => `
            <button class="ep-item" data-pick="${e.id}" style="width:100%;padding:10px 12px;border:1px solid var(--border);margin-bottom:6px;border-radius:8px">
              <div class="feed-avatar" style="width:26px;height:26px;font-size:10px">${esc(initials(e.full_name))}</div>
              <div style="text-align:left;min-width:0">
                <div style="font-weight:550;font-size:13px">${esc(e.full_name)}</div>
                <div class="faint mono" style="font-size:11px">${esc(e.employee_code)}</div>
              </div>
            </button>`,
              )
              .join("");
            box.querySelectorAll("[data-pick]").forEach((b) =>
              b.addEventListener("click", async () => {
                try {
                  const full = await call(
                    "GET",
                    `/employees/${b.dataset.pick}`,
                  );
                  closeModal();
                  issueViolationModal(full);
                } catch (e) {
                  errBox.innerHTML = errorBanner(e);
                }
              }),
            );
          } catch (e) {
            box.innerHTML = "";
            errBox.innerHTML = errorBanner(e);
          }
        };
        m.querySelector("#lkFind").addEventListener("click", doFind);
        m.querySelector("#lkCode").addEventListener("keydown", (e) => {
          if (e.key === "Enter") doFind();
        });
      },
    },
  );
}

/* ============================================================
   REMOVAL FORMS (no X-Actor — uses removed_by in body)
   ============================================================ */
function removalFormModal(record, opts = {}) {
  const typeName =
    record.violation_type_name ||
    (record.violation_type && record.violation_type.name) ||
    "Unknown";
  const empName =
    record.employee_full_name ||
    (record.employee && record.employee.full_name) ||
    "";
  const empCode =
    record.employee_code ||
    (record.employee && record.employee.employee_code) ||
    "";
  const pts = record.points;
  const at = record.issued_at;
  const defaultBy = state.actor || "";

  openModal(
    `
    <div class="modal-head"><h3>Remove violation</h3><span class="badge audit">audited</span><button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div id="rmErr"></div>
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:16px">
        <div style="font-weight:600;font-size:13px">${esc(typeName)}</div>
        <div class="faint mono" style="font-size:11.5px;margin-top:3px">${esc(empName)}${empCode ? " · " + esc(empCode) : ""} · +${pts} pts${record.is_strike ? " · strike" : ""} · ${esc(fmtDate(at))}</div>
        ${record.notes ? `<div class="faint" style="font-size:12px;margin-top:8px;border-top:1px solid var(--border);padding-top:8px">${esc(record.notes)}</div>` : ""}
      </div>
      <div class="callout info" style="margin-bottom:16px"><div class="ic">📝</div><div><strong>Removal is permanent and audited.</strong> Both fields are required and written to the removal log.</div></div>
      <div class="form-row">
        <label>Removed by <span class="req">*</span> <span class="faint">(1–150 chars)</span></label>
        <input type="text" id="rmBy" maxlength="150" value="${esc(defaultBy)}" placeholder="Your name or ID" autocomplete="off">
      </div>
      <div class="form-row">
        <label>Reason <span class="req">*</span> <span class="faint">(1–2000 chars)</span></label>
        <textarea id="rmReason" rows="4" maxlength="2000" placeholder="Why is this being removed?"></textarea>
        <div class="faint" style="font-size:11px;text-align:right" id="rmCount">0 / 2000</div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn danger" id="rmSubmit">Remove violation</button></div>
  `,
    {
      onMount(m) {
        const reasonEl = m.querySelector("#rmReason");
        const countEl = m.querySelector("#rmCount");
        reasonEl.addEventListener("input", () => {
          countEl.textContent = `${reasonEl.value.length} / 2000`;
        });
        m.querySelector("#rmSubmit").addEventListener("click", async () => {
          const errBox = m.querySelector("#rmErr");
          errBox.innerHTML = "";
          const removed_by = m.querySelector("#rmBy").value.trim();
          const reason = reasonEl.value.trim();
          if (!removed_by || !reason) {
            errBox.innerHTML = `<div class="callout err"><div class="ic">✕</div><div>Both <code>removed_by</code> and <code>reason</code> are required.</div></div>`;
            return;
          }
          const btn = m.querySelector("#rmSubmit");
          btn.disabled = true;
          try {
            const res = await call("POST", `/violations/${record.id}/remove`, {
              body: { removed_by, reason },
            });
            toast(
              "Violation removed",
              `${res.violation_type_name || typeName} · logged`,
              "ok",
            );
            closeModal();
            if (opts.onDone) opts.onDone(res);
          } catch (e) {
            if (isCancelled(e)) {
              btn.disabled = false;
              return;
            }
            errBox.innerHTML = errorBanner(e);
            btn.disabled = false;
          }
        });
      },
    },
  );
}

function clearAllFormModal(emp, opts = {}) {
  const { count, onDone } = opts;
  const defaultBy = state.actor || "";
  openModal(
    `
    <div class="modal-head"><h3>Clear all violations</h3><span class="badge audit">audited</span><button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div id="clErr"></div>
      <div class="callout err" style="margin-bottom:16px"><div class="ic">⚠</div><div>This permanently removes <strong>${count} violation record${count === 1 ? "" : "s"}</strong> for <strong>${esc(emp.full_name)}</strong> and writes one audit entry per removal.</div></div>
      <div class="form-row">
        <label>Removed by <span class="req">*</span> <span class="faint">(1–150 chars)</span></label>
        <input type="text" id="clBy" maxlength="150" value="${esc(defaultBy)}" placeholder="Your name or ID" autocomplete="off">
      </div>
      <div class="form-row">
        <label>Reason <span class="req">*</span> <span class="faint">(1–2000 chars)</span></label>
        <textarea id="clReason" rows="4" maxlength="2000" placeholder="Why are these being cleared?"></textarea>
        <div class="faint" style="font-size:11px;text-align:right" id="clCount">0 / 2000</div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn danger" id="clSubmit">Clear all violations</button></div>
  `,
    {
      onMount(m) {
        const reasonEl = m.querySelector("#clReason");
        const countEl = m.querySelector("#clCount");
        reasonEl.addEventListener("input", () => {
          countEl.textContent = `${reasonEl.value.length} / 2000`;
        });
        m.querySelector("#clSubmit").addEventListener("click", async () => {
          const errBox = m.querySelector("#clErr");
          errBox.innerHTML = "";
          const removed_by = m.querySelector("#clBy").value.trim();
          const reason = reasonEl.value.trim();
          if (!removed_by || !reason) {
            errBox.innerHTML = `<div class="callout err"><div class="ic">✕</div><div>Both <code>removed_by</code> and <code>reason</code> are required.</div></div>`;
            return;
          }
          const btn = m.querySelector("#clSubmit");
          btn.disabled = true;
          try {
            const res = await call(
              "POST",
              `/employees/${emp.id}/violations/clear`,
              { body: { removed_by, reason } },
            );
            toast(
              "Violations cleared",
              `${res.deleted} removed · audited`,
              "ok",
            );
            closeModal();
            if (onDone) onDone(res);
          } catch (e) {
            if (isCancelled(e)) {
              btn.disabled = false;
              return;
            }
            errBox.innerHTML = errorBanner(e);
            btn.disabled = false;
          }
        });
      },
    },
  );
}

/* ============================================================
   REMOVAL LOG
   ============================================================ */
const remState = { offset: 0, limit: 25 };

async function renderRemovals() {
  view.innerHTML = `
    <div class="page-head">
      <div><h2>Removal Log</h2><p class="sub">Immutable audit trail for every violation removal. Newest first.</p></div>
      <div class="actions"><button class="btn" id="remRefresh">↻ Refresh</button></div>
    </div>
    <div class="callout info">
      <div class="ic">ℹ</div>
      <div><strong>One entry per removal.</strong> Hard-deleting an employee bypasses this log entirely — prefer <em>deactivate</em> when the audit trail must stay complete.</div>
    </div>
    <div class="card">
      <div class="filters">
        <input type="text" id="remSearch" placeholder="Search reason or name…">
        <input type="text" id="remBy" placeholder="Removed by">
        <input type="date" id="remSince" title="Since" style="width:150px">
        <input type="date" id="remUntil" title="Until" style="width:150px">
        <button class="btn" id="remApply">Search</button>
        <button class="btn ghost" id="remClearBtn">Clear</button>
      </div>
      <div id="remList"><div class="loading"><span class="spinner"></span>Loading…</div></div>
      <div class="pager" id="remPager"></div>
    </div>
  `;
  document.getElementById("remApply").addEventListener("click", () => {
    remState.offset = 0;
    loadRemovals();
  });
  document.getElementById("remRefresh").addEventListener("click", () => {
    remState.offset = 0;
    loadRemovals();
  });
  document.getElementById("remClearBtn").addEventListener("click", () => {
    ["remSearch", "remBy", "remSince", "remUntil"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    remState.offset = 0;
    loadRemovals();
  });
  document.getElementById("remSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      remState.offset = 0;
      loadRemovals();
    }
  });
  loadRemovals();
}

async function loadRemovals() {
  const list = document.getElementById("remList");
  const pager = document.getElementById("remPager");
  list.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;
  pager.innerHTML = "";
  const since = document.getElementById("remSince").value;
  const until = document.getElementById("remUntil").value;
  const query = {
    search: document.getElementById("remSearch").value.trim(),
    removed_by: document.getElementById("remBy").value.trim(),
    since: since ? new Date(since + "T00:00:00Z").toISOString() : "",
    until: until ? new Date(until + "T23:59:59Z").toISOString() : "",
    limit: remState.limit,
    offset: remState.offset,
  };
  try {
    const data = await call("GET", "/violation-removals", { query });
    if (!data.items || !data.items.length) {
      list.innerHTML = `<div class="empty"><div class="big">◌</div>No removals match those filters.</div>`;
      return;
    }

    list.innerHTML = `<table>
      <thead><tr><th>Removed</th><th>Employee</th><th>Violation</th><th class="num">Pts</th><th>Removed by</th><th>Reason</th><th></th></tr></thead>
      <tbody>${data.items
        .map(
          (r) => `
        <tr class="clickable" data-rem="${r.id}">
          <td><div style="font-size:12.5px">${esc(fmtDateShort(r.removed_at))}</div><div class="faint" style="font-size:11px">${esc(relTime(r.removed_at))}</div></td>
          <td><div style="font-weight:550">${esc(r.employee_full_name)}</div><div class="faint mono" style="font-size:11px">${esc(r.employee_code)}</div></td>
          <td><div>${esc(r.violation_type_name)}</div>${r.is_strike ? '<span class="badge strike">strike</span>' : ""}</td>
          <td class="num">${r.points}</td>
          <td>${esc(r.removed_by)}</td>
          <td class="faint trunc" title="${esc(r.reason)}">${esc(r.reason)}</td>
          <td style="width:32px"><span class="faint">›</span></td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>`;

    list.querySelectorAll("tr[data-rem]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const r = data.items.find((x) => x.id === Number(tr.dataset.rem));
        if (r) openRemoval(r);
      });
    });

    const shownEnd = remState.offset + data.items.length;
    const hasNext = data.items.length === remState.limit;
    pager.innerHTML = `
      <span class="info">${remState.offset + 1}–${shownEnd}${typeof data.total === "number" ? " of " + data.total : ""}</span>
      <span class="spacer"></span>
      <button class="btn sm" id="rPrev" ${remState.offset === 0 ? "disabled" : ""}>← Prev</button>
      <button class="btn sm" id="rNext" ${!hasNext ? "disabled" : ""}>Next →</button>
    `;
    const prev = pager.querySelector("#rPrev");
    const next = pager.querySelector("#rNext");
    if (prev)
      prev.addEventListener("click", () => {
        remState.offset = Math.max(0, remState.offset - remState.limit);
        loadRemovals();
      });
    if (next)
      next.addEventListener("click", () => {
        remState.offset += remState.limit;
        loadRemovals();
      });
  } catch (e) {
    list.innerHTML = errorBanner(e);
  }
}

function openRemoval(r) {
  openModal(
    `
    <div class="modal-head"><h3>Removal #${r.id}</h3><span class="badge audit">audit entry</span><button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
        <div class="stat" style="padding:12px 14px"><div class="k">Points removed</div><div class="v" style="font-size:22px">${r.points}</div></div>
        <div class="stat ${r.is_strike ? "danger" : ""}" style="padding:12px 14px"><div class="k">Strike</div><div class="v" style="font-size:22px">${r.is_strike ? "Yes" : "No"}</div></div>
        <div class="stat warn" style="padding:12px 14px"><div class="k">When</div><div class="v" style="font-size:14px;letter-spacing:0;font-weight:600">${esc(fmtDateShort(r.removed_at))}</div></div>
      </div>
      <div class="digest-section-title">Removed</div>
      <div class="kv-grid" style="margin-bottom:16px">
        <div class="k">by</div><div class="v">${esc(r.removed_by)}</div>
        <div class="k">at</div><div class="v">${esc(fmtDate(r.removed_at))}</div>
        <div class="k">reason</div><div class="v" style="white-space:pre-wrap">${esc(r.reason)}</div>
      </div>
      <div class="divider"></div>
      <div class="digest-section-title">Employee</div>
      <div class="kv-grid" style="margin-bottom:16px">
        <div class="k">name</div><div class="v">${esc(r.employee_full_name)}</div>
        <div class="k">code</div><div class="v mono">${esc(r.employee_code)}</div>
      </div>
      <div class="divider"></div>
      <div class="digest-section-title">Original violation</div>
      <div class="kv-grid">
        <div class="k">type</div><div class="v">${esc(r.violation_type_name)}${r.is_strike ? ' <span class="badge strike">strike</span>' : ""}</div>
        <div class="k">points</div><div class="v">+${r.points}</div>
        <div class="k">issued by</div><div class="v">${r.original_issued_by ? esc(r.original_issued_by) : '<span class="faint">—</span>'}</div>
        <div class="k">issued at</div><div class="v">${esc(fmtDate(r.original_issued_at))}</div>
        <div class="k">notes</div><div class="v" style="white-space:pre-wrap">${r.original_notes ? esc(r.original_notes) : '<span class="faint">—</span>'}</div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Close</button></div>
  `,
    { wide: true },
  );
}

/* ============================================================
   ACTIVITY (Timeline + Calendar + Digest)
   ============================================================ */
const ACTION_LABELS = {
  "employee.created": "Employee created",
  "employees.bulk_created": "Employees bulk-created",
  "employee.updated": "Employee updated",
  "employee.activated": "Employee reactivated",
  "employee.deactivated": "Employee deactivated",
  "employee.deleted": "Employee deleted",
  "violation_type.created": "Violation type created",
  "violation_type.updated": "Violation type updated",
  "violation_type.activated": "Violation type activated",
  "violation_type.deactivated": "Violation type deactivated",
  "violation_type.deleted": "Violation type deleted",
  "violation.assigned": "Violation assigned",
  "violation.updated": "Violation updated",
  "violation.removed": "Violation removed",
};

function renderActivity() {
  view.innerHTML = `
    <div class="page-head">
      <div><h2>Activity</h2><p class="sub">Every change made in the system, with actor and target. Read-only audit trail.</p></div>
    </div>
    <div class="tabs" id="actTabs">
      <button class="tab ${state.activityTab === "timeline" ? "active" : ""}" data-tab="timeline">Timeline</button>
      <button class="tab ${state.activityTab === "calendar" ? "active" : ""}" data-tab="calendar">Calendar</button>
    </div>
    <div id="actBody"></div>
  `;
  document.getElementById("actTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    state.activityTab = t.dataset.tab;
    document
      .querySelectorAll("#actTabs .tab")
      .forEach((x) =>
        x.classList.toggle("active", x.dataset.tab === state.activityTab),
      );
    renderActivityTab();
  });
  renderActivityTab();
}

function renderActivityTab() {
  if (state.activityTab === "timeline") renderTimeline();
  else renderCalendar();
}

/* ---------- Timeline ---------- */
const timelineState = { offset: 0, limit: 50 };

async function renderTimeline() {
  const body = document.getElementById("actBody");
  body.innerHTML = `
    <div class="card">
      <div class="filters">
        <input type="date" id="tlDay" style="width:140px" title="Single day">
        <input type="date" id="tlStart" style="width:140px" title="Range start">
        <input type="date" id="tlEnd" style="width:140px" title="Range end">
        <input type="text" id="tlActor" placeholder="Actor">
        <select id="tlAction" style="width:180px">
          <option value="">Any action</option>
          ${Object.entries(ACTION_LABELS)
            .map(([k, v]) => `<option value="${k}">${v}</option>`)
            .join("")}
        </select>
        <select id="tlTarget" style="width:150px">
          <option value="">Any target</option>
          <option value="employee">Employee</option>
          <option value="violation_type">Violation type</option>
          <option value="violation">Violation</option>
        </select>
        <input type="number" id="tlEmpId" placeholder="Employee ID" min="1" style="width:120px">
        <button class="btn" id="tlApply">Search</button>
        <button class="btn ghost" id="tlClearBtn">Clear</button>
      </div>
      <div id="tlList"><div class="loading"><span class="spinner"></span>Loading…</div></div>
      <div class="pager" id="tlPager"></div>
    </div>
  `;
  document.getElementById("tlApply").addEventListener("click", () => {
    timelineState.offset = 0;
    loadTimeline();
  });
  document.getElementById("tlClearBtn").addEventListener("click", () => {
    ["tlDay", "tlStart", "tlEnd", "tlActor", "tlEmpId"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    document.getElementById("tlAction").value = "";
    document.getElementById("tlTarget").value = "";
    timelineState.offset = 0;
    loadTimeline();
  });
  document.getElementById("tlActor").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      timelineState.offset = 0;
      loadTimeline();
    }
  });
  loadTimeline();
}

async function loadTimeline() {
  const list = document.getElementById("tlList");
  const pager = document.getElementById("tlPager");
  list.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;
  pager.innerHTML = "";

  const day = document.getElementById("tlDay").value;
  const start = document.getElementById("tlStart").value;
  const end = document.getElementById("tlEnd").value;
  const query = {
    day: day || "",
    start: start && !day ? new Date(start + "T00:00:00Z").toISOString() : "",
    end: end && !day ? new Date(end + "T23:59:59Z").toISOString() : "",
    actor: document.getElementById("tlActor").value.trim(),
    action: document.getElementById("tlAction").value,
    target_type: document.getElementById("tlTarget").value,
    employee_id: document.getElementById("tlEmpId").value.trim(),
    limit: timelineState.limit,
    offset: timelineState.offset,
  };

  try {
    const data = await call("GET", "/activity/timeline", { query });
    if (!data.items || !data.items.length) {
      list.innerHTML = `<div class="empty"><div class="big">◌</div>No activity matches those filters.</div>`;
      return;
    }

    list.innerHTML = data.items
      .map((ev) => {
        const meta = ev.metadata_json || {};
        return `<div class="ev-row" data-ev='${esc(JSON.stringify(ev))}'>
        <div class="ev-dot ${ev.target_type}"></div>
        <div class="ev-body">
          <div class="ev-summary">${esc(ev.summary)}</div>
          <div class="ev-meta">
            <span class="actor">👤 ${esc(ev.actor)}</span>
            <span>${esc(ev.action)}</span>
            ${ev.target_id !== null ? `<span>#${ev.target_id}</span>` : ""}
            ${ev.employee_id !== null ? `<span>emp:${ev.employee_id}</span>` : ""}
          </div>
        </div>
        <div class="ev-time">${esc(fmtTimeOnly(ev.occurred_at))}<br><span style="opacity:.65">${esc(relTime(ev.occurred_at))}</span></div>
      </div>`;
      })
      .join("");

    list.querySelectorAll(".ev-row").forEach((row) => {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        try {
          openEventDetail(JSON.parse(row.dataset.ev));
        } catch {}
      });
    });

    const shownEnd = timelineState.offset + data.items.length;
    const hasNext = data.items.length === timelineState.limit;
    pager.innerHTML = `
      <span class="info">${timelineState.offset + 1}–${shownEnd}${typeof data.total === "number" ? " of " + data.total : ""}</span>
      <span class="spacer"></span>
      <button class="btn sm" id="tlPrev" ${timelineState.offset === 0 ? "disabled" : ""}>← Prev</button>
      <button class="btn sm" id="tlNext" ${!hasNext ? "disabled" : ""}>Next →</button>
    `;
    const prev = pager.querySelector("#tlPrev");
    const next = pager.querySelector("#tlNext");
    if (prev)
      prev.addEventListener("click", () => {
        timelineState.offset = Math.max(
          0,
          timelineState.offset - timelineState.limit,
        );
        loadTimeline();
      });
    if (next)
      next.addEventListener("click", () => {
        timelineState.offset += timelineState.limit;
        loadTimeline();
      });
  } catch (e) {
    list.innerHTML = errorBanner(e);
  }
}

function openEventDetail(ev) {
  openModal(
    `
    <div class="modal-head">
      <h3>Event #${ev.id}</h3>
      <span class="badge ${ev.target_type === "violation" ? "danger" : ev.target_type === "employee" ? "info" : "warn"}">${esc(ev.target_type)}</span>
      <button class="close" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div class="kv-grid" style="margin-bottom:16px">
        <div class="k">summary</div><div class="v">${esc(ev.summary)}</div>
        <div class="k">actor</div><div class="v"><span class="badge actor">${esc(ev.actor)}</span></div>
        <div class="k">action</div><div class="v mono">${esc(ev.action)}</div>
        <div class="k">occurred</div><div class="v">${esc(fmtDate(ev.occurred_at))}</div>
        <div class="k">event_date</div><div class="v mono">${esc(ev.event_date)}</div>
        <div class="k">target</div><div class="v mono">${esc(ev.target_type)}${ev.target_id !== null ? " #" + ev.target_id : ""}</div>
        ${ev.employee_id !== null ? `<div class="k">employee</div><div class="v mono">#${ev.employee_id}</div>` : ""}
      </div>
      ${
        ev.metadata_json
          ? `
        <div class="digest-section-title">metadata_json</div>
        <div class="json">${highlightJSON(ev.metadata_json)}</div>
      `
          : '<div class="faint" style="font-size:12px">No metadata attached.</div>'
      }
    </div>
    <div class="modal-foot"><button class="btn" data-close>Close</button></div>
  `,
    { wide: true },
  );
}

/* ---------- Calendar ---------- */
async function renderCalendar() {
  const body = document.getElementById("actBody");
  body.innerHTML = `
    <div class="card">
      <div class="cal-header">
        <button class="btn icon" id="calPrev" title="Previous month">‹</button>
        <div class="cal-title" id="calTitle"></div>
        <button class="btn icon" id="calNext" title="Next month">›</button>
        <button class="btn sm" id="calToday">Today</button>
        <span class="right faint mono" style="font-size:11px">click a day to view digest</span>
      </div>
      <div id="calBody"><div class="loading"><span class="spinner"></span>Loading…</div></div>
    </div>
  `;
  document.getElementById("calPrev").addEventListener("click", () => {
    const m = state.calendarMonth;
    const d = new Date(Date.UTC(m.year, m.month - 1, 1));
    state.calendarMonth = {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
    };
    loadCalendar();
  });
  document.getElementById("calNext").addEventListener("click", () => {
    const m = state.calendarMonth;
    const d = new Date(Date.UTC(m.year, m.month + 1, 1));
    state.calendarMonth = {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
    };
    loadCalendar();
  });
  document.getElementById("calToday").addEventListener("click", () => {
    const d = new Date();
    state.calendarMonth = {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
    };
    loadCalendar();
  });
  loadCalendar();
}

async function loadCalendar() {
  const body = document.getElementById("calBody");
  const title = document.getElementById("calTitle");
  body.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;

  const m = state.calendarMonth;
  const first = new Date(Date.UTC(m.year, m.month, 1));
  const last = new Date(Date.UTC(m.year, m.month + 1, 0));
  const startStr = dayKey(first);
  const endStr = dayKey(last);

  const monthName = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  title.textContent = monthName;

  try {
    const rows = await call("GET", "/activity/calendar", {
      query: { start: startStr, end: endStr },
    });
    const countMap = new Map(rows.map((r) => [r.date, r]));

    const startDow = first.getUTCDay();
    const daysInMonth = last.getUTCDate();
    const today = todayKey();

    let html = '<div class="cal-grid">';
    for (const dow of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      html += `<div class="cal-head">${dow}</div>`;
    }
    for (let i = 0; i < startDow; i++)
      html += '<div class="cal-cell empty"></div>';

    let totalMonth = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${m.year}-${String(m.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const row = countMap.get(dateStr);
      const total = row ? row.total : 0;
      totalMonth += total;
      const intensity =
        total === 0 ? "zero" : total <= 2 ? "low" : total <= 5 ? "med" : "high";
      const isToday = dateStr === today;
      html += `<div class="cal-cell ${intensity} ${isToday ? "today" : ""}" data-date="${dateStr}" title="${total} event${total === 1 ? "" : "s"}">
        <div class="cal-day">${d}</div>
        ${total > 0 ? `<div class="cal-count">${total}</div>` : ""}
      </div>`;
    }
    html += "</div>";
    html += `<div class="cal-legend">
      <span><span class="swatch"></span>0 events</span>
      <span><span class="swatch low"></span>1–2</span>
      <span><span class="swatch med"></span>3–5</span>
      <span><span class="swatch high"></span>6+</span>
      <span class="right">${totalMonth} total event${totalMonth === 1 ? "" : "s"} this month</span>
    </div>`;

    body.innerHTML = html;
    body.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
      cell.addEventListener("click", () => openDigest(cell.dataset.date));
    });
  } catch (e) {
    body.innerHTML = errorBanner(e);
  }
}

async function openDigest(dateStr) {
  openModal(
    `
    <div class="modal-head">
      <h3>Digest · ${esc(dateStr)}</h3>
      <button class="close" data-close>✕</button>
    </div>
    <div class="modal-body"><div class="loading"><span class="spinner"></span>Loading digest…</div></div>
  `,
    { wide: true },
  );

  try {
    const d = await call("GET", `/activity/digest/${dateStr}`);
    const m = modalRoot.querySelector(".modal");
    renderDigestModal(m, d);
  } catch (e) {
    modalRoot.querySelector(".modal-body").innerHTML = errorBanner(e);
  }
}

function renderDigestModal(modal, d) {
  const actions = d.by_action || {};
  const actors = d.by_actor || {};
  const highlights = d.highlights || [];
  const events = d.events || [];

  modal.querySelector(".modal-body").innerHTML = `
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
      <div class="stat" style="padding:12px 14px"><div class="k">Total events</div><div class="v" style="font-size:22px">${d.total}</div></div>
      <div class="stat ok" style="padding:12px 14px"><div class="k">Actors</div><div class="v" style="font-size:22px">${Object.keys(actors).length}</div></div>
      <div class="stat warn" style="padding:12px 14px"><div class="k">Action types</div><div class="v" style="font-size:22px">${Object.keys(actions).length}</div></div>
    </div>

    ${
      highlights.length
        ? `
      <div class="digest-highlights">
        <div class="digest-section-title" style="margin-bottom:8px">Highlights</div>
        <ul>${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
      </div>
    `
        : ""
    }

    <div class="digest-stats">
      <div>
        <div class="digest-section-title">By action</div>
        <div class="digest-chips">
          ${
            Object.entries(actions)
              .map(
                ([k, v]) =>
                  `<span class="digest-chip"><span class="n">${v}</span><span class="l">${esc(k)}</span></span>`,
              )
              .join("") || '<span class="faint">—</span>'
          }
        </div>
      </div>
      <div>
        <div class="digest-section-title">By actor</div>
        <div class="digest-chips">
          ${
            Object.entries(actors)
              .map(
                ([k, v]) =>
                  `<span class="digest-chip"><span class="n">${v}</span><span class="l">${esc(k)}</span></span>`,
              )
              .join("") || '<span class="faint">—</span>'
          }
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="digest-section-title">Events (${events.length})</div>
    ${
      events.length
        ? `<div style="border:1px solid var(--border);border-radius:9px;overflow:hidden">
      ${events
        .map(
          (ev) => `
        <div class="ev-row">
          <div class="ev-dot ${ev.target_type}"></div>
          <div class="ev-body">
            <div class="ev-summary">${esc(ev.summary)}</div>
            <div class="ev-meta"><span class="actor">👤 ${esc(ev.actor)}</span><span>${esc(ev.action)}</span></div>
          </div>
          <div class="ev-time">${esc(fmtTimeOnly(ev.occurred_at))}</div>
        </div>`,
        )
        .join("")}
    </div>`
        : '<div class="empty" style="padding:20px">No events recorded for this day.</div>'
    }
  `;
}

/* ============================================================
   ANALYTICS
   ============================================================ */
async function renderAnalytics() {
  view.innerHTML = `
    <div class="page-head">
      <div><h2>Analytics</h2><p class="sub">Six read-only endpoints. All return bare arrays, never envelopes.</p></div>
      <div class="actions"><button class="btn" id="anRefresh">↻ Refresh</button></div>
    </div>
    <div class="tabs" id="anTabs">
      <button class="tab" data-tab="activity">Activity</button>
      <button class="tab" data-tab="offenders">Top offenders</button>
      <button class="tab" data-tab="watchlist">Watchlist</button>
      <button class="tab" data-tab="departments">Departments</button>
      <button class="tab" data-tab="types">Rulebook usage</button>
      <button class="tab" data-tab="clean">Clean employees</button>
    </div>
    <div id="anBody"></div>
  `;
  document.getElementById("anTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    state.analyticsTab = t.dataset.tab;
    renderAnalyticsTab();
  });
  document
    .getElementById("anRefresh")
    .addEventListener("click", renderAnalyticsTab);
  renderAnalyticsTab();
}

function renderAnalyticsTab() {
  document
    .querySelectorAll("#anTabs .tab")
    .forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === state.analyticsTab),
    );
  ({
    activity: anActivity,
    offenders: anOffenders,
    watchlist: anWatchlist,
    departments: anDepartments,
    types: anTypes,
    clean: anClean,
  })[state.analyticsTab]();
}

async function anActivity() {
  const el = document.getElementById("anBody");
  el.innerHTML = `<div class="card"><div class="loading"><span class="spinner"></span>Loading activity…</div></div>`;
  try {
    const rows = await call("GET", "/analytics/activity", {
      query: { days: 30, bucket: "day" },
    });
    const filled = fillActivity(rows, 30, "day");
    const totalCount = filled.reduce((s, r) => s + r.count, 0);
    const totalPoints = filled.reduce((s, r) => s + r.points, 0);
    el.innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><div class="k">Events · 30d</div><div class="v">${totalCount}</div></div>
        <div class="stat warn"><div class="k">Points · 30d</div><div class="v">${totalPoints}</div></div>
        <div class="stat ok"><div class="k">Daily avg</div><div class="v">${(totalCount / 30).toFixed(1)}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Daily activity</h3><span class="hint">GET /analytics/activity?days=30&amp;bucket=day</span><div class="right"><span class="badge warn">gaps zero-filled client-side</span></div></div>
        <div class="chart-wrap">${renderBarChart(filled)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Raw buckets</h3><span class="hint">only ${rows.length} bucket(s) returned by the server</span></div>
        <div class="card-body tight">
          <table><thead><tr><th>Bucket</th><th class="num">Count</th><th class="num">Points</th></tr></thead>
            <tbody>${rows.map((r) => `<tr><td class="mono">${esc(r.bucket)}</td><td class="num">${r.count}</td><td class="num">${r.points}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="card-body">${errorBanner(e)}</div></div>`;
  }
}

async function anOffenders() {
  const el = document.getElementById("anBody");
  el.innerHTML = `
    <div class="card">
      <div class="filters">
        <label class="chk">Rank by</label>
        <select id="offBy" style="width:150px"><option value="points">Points</option><option value="strikes">Strikes</option><option value="records">Records</option></select>
        <input type="number" id="offLimit" value="10" min="1" max="100" style="width:90px" title="Limit">
      </div>
      <div id="offBody"><div class="loading"><span class="spinner"></span>Loading…</div></div>
    </div>`;
  const load = async () => {
    const body = document.getElementById("offBody");
    body.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;
    try {
      const rows = await call("GET", "/analytics/top-offenders", {
        query: {
          by: document.getElementById("offBy").value,
          limit: document.getElementById("offLimit").value,
        },
      });
      if (!rows.length) {
        body.innerHTML = `<div class="empty">No data.</div>`;
        return;
      }
      body.innerHTML = `<table>
        <thead><tr><th style="width:40px">#</th><th>Employee</th><th>Department</th><th class="num">Points</th><th class="num">Strikes</th></tr></thead>
        <tbody>${rows
          .map(
            (r, i) => `
          <tr class="clickable" data-emp="${r.id}">
            <td class="mono faint">${i + 1}</td>
            <td><div style="font-weight:550">${esc(r.full_name)}</div><div class="faint mono" style="font-size:11px">${esc(r.employee_code)}</div></td>
            <td>${r.department ? esc(r.department) : '<span class="faint">—</span>'}</td>
            <td class="num">${r.total_points}</td>
            <td class="num">${r.total_strikes > 0 ? `<span class="badge strike">${r.total_strikes}</span>` : '<span class="faint">0</span>'}</td>
          </tr>`,
          )
          .join("")}</tbody>
      </table>`;
      body
        .querySelectorAll("[data-emp]")
        .forEach((tr) =>
          tr.addEventListener("click", () =>
            openEmployee(Number(tr.dataset.emp)),
          ),
        );
    } catch (e) {
      body.innerHTML = errorBanner(e);
    }
  };
  document.getElementById("offBy").addEventListener("change", load);
  document.getElementById("offLimit").addEventListener("change", load);
  load();
}

async function anWatchlist() {
  const el = document.getElementById("anBody");
  el.innerHTML = `
    <div class="card">
      <div class="filters">
        <label class="chk">Minimum strikes</label>
        <input type="number" id="wlMin" value="2" min="1" style="width:90px">
        <button class="btn" id="wlGo">Apply</button>
      </div>
      <div id="wlBody"><div class="loading"><span class="spinner"></span>Loading…</div></div>
    </div>`;
  const load = async () => {
    const body = document.getElementById("wlBody");
    body.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;
    try {
      const rows = await call("GET", "/analytics/watchlist", {
        query: { min_strikes: document.getElementById("wlMin").value },
      });
      if (!rows.length) {
        body.innerHTML = `<div class="empty">Nobody on the watchlist. </div>`;
        return;
      }
      body.innerHTML = `<table>
        <thead><tr><th>Employee</th><th>Department</th><th class="num">Strikes</th><th class="num">Points</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `
          <tr class="clickable" data-emp="${r.id}">
            <td><div style="font-weight:550">${esc(r.full_name)}</div><div class="faint mono" style="font-size:11px">${esc(r.employee_code)}</div></td>
            <td>${r.department ? esc(r.department) : '<span class="faint">—</span>'}</td>
            <td class="num"><span class="badge strike">${r.total_strikes}</span></td>
            <td class="num">${r.total_points}</td>
          </tr>`,
          )
          .join("")}</tbody>
      </table>`;
      body
        .querySelectorAll("[data-emp]")
        .forEach((tr) =>
          tr.addEventListener("click", () =>
            openEmployee(Number(tr.dataset.emp)),
          ),
        );
    } catch (e) {
      body.innerHTML = errorBanner(e);
    }
  };
  document.getElementById("wlGo").addEventListener("click", load);
  load();
}

async function anDepartments() {
  const el = document.getElementById("anBody");
  el.innerHTML = `<div class="card"><div class="loading"><span class="spinner"></span>Loading…</div></div>`;
  try {
    const rows = await call("GET", "/analytics/departments");
    if (!rows.length) {
      el.innerHTML = `<div class="card"><div class="empty">No department data.</div></div>`;
      return;
    }
    const max = Math.max(...rows.map((r) => r.total_points), 1);
    el.innerHTML = `<div class="card">
      <div class="card-head"><h3>Per-department rollup</h3><span class="hint">GET /analytics/departments</span></div>
      <div class="card-body tight">
        <table>
          <thead><tr><th>Department</th><th class="num">Employees</th><th class="num">Records</th><th class="num">Points</th><th class="num">Strikes</th><th style="width:140px"></th></tr></thead>
          <tbody>${rows
            .map(
              (r) => `
            <tr>
              <td>${r.department ? esc(r.department) : '<span class="faint">— unassigned —</span>'}</td>
              <td class="num">${r.employees}</td>
              <td class="num">${r.total_records}</td>
              <td class="num">${r.total_points}</td>
              <td class="num">${r.total_strikes}</td>
              <td><div style="height:6px;background:var(--surface-3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${((r.total_points / max) * 100).toFixed(1)}%;background:linear-gradient(90deg,#6d8cff,#8b6dff);border-radius:4px"></div></div></td>
            </tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="card-body">${errorBanner(e)}</div></div>`;
  }
}

async function anTypes() {
  const el = document.getElementById("anBody");
  el.innerHTML = `<div class="card"><div class="loading"><span class="spinner"></span>Loading…</div></div>`;
  try {
    const rows = await call("GET", "/analytics/violation-types", {
      query: { limit: 20 },
    });
    if (!rows.length) {
      el.innerHTML = `<div class="card"><div class="empty">No usage data.</div></div>`;
      return;
    }
    const max = Math.max(...rows.map((r) => r.times_issued), 1);
    el.innerHTML = `<div class="card">
      <div class="card-head"><h3>Rulebook usage</h3><span class="hint">GET /analytics/violation-types</span></div>
      <div class="card-body tight">
        <table>
          <thead><tr><th>Type</th><th class="num">Default pts</th><th>Strike</th><th class="num">Issued</th><th class="num">Total pts</th><th style="width:120px"></th></tr></thead>
          <tbody>${rows
            .map(
              (r) => `
            <tr>
              <td style="font-weight:550">${esc(r.name)}</td>
              <td class="num">${r.default_points}</td>
              <td>${r.is_strike ? '<span class="badge strike">strike</span>' : '<span class="faint">—</span>'}</td>
              <td class="num">${r.times_issued}</td>
              <td class="num">${r.total_points}</td>
              <td><div style="height:6px;background:var(--surface-3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${((r.times_issued / max) * 100).toFixed(1)}%;background:linear-gradient(90deg,#fbbf24,#f59e0b);border-radius:4px"></div></div></td>
            </tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="card-body">${errorBanner(e)}</div></div>`;
  }
}

async function anClean() {
  const el = document.getElementById("anBody");
  el.innerHTML = `
    <div class="card">
      <div class="filters">
        <label class="chk">Clean since <span class="faint">(leave blank for "never, ever")</span></label>
        <input type="date" id="clSince" style="width:170px">
        <button class="btn" id="clGo">Apply</button>
        <button class="btn ghost" id="clClearBtn">Reset</button>
      </div>
      <div id="clBody"><div class="loading"><span class="spinner"></span>Loading…</div></div>
    </div>`;
  const load = async () => {
    const body = document.getElementById("clBody");
    body.innerHTML = `<div class="loading"><span class="spinner"></span>Loading…</div>`;
    const since = document.getElementById("clSince").value;
    try {
      const rows = await call("GET", "/analytics/clean-employees", {
        query: since
          ? { since: new Date(since + "T00:00:00Z").toISOString() }
          : {},
      });
      if (!rows.length) {
        body.innerHTML = `<div class="empty">Nobody matches.</div>`;
        return;
      }
      body.innerHTML = `<table>
        <thead><tr><th>Employee</th><th>Department</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `
          <tr class="clickable" data-emp="${r.id}">
            <td><div style="font-weight:550">${esc(r.full_name)}</div><div class="faint mono" style="font-size:11px">${esc(r.employee_code)}</div></td>
            <td>${r.department ? esc(r.department) : '<span class="faint">—</span>'}</td>
          </tr>`,
          )
          .join("")}</tbody>
      </table>`;
      body
        .querySelectorAll("[data-emp]")
        .forEach((tr) =>
          tr.addEventListener("click", () =>
            openEmployee(Number(tr.dataset.emp)),
          ),
        );
    } catch (e) {
      body.innerHTML = errorBanner(e);
    }
  };
  document.getElementById("clGo").addEventListener("click", load);
  document.getElementById("clClearBtn").addEventListener("click", () => {
    document.getElementById("clSince").value = "";
    load();
  });
  load();
}

/* ============================================================
   API EXPLORER
   ============================================================ */
const ENDPOINTS = [
  {
    group: "Employees",
    method: "GET",
    path: "/employees",
    desc: "Search, filter and paginate employees.",
    query: {
      search: "",
      department: "",
      position: "",
      min_points: "",
      min_strikes: "",
      include_inactive: "",
      limit: 50,
      offset: 0,
    },
  },
  {
    group: "Employees",
    method: "GET",
    path: "/employees/by-code/:code",
    desc: "Lookup by company employee code.",
    query: {},
  },
  {
    group: "Employees",
    method: "GET",
    path: "/employees/:employee_id/totals",
    desc: "Cheap totals for one employee.",
    query: {},
  },
  {
    group: "Employees",
    method: "GET",
    path: "/employees/:employee_id",
    desc: "Full profile plus violation history.",
    query: {},
  },
  {
    group: "Employees",
    method: "POST",
    path: "/employees",
    desc: "Create an employee. Requires X-Actor header.",
    body: {
      employee_code: "EMP-001",
      first_name: "Jane",
      last_name: "Doe",
      department: "Engineering",
      position: "Analyst",
    },
  },
  {
    group: "Employees",
    method: "POST",
    path: "/employees/bulk",
    desc: "Create many. All-or-nothing. Requires X-Actor header.",
    body: [
      {
        employee_code: "EMP-201",
        first_name: "Ada",
        last_name: "Lovelace",
      },
    ],
  },
  {
    group: "Employees",
    method: "PATCH",
    path: "/employees/:employee_id",
    desc: "Partial update. Requires X-Actor header.",
    body: { department: "Operations" },
  },
  {
    group: "Employees",
    method: "POST",
    path: "/employees/:employee_id/deactivate",
    desc: "Soft delete — status becomes inactive. Requires X-Actor header.",
  },
  {
    group: "Employees",
    method: "POST",
    path: "/employees/:employee_id/reactivate",
    desc: "Undo a soft delete. Requires X-Actor header.",
  },
  {
    group: "Employees",
    method: "DELETE",
    path: "/employees/:employee_id",
    desc: "Hard delete. Cascades. ⚠ bypasses the removal audit trail. Requires X-Actor header.",
  },

  {
    group: "Violation Types",
    method: "GET",
    path: "/violation-types",
    desc: "Active types only — populates the issue dropdown.",
    query: {},
  },
  {
    group: "Violation Types",
    method: "GET",
    path: "/violation-types/all",
    desc: "All types including inactive.",
    query: { include_inactive: "true", only_strikes: "" },
  },
  {
    group: "Violation Types",
    method: "GET",
    path: "/violation-types/:violation_type_id",
    desc: "Fetch one type.",
    query: {},
  },
  {
    group: "Violation Types",
    method: "POST",
    path: "/violation-types",
    desc: "Create a violation type. Requires X-Actor header.",
    body: {
      name: "Late Arrival",
      description: "Arriving after shift start",
      default_points: 5,
      is_strike: false,
    },
  },
  {
    group: "Violation Types",
    method: "PATCH",
    path: "/violation-types/:violation_type_id",
    desc: "Update a type. Requires X-Actor header.",
    body: { default_points: 10 },
  },
  {
    group: "Violation Types",
    method: "POST",
    path: "/violation-types/:violation_type_id/activate",
    desc: "Activate a type. Requires X-Actor header.",
  },
  {
    group: "Violation Types",
    method: "POST",
    path: "/violation-types/:violation_type_id/deactivate",
    desc: "Deactivate a type. Requires X-Actor header.",
  },
  {
    group: "Violation Types",
    method: "DELETE",
    path: "/violation-types/:violation_type_id",
    desc: "Delete. 409 if referenced. Requires X-Actor header.",
  },

  {
    group: "Violation Records",
    method: "POST",
    path: "/employees/:employee_id/violations",
    desc: "Issue a violation. Requires X-Actor header.",
    body: {
      violation_type_id: 1,
      notes: "Third time this week",
      issued_by: "Supervisor Kim",
    },
  },
  {
    group: "Violation Records",
    method: "GET",
    path: "/employees/:employee_id/violations",
    desc: "List one employee's violations. Bare array.",
    query: {
      only_strikes: "",
      since: "",
      until: "",
      limit: 50,
      offset: 0,
    },
  },
  {
    group: "Violation Records",
    method: "POST",
    path: "/violations/:violation_id/remove",
    desc: "Remove a single violation. Uses removed_by in body — no X-Actor.",
    body: {
      removed_by: "Supervisor Kim",
      reason: "Issued to wrong employee",
    },
  },
  {
    group: "Violation Records",
    method: "POST",
    path: "/employees/:employee_id/violations/clear",
    desc: "Clear all violations for an employee. Uses removed_by in body — no X-Actor.",
    body: {
      removed_by: "Admin",
      reason: "Employee transferred — clean slate",
    },
  },
  {
    group: "Violation Records",
    method: "GET",
    path: "/violations/recent",
    desc: "Company-wide feed for the last N days.",
    query: { days: 30, only_strikes: "false", limit: 50 },
  },
  {
    group: "Violation Records",
    method: "GET",
    path: "/violations/:violation_id",
    desc: "Fetch one record.",
    query: {},
  },
  {
    group: "Violation Records",
    method: "PATCH",
    path: "/violations/:violation_id",
    desc: "Edit metadata. Requires X-Actor header.",
    body: { notes: "Updated note", issued_by: "Supervisor Kim" },
  },

  {
    group: "Violation Removals",
    method: "GET",
    path: "/violation-removals",
    desc: "Paginated audit trail. Newest first.",
    query: {
      employee_id: "",
      removed_by: "",
      since: "",
      until: "",
      search: "",
      limit: 50,
      offset: 0,
    },
  },
  {
    group: "Violation Removals",
    method: "GET",
    path: "/violation-removals/:removal_id",
    desc: "Single audit entry.",
    query: {},
  },

  {
    group: "Activity",
    method: "GET",
    path: "/activity/timeline",
    desc: "Paginated activity events with filters.",
    query: {
      day: "",
      start: "",
      end: "",
      actor: "",
      action: "",
      target_type: "",
      employee_id: "",
      limit: 50,
      offset: 0,
    },
  },
  {
    group: "Activity",
    method: "GET",
    path: "/activity/calendar",
    desc: "Daily rollup for a date range. Days with zero events omitted.",
    query: { start: "", end: "" },
  },
  {
    group: "Activity",
    method: "GET",
    path: "/activity/digest/:date",
    desc: "Per-day digest with highlights, by_action, by_actor and events.",
    query: {},
  },

  {
    group: "Analytics",
    method: "GET",
    path: "/analytics/top-offenders",
    desc: "Leaderboard by points, strikes or records.",
    query: { by: "points", limit: 10 },
  },
  {
    group: "Analytics",
    method: "GET",
    path: "/analytics/departments",
    desc: "Per-department rollup.",
    query: {},
  },
  {
    group: "Analytics",
    method: "GET",
    path: "/analytics/violation-types",
    desc: "How often each type is issued.",
    query: { limit: 20 },
  },
  {
    group: "Analytics",
    method: "GET",
    path: "/analytics/activity",
    desc: "Time series. Gaps are NOT filled.",
    query: { days: 30, bucket: "day" },
  },
  {
    group: "Analytics",
    method: "GET",
    path: "/analytics/watchlist",
    desc: "Employees at or above a strike threshold.",
    query: { min_strikes: 2 },
  },
  {
    group: "Analytics",
    method: "GET",
    path: "/analytics/clean-employees",
    desc: "Violation-free employees.",
    query: { since: "" },
  },
];

const exState = { values: {}, query: {}, body: "" };

function renderExplorer() {
  const groups = [...new Set(ENDPOINTS.map((e) => e.group))];
  const active =
    ENDPOINTS.find((e) => e.method + " " + e.path === state.explorerEp) ||
    ENDPOINTS[0];
  state.explorerEp = active.method + " " + active.path;

  view.innerHTML = `
    <div class="page-head">
      <div><h2>API Explorer</h2><p class="sub">Every endpoint, live. Fill in the params and send.</p></div>
      <div class="actions"><span class="badge info">${ENDPOINTS.length} endpoints</span></div>
    </div>
    <div class="explorer">
      <div class="card ep-list" style="max-height:calc(100vh - 190px);overflow-y:auto">
        ${groups
          .map(
            (g) => `
          <div class="ep-group">
            <div class="ep-group-title">${esc(g)}</div>
            ${ENDPOINTS.filter((e) => e.group === g)
              .map((e) => {
                const key = e.method + " " + e.path;
                return `<button class="ep-item ${key === state.explorerEp ? "active" : ""}" data-ep="${esc(key)}">
                <span class="method ${e.method}">${e.method}</span>
                <span class="path">${esc(e.path)}</span>
              </button>`;
              })
              .join("")}
          </div>`,
          )
          .join("")}
      </div>
      <div id="exPanel"></div>
    </div>
  `;

  view.querySelectorAll(".ep-item").forEach((b) =>
    b.addEventListener("click", () => {
      state.explorerEp = b.dataset.ep;
      renderExplorer();
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        requestAnimationFrame(() => {
          const p = document.getElementById("exPanel");
          if (p) p.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }),
  );

  renderExplorerPanel(active);
}

function renderExplorerPanel(ep) {
  const panel = document.getElementById("exPanel");
  const pathParams = [...ep.path.matchAll(/:([a-z_]+)/gi)].map((m) => m[1]);
  const queryKeys = Object.keys(ep.query || {});
  const needsActor = pathNeedsActor(ep.method, ep.path);

  exState.values = {};
  exState.query = { ...(ep.query || {}) };
  exState.body = ep.body !== undefined ? JSON.stringify(ep.body, null, 2) : "";

  panel.innerHTML = `
    <div class="card">
      <div class="card-head" style="flex-wrap:wrap">
        <span class="method ${ep.method}">${ep.method}</span>
        <h3 class="mono" style="font-size:13px;word-break:break-all">${esc(ep.path)}</h3>
        ${needsActor ? `<span class="badge actor" title="X-Actor sent from your actor chip">X-Actor</span>` : ""}
      </div>
      <div class="card-body">
        <p class="muted" style="font-size:13px;margin-bottom:16px">${esc(ep.desc)}</p>

        ${
          pathParams.length
            ? `
          <div class="digest-section-title">Path params</div>
          <div class="form-grid" style="margin-bottom:16px">
            ${pathParams
              .map(
                (p) => `
              <div class="form-row">
                <label class="mono">:${p}</label>
                <input type="text" data-path="${p}" placeholder="${p === "code" ? "EMP-001" : p === "date" ? "2026-10-23" : "1"}">
              </div>`,
              )
              .join("")}
          </div>`
            : ""
        }

        ${
          queryKeys.length
            ? `
          <div class="digest-section-title">Query params</div>
          <div class="form-grid" style="margin-bottom:16px">
            ${queryKeys
              .map(
                (k) => `
              <div class="form-row">
                <label class="mono">${k}</label>
                <input type="text" data-query="${k}" value="${esc(ep.query[k])}" placeholder="omit to skip">
              </div>`,
              )
              .join("")}
          </div>`
            : ""
        }

        ${
          ep.body !== undefined
            ? `
          <div class="digest-section-title">Request body</div>
          <div class="form-row"><textarea id="exBody" rows="8" spellcheck="false">${esc(exState.body)}</textarea></div>
        `
            : ""
        }

        <div class="row-flex" style="margin-top:6px;flex-wrap:wrap;gap:8px">
          <button class="btn primary" id="exSend">Send request</button>
          <button class="btn" id="exCopy">Copy as cURL</button>
          <span class="right faint mono" style="font-size:11px;word-break:break-all;min-width:0">${esc(state.baseUrl)}${esc(ep.path)}</span>
        </div>
        ${needsActor ? `<div class="faint" style="font-size:11px;margin-top:8px">⚠ This endpoint sends <code>X-Actor: ${esc(state.actor || "<not set>")}</code>. If not set, you'll be prompted to name yourself.</div>` : ""}
      </div>
      <div id="exResult"></div>
    </div>
  `;

  panel.querySelectorAll("[data-path]").forEach((i) =>
    i.addEventListener("input", () => {
      exState.values[i.dataset.path] = i.value;
    }),
  );
  panel.querySelectorAll("[data-query]").forEach((i) =>
    i.addEventListener("input", () => {
      exState.query[i.dataset.query] = i.value;
    }),
  );
  panel
    .querySelector("#exSend")
    .addEventListener("click", () => sendExplorer(ep));
  panel.querySelector("#exCopy").addEventListener("click", () => copyCurl(ep));
}

function buildExplorerPath(ep) {
  return ep.path.replace(/:([a-z_]+)/gi, (_, k) => {
    const v = exState.values[k];
    return v === undefined || v === "" ? ":" + k : encodeURIComponent(v);
  });
}

async function sendExplorer(ep) {
  const result = document.getElementById("exResult");
  result.innerHTML = `<div class="card-body" style="border-top:1px solid var(--border)"><div class="loading"><span class="spinner"></span>Sending…</div></div>`;

  const pathParams = [...ep.path.matchAll(/:([a-z_]+)/gi)].map((m) => m[1]);
  const missing = pathParams.filter((p) => !exState.values[p]);
  if (missing.length) {
    result.innerHTML = `<div class="card-body" style="border-top:1px solid var(--border)"><div class="callout err" style="margin:0"><div class="ic">✕</div><div>Missing path param(s): <code>${missing.map((m) => ":" + m).join("</code>, <code>")}</code></div></div></div>`;
    return;
  }

  let body;
  if (ep.body !== undefined) {
    const raw = document.getElementById("exBody").value.trim();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch (e) {
        result.innerHTML = `<div class="card-body" style="border-top:1px solid var(--border)"><div class="callout err" style="margin:0"><div class="ic">✕</div><div>Body is not valid JSON: ${esc(e.message)}</div></div></div>`;
        return;
      }
    }
  }

  try {
    const r = await req(ep.method, buildExplorerPath(ep), {
      query: exState.query,
      body,
    });
    renderExplorerResult(result, r);
  } catch (e) {
    if (isCancelled(e)) {
      result.innerHTML = `<div class="card-body" style="border-top:1px solid var(--border)"><div class="empty" style="padding:20px">Cancelled — no actor set.</div></div>`;
      return;
    }
    result.innerHTML = `<div class="card-body" style="border-top:1px solid var(--border)">${errorBanner(e)}</div>`;
  }
}

function renderExplorerResult(container, r) {
  const sClass =
    r.status === 0
      ? "s0"
      : r.status < 300
        ? "s2"
        : r.status < 500
          ? "s4"
          : "s5";
  let bodyHtml;
  if (r.status === 204) {
    bodyHtml = `<div class="empty" style="padding:26px"><div class="big">∅</div><strong>204 No Content</strong><br><span style="font-size:12px">Empty body — do not call <code>.json()</code> on this response.</span></div>`;
  } else if (r.data === null) {
    bodyHtml = `<div class="empty" style="padding:26px">Empty response body.</div>`;
  } else {
    bodyHtml = `<div class="json">${highlightJSON(r.data)}</div>`;
  }
  const errDetail = !r.ok
    ? (() => {
        const d = describeError(r);
        let h = `<div class="callout err" style="margin:14px 0 0"><div class="ic">✕</div><div><strong>${esc(d.title)}</strong>`;
        if (d.detail) h += `<br>${esc(d.detail)}`;
        if (d.fields.length)
          h +=
            "<br>" +
            d.fields
              .map((f) => `<code>${esc(f.loc)}</code> — ${esc(f.msg)}`)
              .join("<br>");
        h += "</div></div>";
        return h;
      })()
    : "";

  container.innerHTML = `
    <div class="card-body" style="border-top:1px solid var(--border)">
      <div class="res-status" style="margin-bottom:14px">
        <span class="status-pill ${sClass}">${r.status || "ERR"}</span>
        <span class="badge ${r.ok ? "ok" : "danger"}">${r.ok ? "success" : "error"}</span>
        <span class="faint mono" style="font-size:11.5px">${r.ms}ms</span>
        <span class="right faint mono" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;max-width:100%;word-break:break-all">${esc(r.url)}</span>
      </div>
      ${errDetail}
      ${bodyHtml}
    </div>`;
}

async function copyCurl(ep) {
  const base = state.baseUrl.replace(/\/+$/, "");
  const url = base + buildExplorerPath(ep) + buildQuery(exState.query);
  const lines = [`curl -X ${ep.method} '${url}'`];
  if (pathNeedsActor(ep.method, ep.path) && state.actor) {
    lines.push(`  -H 'X-Actor: ${state.actor}'`);
  }
  if (ep.body !== undefined) {
    const raw = document.getElementById("exBody").value.trim();
    if (raw) {
      lines.push(`  -H 'Content-Type: application/json'`);
      lines.push(`  -d '${raw.replace(/'/g, "'\\''")}'`);
    }
  }
  const cmd = lines.join(" \\\n");
  try {
    await navigator.clipboard.writeText(cmd);
    toast("Copied to clipboard", "cURL command", "ok");
  } catch {
    toast("Copy failed", "Clipboard permission denied", "err");
  }
}

/* ============================================================
   BOOT
   ============================================================ */
baseUrlInput.value = state.baseUrl;

const baseModifiedEl = document.getElementById("baseModified");
function refreshOverrideDot() {
  const overriding = state.baseUrl !== CONFIG.BASE_URL;
  baseModifiedEl.classList.toggle("on", overriding);
  baseModifiedEl.title = overriding
    ? "Overriding CONFIG.BASE_URL — click ↺ to reset"
    : "Using CONFIG.BASE_URL";
}
refreshOverrideDot();

baseUrlInput.addEventListener("change", () => {
  state.baseUrl = baseUrlInput.value.trim() || CONFIG.BASE_URL;
  localStorage.setItem(STORAGE_KEYS.baseUrl, state.baseUrl);
  refreshOverrideDot();
});
document.getElementById("resetConfig").addEventListener("click", () => {
  state.baseUrl = CONFIG.BASE_URL;
  localStorage.removeItem(STORAGE_KEYS.baseUrl);
  baseUrlInput.value = state.baseUrl;
  refreshOverrideDot();
  setStatus("", "Reset to CONFIG.BASE_URL");
  toast("Reset to default", CONFIG.BASE_URL || "(same-origin)", "ok");
});
document.getElementById("pingBtn").addEventListener("click", ping);

navigate("dashboard");
ping();
