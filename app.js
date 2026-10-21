(() => {
  "use strict";
  const TZ = "Europe/Berlin";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (opts) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts });
  const fDay = fmt({ day: "numeric" }), fWd = fmt({ weekday: "short" }),
        fMon = fmt({ month: "long", year: "numeric" }), fShort = fmt({ day: "numeric", month: "short" }),
        fTime = fmt({ hour: "2-digit", minute: "2-digit", hour12: false }),
        fLong = fmt({ weekday: "short", day: "numeric", month: "short" }),
        fKey = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });
  const WD = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const BADGE = { premiere: "Premiere", en_surtitles: "EN surtitles", opening: "Opening",
                  pick: "Your pick", stale: "Not refreshed" };

  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  let data = null;
  let cat = store.get("radar.cat", "all");
  let view = store.get("radar.view", "list");
  let calDay = null;

  const key = (d) => fKey.format(d).split("/").reverse().join("-"); // yyyy-mm-dd in Berlin
  const hasTime = (iso) => !/T00:00(:00)?([+-]|$)/.test(iso);
  const show = (c) => cat === "all" || c.cat === cat;
  // "Next 2 months" in All: chip-only sources (gallery openings) only when starred.
  const showPlan = (c) => (cat === "all" ? !c.quiet || c.star : c.cat === cat);
  const catLabel = (id) => (data.categories.find((c) => c.id === id) || {}).label || id;

  function badges(c) {
    return (c.badges || []).map((b) => `<span class="badge ${esc(b)}">${esc(BADGE[b] || b)}</span>`).join("");
  }

  function card(c) {
    const d = new Date(c.start);
    const time = hasTime(c.start) && !c.running ? fTime.format(d) : "";
    const parts = [c.venue, time, c.price].filter(Boolean).map(esc);
    let when;
    if (c.running) when = `<b>→</b><i>now</i>`;
    else when = `<b>${fDay.format(d)}</b><i>${esc(fWd.format(d))}</i>`;
    if (c.until) parts.push(c.running ? `until ${esc(fShort.format(new Date(c.until)))}`
                                      : `until ${esc(fShort.format(new Date(c.until)))}`);
    let dates = "";
    if (c.dates && c.dates.length > 1) {
      const li = c.dates.map((x) => `<li>${esc(fLong.format(new Date(x)))}${hasTime(x) ? " · " + fTime.format(new Date(x)) : ""}</li>`).join("");
      dates = `<details class="dates"><summary>${c.dates.length} dates · next ${esc(fLong.format(d))}</summary><ul>${li}</ul></details>`;
    }
    return `<article class="ev${c.star ? " star" : ""}">
      <div class="when">${when}</div>
      <div class="body">
        <div class="tags"><span class="tag ${esc(c.cat)}">${esc(catLabel(c.cat))}</span>${badges(c)}</div>
        <a class="t" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>
        <div class="v">${parts.join(" · ")}</div>${dates}
      </div></article>`;
  }

  function renderWeek() {
    const list = data.week.filter(show);
    $("#week").innerHTML = list.length ? list.map(card).join("")
      : `<p class="empty">Nothing in this category this week.</p>`;
  }

  function renderWeekly() {
    const todayWd = (new Date(data.today + "T12:00:00").getDay() + 6) % 7;
    const order = [...Array(7).keys()].map((i) => (todayWd + i) % 7);
    let html = "";
    for (const wd of order) {
      const isSp = (c) => (c.specials || []).some((x) => x.date >= data.today && x.date <= data.week_end);
      const all = (data.weekly[wd] || []).filter(show).sort((a, b) => isSp(b) - isSp(a)); // special nights first
      if (!all.length) continue;
      const open = $("#weekly").dataset["open" + wd] === "1";
      const rows = all.map((c, i) => {
        const sp = (c.specials || []).find((x) => x.date >= data.today && x.date <= data.week_end);
        const hide = c.more && !open && cat === "all" && !sp ? " hidden" : "";
        const v = [c.venue, c.rule && c.rule !== "every week" ? c.rule : "", c.price].filter(Boolean).map(esc).join(" · ");
        const when = sp && (sp.date === data.today ? "Tonight" : fLong.format(new Date(sp.date + "T12:00:00")));
        const spl = sp ? `<div class="sp">→ ${esc(when)}: <a href="${esc(sp.url || c.url)}" target="_blank" rel="noopener">${esc(sp.title)}</a></div>` : "";
        return `<div class="rec${c.star || sp ? " star" : ""}${sp ? " special" : ""}"${hide}><span class="tm">${esc(c.time || "")}</span>
          <div class="body"><a class="t" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>
          <div class="v">${v}</div>${spl}</div></div>`;
      }).join("");
      const hidden = cat === "all" && !open ? all.filter((c) => c.more && !(c.specials || []).some((x) => x.date >= data.today && x.date <= data.week_end)).length : 0;
      const more = hidden ? `<button class="more" data-wd="${wd}">+ ${hidden} more</button>` : "";
      html += `<div class="day"><h3>${WD[wd]}</h3>${rows}${more}</div>`;
    }
    $("#weekly").innerHTML = html || `<p class="empty">No weekly sessions in this category.</p>`;
  }

  // Monday (yyyy-mm-dd, Berlin) of the week an ISO time falls in.
  function weekOf(iso) {
    const d = new Date(key(new Date(iso)) + "T12:00:00");
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return key(d);
  }
  const RANK = { pick: 3, premiere: 2, opening: 1 };
  const weight = (c) => Math.max(0, ...(c.badges || []).map((b) => RANK[b] || 0));
  const better = (a, b) => a.score - b.score || weight(a) - weight(b) || b.start.localeCompare(a.start);

  // "All": one highlight per category per week (plus your picks and what's running now).
  function highlights(list) {
    const keep = [], best = {};
    for (const c of list) {
      if (c.running || (c.badges || []).includes("pick")) { keep.push(c); continue; }
      const k = weekOf(c.start) + "|" + c.cat;
      if (!best[k] || better(c, best[k]) > 0) best[k] = c;
    }
    return keep.concat(Object.values(best))
      .sort((a, b) => (b.running === true) - (a.running === true) || a.start.localeCompare(b.start));
  }

  function renderMonths() {
    const hi = cat === "all";
    const list = hi ? highlights(data.months) : data.months.filter(showPlan);
    let html = hi ? `<p class="hint">Highlights: the best of each category per week. Tap a chip to see everything.</p>` : "";
    let last = "";
    for (const c of list) {
      const g = c.running ? "Running now"
        : hi ? `Week of ${fLong.format(new Date(weekOf(c.start) + "T12:00:00"))}` : fMon.format(new Date(c.start));
      if (g !== last) { html += `<div class="mon">${esc(g)}</div>`; last = g; }
      html += card(c);
    }
    $("#months").innerHTML = list.length ? html : `<p class="empty">Nothing in this category yet.</p>`;
  }

  function renderCal() {
    const byDay = {};
    for (const c of [...data.week.filter(show), ...data.months.filter(showPlan)]) {
      if (c.running) continue;
      // Every performance date of a production, so planning a free evening works.
      for (const iso of c.dates || [c.start]) {
        const k = key(new Date(iso));
        (byDay[k] ||= []).some((x) => x.id === c.id) || byDay[k].push({ ...c, start: iso, dates: null });
      }
    }
    const t0 = new Date(data.today + "T12:00:00"), tEnd = new Date(data.horizon + "T12:00:00");
    let html = "";
    for (let m = new Date(t0.getFullYear(), t0.getMonth(), 1); m <= tEnd; m.setMonth(m.getMonth() + 1)) {
      html += `<div class="mon">${esc(fMon.format(new Date(m.getFullYear(), m.getMonth(), 15)))}</div><div class="cal">`;
      html += ["M", "T", "W", "T", "F", "S", "S"].map((d) => `<div class="h">${d}</div>`).join("");
      const lead = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7;
      html += "<div></div>".repeat(lead);
      const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= days; d++) {
        const k = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const evs = byDay[k] || [];
        const off = k < data.today || k > data.horizon;
        const dots = [...new Set(evs.map((c) => c.cat))].slice(0, 6).map((c) => `<i class="${esc(c)}"></i>`).join("");
        html += `<button type="button" data-day="${k}"${off ? " disabled" : ""}${k === data.today ? ' class="today"' : ""}
          aria-pressed="${k === calDay}" aria-label="${k}, ${evs.length} events">${d}<span class="dots">${dots}</span></button>`;
      }
      html += `</div>`;
      if (calDay && calDay.slice(0, 7) === k7(m)) {
        const evs = byDay[calDay] || [];
        html += `<div class="calday"><div class="mon">${esc(fLong.format(new Date(calDay + "T12:00:00")))}</div>` +
          (evs.length ? evs.map(card).join("") : `<p class="empty">Nothing that day.</p>`) + `</div>`;
      }
    }
    $("#cal").innerHTML = html;
  }
  const k7 = (m) => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;

  function renderChips() {
    const present = new Set([...data.week, ...data.months, ...data.weekly.flat()].map((c) => c.cat));
    const cats = data.categories.filter((c) => present.has(c.id));
    if (cat !== "all" && !present.has(cat)) cat = "all";
    $("#chips").innerHTML = [{ id: "all", label: "All" }, ...cats]
      .map((c) => `<button type="button" data-c="${esc(c.id)}" aria-pressed="${c.id === cat}">${esc(c.label)}</button>`).join("");
  }

  function renderHealth() {
    const bad = data.health.filter((h) => h.warn);
    $("#health-sum").textContent = bad.length ? `Sources · ${bad.length} with problems ⚠` : `Sources · all ${data.health.length} OK`;
    $("#health-list").innerHTML = data.health.map((h) =>
      `<li class="${h.warn ? "bad" : ""}" title="${esc(h.error)}">${esc(h.source)} · ${h.count}${h.warn ? " ⚠" : ""}</li>`).join("");
    const links = data.edit_links || [];
    // From the home-screen icon iOS opens links in a built-in viewer that isn't signed in to
    // GitHub (private repo -> "Page not found"). x-safari-https:// hands the link to real Safari.
    const standaloneIOS = window.navigator.standalone === true;
    const open = (u) => (standaloneIOS ? u.replace(/^https:/, "x-safari-https:") : u);
    $("#edit-links").hidden = !links.length;
    $("#edit-hint").hidden = !links.length;
    $("#edit-links").innerHTML = links.map((l) =>
      `<a href="${esc(open(l.url))}" target="_blank" rel="noopener"${/actions/.test(l.url) ? ' class="plain"' : ""}>${esc(l.label)}</a>`).join("");
    const g = new Date(data.generated);
    $("#stamp").textContent = `Refreshed ${fLong.format(g)}, ${fTime.format(g)} · refreshes every Monday`;
  }

  function render() {
    renderChips(); renderWeek(); renderWeekly(); renderMonths();
    const cal = view === "cal";
    $("#months").hidden = cal; $("#cal").hidden = !cal;
    if (cal) renderCal();
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === view));
  }

  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    cat = b.dataset.c; store.set("radar.cat", cat); render();
  });
  document.querySelector(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    view = b.dataset.v; store.set("radar.view", view); render();
  });
  $("#cal").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-day]"); if (!b || b.disabled) return;
    calDay = calDay === b.dataset.day ? null : b.dataset.day; renderCal();
  });
  $("#weekly").addEventListener("click", (e) => {
    const b = e.target.closest("button.more"); if (!b) return;
    $("#weekly").dataset["open" + b.dataset.wd] = "1"; renderWeekly();
  });


  // ---- "Add a group" bar: appends to links.txt in the private settings repo via the GitHub API.
  // The key is pasted once by the owner and lives only in this device's storage.
  const KEY = "radar.ghkey";

  function normalizeLink(raw) {
    const u = String(raw || "").trim();
    let m = u.match(/^(?:https?:\/\/)?(?:www\.)?meetup\.com\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?([A-Za-z0-9_-]+)/);
    if (m) return { url: `https://www.meetup.com/${m[1]}/`, key: `meetup:${m[1].toLowerCase()}` };
    m = u.match(/^(?:https?:\/\/)?(?:www\.)?(?:lu\.ma|luma\.com)\/([A-Za-z0-9_-]+)/);
    if (m && !/^(event|discover|home|calendar|signin|create)$/i.test(m[1]))
      return { url: `https://luma.com/${m[1]}`, key: `luma:${m[1].toLowerCase()}` };
    return null;
  }
  const b64e = (s) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
  const b64d = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  async function ghUpdate(repo, key, path, change, message) {
    const api = (p, opts = {}) => fetch(`https://api.github.com/repos/${repo}/${p}`, {
      ...opts, cache: "no-store",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await api(`contents/${path}`);
      if (r.status === 401) return { ok: false, msg: "GitHub didn't accept the key (expired or mistyped). Set it up again below." };
      if (r.status === 403 || r.status === 404) return { ok: false, msg: "The key can't open your settings repo. Check its Repository access and Contents permission." };
      if (!r.ok) return { ok: false, msg: `GitHub said ${r.status}. Try again in a minute.` };
      const f = await r.json();
      const res = change(b64d(f.content || ""));
      if (res.dup) return { ok: true, dup: true, msg: res.dup };
      const w = await api(`contents/${path}`, { method: "PUT", body: JSON.stringify({
        message, content: b64e(res.text), sha: f.sha }) });
      if (w.status === 409 || w.status === 422) continue; // changed meanwhile: re-read once
      if (!w.ok) return { ok: false, msg: w.status === 403 ? "The key can read but not write. Give it Contents → Read and write."
                                                            : `Saving failed (${w.status}).` };
      const d = await api("actions/workflows/weekly.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main" }) });
      return { ok: true, msg: d.status === 204 ? "Saved ✓ Refresh started; it shows up here in about 4 minutes."
                                               : "Saved ✓ It shows up at Monday's refresh (the key can't start a refresh: add Actions → Read and write)." };
    }
    return { ok: false, msg: "The file changed while saving. Try again." };
  }

  const saveLink = (repo, key, link, cat) => ghUpdate(repo, key, "links.txt", (text) => {
    const have = text.split("\n").map((l) => normalizeLink(l.split(/\s+/)[0])).filter(Boolean).map((x) => x.key);
    if (have.includes(link.key)) return { dup: "Already in your list." };
    return { text: text.replace(/\s*$/, "\n") + link.url + (cat ? "  " + cat : "") + "\n" };
  }, `Add ${link.url} (from the page)`);

  // One YAML entry; JSON strings are valid YAML double-quoted scalars.
  function eventYaml(e) {
    const q = (v) => JSON.stringify(String(v));
    const lines = [`- title: ${q(e.title)}`];
    if (e.venue) lines.push(`  venue: ${q(e.venue)}`);
    if (e.cat) lines.push(`  category: ${e.cat}`);
    lines.push(`  date: ${q(e.time ? `${e.date} ${e.time}` : e.date)}`);
    if (e.url) lines.push(`  url: ${q(e.url)}`);
    return lines.join("\n") + "\n";
  }
  const saveEvent = (repo, key, e) => ghUpdate(repo, key, "extras.yaml", (text) => {
    if (text.includes(`title: ${JSON.stringify(e.title)}`) && text.includes(`"${e.date}`))
      return { dup: "That event is already in your list." };
    return { text: text.replace(/\s*$/, "\n") + "\n" + eventYaml(e) };
  }, `Add event ${e.title} on ${e.date} (from the page)`);

  function setupAddLink(repo) {
    if (!repo || $("#addlink").dataset.ready) return;
    $("#addlink").dataset.ready = "1";
    $("#addlink").hidden = false;
    $("#al-repo").textContent = repo;
    const msg = (t, cls = "") => { $("#al-msg").textContent = t; $("#al-msg").className = "msg " + cls; };
    const hasKey = () => !!store.get(KEY, "");
    const paint = () => {
      $("#al-setup-sum").textContent = hasKey() ? "Key saved on this device ✓ (change)" : "Set up saving (once per device)";
      $("#al-setup").open = !hasKey();
      $("#al-forget").hidden = !hasKey();
    };
    if (window.navigator.standalone === true) $("#al-newkey").href = $("#al-newkey").href.replace(/^https:/, "x-safari-https:");
    paint();

    $("#al-keyform").addEventListener("submit", (e) => {
      e.preventDefault();
      const k = $("#al-key").value.trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(k)) { msg("That doesn't look like a GitHub key (it starts with github_pat_).", "err"); return; }
      store.set(KEY, k); $("#al-key").value = ""; paint(); msg("Key saved on this device.", "ok");
    });
    $("#al-forget").addEventListener("click", () => {
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      paint(); msg("Key removed from this device.");
    });
    document.querySelector("#addlink .seg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      document.querySelectorAll("#addlink .seg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      $("#addlink-form").hidden = b.dataset.f !== "group";
      $("#addevent-form").hidden = b.dataset.f !== "event";
      msg("");
    });
    $("#ae-date").value = data.today;
    $("#addevent-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const ev = { title: $("#ae-title").value.trim(), date: $("#ae-date").value, time: $("#ae-time").value,
                   venue: $("#ae-venue").value.trim(), url: $("#ae-url").value.trim(), cat: $("#ae-cat").value };
      if (!ev.title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) { msg("Give it a title and a date.", "err"); return; }
      if (ev.url && !/^https?:\/\//i.test(ev.url)) ev.url = "https://" + ev.url;
      if (ev.time && !/^\d{2}:\d{2}$/.test(ev.time)) ev.time = "";
      const key = store.get(KEY, "");
      if (!key) { $("#al-setup").open = true; msg("First set up saving below (one time).", "err"); return; }
      $("#ae-save").disabled = true; msg("Saving…");
      try {
        const r = await saveEvent(repo, key, ev);
        msg(r.msg, r.ok ? "ok" : "err");
        if (r.ok && !r.dup) ["#ae-title", "#ae-time", "#ae-venue", "#ae-url"].forEach((id) => { $(id).value = ""; });
      } catch {
        msg("No connection to GitHub. Try again when you're online.", "err");
      } finally { $("#ae-save").disabled = false; }
    });
    $("#addlink-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const link = normalizeLink($("#al-url").value);
      if (!link) { msg("Paste a Meetup group link (meetup.com/…) or a Luma calendar link (luma.com/…).", "err"); return; }
      const key = store.get(KEY, "");
      if (!key) { $("#al-setup").open = true; msg("First set up saving below (one time).", "err"); return; }
      $("#al-save").disabled = true; msg("Saving…");
      try {
        const r = await saveLink(repo, key, link, $("#al-cat").value);
        msg(r.msg, r.ok ? "ok" : "err");
        if (r.ok && !r.dup) $("#al-url").value = "";
      } catch {
        msg("No connection to GitHub. Try again when you're online.", "err");
      } finally { $("#al-save").disabled = false; }
    });
  }


  // Events are fetched once a week, but "today" and "this week" come from the phone's own date
  // (Berlin time): past days drop off every morning and This week runs from today to Sunday.
  // ?today=YYYY-MM-DD in the address simulates another day (for checking).
  function rebase(d) {
    const sim = new URLSearchParams(location.search).get("today");
    const today = /^\d{4}-\d{2}-\d{2}$/.test(sim || "") ? sim : key(new Date());
    const noon = (k) => new Date(k + "T12:00:00");
    const wd = (noon(today).getDay() + 6) % 7; // Monday = 0
    const end = noon(today); end.setDate(end.getDate() + (6 - wd));
    const weekEnd = key(end);
    const day = (iso) => key(new Date(iso));
    const live = [];
    for (const c0 of [...d.week, ...d.months]) {
      const c = { ...c0 };
      if (c.until && c.until < today) continue; // run / festival is over
      if (c.dates) {
        c.dates = c.dates.filter((x) => day(x) >= today);
        if (!c.dates.length) continue;
        c.start = c.dates[0];
      } else if (!c.running && day(c.start) < today) {
        if (!c.until) continue; // one-off that already happened
        c.running = true; // opened earlier this week, still on
      }
      if (day(c.start) > d.horizon && !c.running) continue;
      live.push(c);
    }
    d.week = live.filter((c) => !c.running && day(c.start) <= weekEnd).sort((a, b) => a.start.localeCompare(b.start));
    d.months = live.filter((c) => c.running || day(c.start) > weekEnd)
      .sort((a, b) => (b.running === true) - (a.running === true) || a.start.localeCompare(b.start));
    d.today = today;
    d.week_end = weekEnd;
    return d;
  }

  fetch("events.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      data = rebase(d);
      const a = new Date(d.today + "T12:00:00"), b = new Date(d.week_end + "T12:00:00");
      $("#sub").textContent = `${fLong.format(a)} · this week and the next two months`;
      $("#week-range").textContent = d.today === d.week_end ? "today" : `today – ${fLong.format(b)}`;
      render(); renderHealth(); setupAddLink(d.links_repo);
    })
    .catch(() => { $("#sub").textContent = "Couldn't load events. Check your connection and reopen."; });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
