/**
 * lib/pricing/loansifterBookmarklet.ts — the "Send to LoanM8" bookmarklet
 * (owner OK, 2026-11-06: run while the loan officer is logged in to
 * LoanSifter, until the LoanSifter API is available).
 *
 * It runs in the loan officer's own browser tab. It never sees or stores a
 * password or login code. It sends nothing over the network itself: it
 * hands each capture to LoanM8's receive page (/mlo/pricing/receive, behind
 * the admin login) in another tab with window.postMessage, and that page
 * publishes it. If the browser blocks the tab, it falls back to a Copy box.
 *
 * Two places it works (C11):
 *  - Scenarios page (/scenarios): a checklist of saved scenarios (the
 *    choice is remembered in this browser). For each one ticked it clicks
 *    "Reprice Scenario", opens the results ("View All Results" if repricing
 *    stays on the list), opens every rate grid, sends the capture, and goes
 *    back to the list for the next.
 *  - A results page: sends that one search.
 *
 * Page structure it reads (LoanSifter 1.1.1192, Angular + PrimeNG, 2026-11-06):
 *  - Scenarios: lb-scenario-list tbody tr; td.scenario (name);
 *    input.p-checkbox-input value (scenario id); td.last-search;
 *    td.refresh a (Reprice Scenario); td.split-button button.p-splitbutton-button
 *    (View All Results). A row being repriced has .in-progress.
 *  - Results summary: div[name=totalLoanAmount|propertyValue|ltv|loanPurpose|loanType|lockPeriod];
 *    lb-search-criteria-summary h1 "Search Results - 11/6/2026 3:15 PM"; .scenarioName.
 *  - Results: lb-eligible-products-table tr.primary-row / tr.alternate-row
 *    with td.investor; td.investor .investor-name, td.productName-cell, then
 *    td.column-number: [0] last updated, [1] lock, [2] rate, [3] APR,
 *    [4] price, [5] discount/rebate, [6] lender fees, [7] LO comp.
 *  - A row's grid: the next tr.expanded-row, p-table.eligible-product-detail-rates
 *    tbody tr, cells [1] rate, [2] APR, [3] price, …, [6] lender fees.
 *
 * Written as plain ES2017 so it runs as a javascript: URL in any browser.
 */

/** Replaced with the LoanM8 site that served the bookmark (e.g. https://loanm8.com). */
const ORIGIN_SLOT = "__LOANM8_ORIGIN__";

/**
 * The bookmarklet body, as plain JavaScript text (not compiled by the bundler,
 * so what the loan officer bookmarks is exactly this). String.raw keeps "\s".
 */
const BODY = String.raw`function sendToLoanM8() {
  var VERSION = 1;
  var ORIGIN = "__LOANM8_ORIGIN__";
  var STORE = "loanm8.scenarios";
  var doc = document;
  if (window.__loanm8Running) { alert("Send to LoanM8 is already running in this tab."); return; }
  window.__loanm8Running = true;

  var txt = function (el) { return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : ""; };
  var num = function (s) {
    var m = String(s || "").replace(/[$,%()\s]/g, "");
    if (m === "" || m === "-") return null;
    var n = Number(m);
    return isFinite(n) ? n : null;
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var waitFor = async function (test, ms) {
    var end = Date.now() + ms;
    while (Date.now() < end) { var v = test(); if (v) return v; await sleep(250); }
    return null;
  };

  // ---- status box ----
  var box = doc.createElement("div");
  box.setAttribute("style", "position:fixed;z-index:2147483647;top:16px;right:16px;width:400px;max-width:calc(100vw - 32px);max-height:80vh;overflow:auto;background:#04342C;color:#FAFAF9;border:1px solid #5DCAA5;border-radius:12px;padding:14px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)");
  var title = doc.createElement("p");
  title.setAttribute("style", "margin:0 0 6px;font-weight:600");
  title.textContent = "Send to LoanM8";
  var status = doc.createElement("p");
  status.setAttribute("style", "margin:0 0 8px");
  var log = doc.createElement("ol");
  log.setAttribute("style", "margin:0;padding-left:18px");
  box.appendChild(title); box.appendChild(status); box.appendChild(log);
  doc.body.appendChild(box);
  var say = function (s) { status.textContent = s; };
  var btnStyle = "background:#5DCAA5;color:#04342C;border:0;border-radius:8px;padding:6px 14px;font-weight:600;cursor:pointer;margin:8px 8px 0 0";
  var ghostStyle = "background:transparent;color:#FAFAF9;border:1px solid #5DCAA5;border-radius:8px;padding:6px 14px;cursor:pointer;margin:8px 8px 0 0";
  var button = function (label, ghost, onClick) {
    var b = doc.createElement("button");
    b.textContent = label;
    b.setAttribute("style", ghost ? ghostStyle : btnStyle);
    b.onclick = onClick;
    box.appendChild(b);
    return b;
  };
  var finish = function () {
    window.__loanm8Running = false;
    button("Close", true, function () { box.remove(); });
  };
  var logLine = function (name) {
    var li = doc.createElement("li");
    li.textContent = name + ": working…";
    log.appendChild(li);
    return function (s, bad) { li.textContent = name + ": " + s; li.style.color = bad ? "#ffb4a8" : "#FAFAF9"; };
  };

  // ---- LoanM8 tab (opened now, while the click still counts) ----
  var target = null;
  try { target = window.open(ORIGIN + "/mlo/pricing/receive", "loanm8-receive"); } catch (e) { target = null; }
  var ready = false;
  var answers = {};
  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.kind !== "loanm8") return;
    if (e.data.type === "ready") ready = true;
    if (e.data.type === "result") answers[e.data.id] = e.data;
  });
  // If the LoanM8 tab left the receive page (a click in it, a reload), bring it
  // back and send again; the receive page answers a repeated id only once.
  var RECEIVE = ORIGIN + "/mlo/pricing/receive";
  var sendCapture = async function (name, capture, mark) {
    if (!target || target.closed) return false;
    mark("waiting for the LoanM8 tab (log in there if it asks)…");
    if (!(await waitFor(function () { return ready; }, 120000))) return false;
    var id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    for (var attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) {
        if (target.closed) break;
        mark("no answer yet; bringing the LoanM8 tab back to the receiving page…");
        ready = false;
        try { target.location.href = RECEIVE; } catch (e) {}
        if (!(await waitFor(function () { return ready; }, 60000))) break;
      }
      target.postMessage({ kind: "loansifter-capture", id: id, name: name, capture: capture }, ORIGIN);
      mark("publishing…");
      var a = await waitFor(function () { return answers[id]; }, attempt === 0 ? 30000 : 60000);
      if (a) {
        mark((a.ok ? "published. " : "not published. ") + (a.lines || []).join(" "), !a.ok);
        return true;
      }
    }
    mark("LoanM8 didn't answer. Leave the LoanM8 tab on its receiving page and run the button again.", true);
    return true;
  };
  var copyBox = function (captures) {
    say("The LoanM8 tab didn't open (pop-up blocked?). Copy this and paste it on LoanM8's Pricing snapshots page, one search at a time.");
    captures.forEach(function (c) {
      var ta = doc.createElement("textarea");
      ta.value = JSON.stringify(c);
      ta.readOnly = true;
      ta.setAttribute("style", "width:100%;height:60px;margin:8px 0 0;font:11px monospace;color:#050B08;background:#FAFAF9");
      box.appendChild(ta);
      button("Copy", false, function () { ta.select(); try { navigator.clipboard.writeText(ta.value); } catch (e) { doc.execCommand("copy"); } });
    });
  };

  // ---- results page ----
  var rowsOf = function () {
    return Array.prototype.slice.call(doc.querySelectorAll("lb-eligible-products-table tr.primary-row, lb-eligible-products-table tr.alternate-row")).filter(function (tr) {
      return tr.querySelector("td.investor");
    });
  };
  var expandedAfter = function (tr) {
    var n = tr.nextElementSibling;
    return n && n.classList.contains("expanded-row") ? n : null;
  };
  var gridOf = function (exp) {
    var out = [];
    exp.querySelectorAll("p-table.eligible-product-detail-rates tbody tr").forEach(function (r) {
      var c = r.querySelectorAll("td");
      var rate = num(txt(c[1]));
      var price = num(txt(c[3]));
      if (rate !== null && price !== null) out.push({ rate: rate, price: price, lenderFees: num(txt(c[6])) });
    });
    return out;
  };
  var expandAll = async function () {
    var rows = rowsOf();
    var opened = 0, failed = 0;
    for (var i = 0; i < rows.length && !(opened === 0 && failed >= 3); i++) {
      var tr = rows[i];
      if (expandedAfter(tr)) continue;
      say("Opening rate grid " + (i + 1) + " of " + rows.length + "…");
      var targets = [tr.querySelector("td.productName-cell"), tr.querySelector("td.investor"), tr];
      var ok = false;
      for (var t = 0; t < targets.length && !ok; t++) {
        if (!targets[t]) continue;
        targets[t].click();
        ok = !!(await waitFor(function () { var e = expandedAfter(tr); return e && gridOf(e).length; }, 3000));
      }
      if (ok) opened++; else failed++;
    }
  };
  var searchedIso = function (h1) {
    var m = h1.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (!m) return undefined;
    var d = new Date(m[1] + " " + m[2]);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  };
  var readCapture = function (scenarioId) {
    var products = rowsOf().map(function (tr) {
      var c = tr.querySelectorAll("td.column-number");
      var exp = expandedAfter(tr);
      return {
        investor: txt(tr.querySelector("td.investor .investor-name")),
        product: txt(tr.querySelector("td.productName-cell")),
        lockDays: num(txt(c[1])),
        headline: { rate: num(txt(c[2])), price: num(txt(c[4])) },
        lenderFees: num(txt(c[6])),
        compPct: num(txt(c[7]).split(" ")[0] || ""),
        grid: exp ? gridOf(exp) : [],
      };
    });
    var val = function (name) { return txt(doc.querySelector('[name="' + name + '"]')); };
    var h1 = txt(doc.querySelector("lb-search-criteria-summary h1"));
    var capture = {
      kind: "loansifter-capture",
      v: VERSION,
      capturedAt: new Date().toISOString(),
      searchedAt: h1,
      searchedAtIso: searchedIso(h1),
      scenarioName: txt(doc.querySelector(".scenarioName")),
      summary: {
        loanType: val("loanType"),
        lienType: val("lienType"),
        loanPurpose: val("loanPurpose"),
        totalLoanAmount: num(val("totalLoanAmount")),
        propertyValue: num(val("propertyValue")),
        ltv: num(val("ltv")),
        lockDays: num(val("lockPeriod").split(" ")[0] || ""),
      },
      products: products,
    };
    if (scenarioId) capture.scenarioId = scenarioId;
    return capture;
  };
  var captureHere = async function (scenarioId) {
    await expandAll();
    return readCapture(scenarioId);
  };

  // ---- scenarios page ----
  var scenarioRows = function () {
    return Array.prototype.slice.call(doc.querySelectorAll("lb-scenario-list tbody tr")).map(function (tr) {
      var cb = tr.querySelector("input.p-checkbox-input");
      return { tr: tr, id: cb ? String(cb.value) : "", name: txt(tr.querySelector("td.scenario")) };
    }).filter(function (r) { return r.id; });
  };
  var onScenarios = function () { return /\/scenarios\/?$/.test(location.pathname) && scenarioRows().length > 0; };
  var onResults = function () { return /\/search-results\//.test(location.pathname) && rowsOf().length > 0; };
  var backToScenarios = async function () {
    if (onScenarios()) return true;
    history.back();
    if (await waitFor(onScenarios, 15000)) return true;
    var link = doc.querySelector('a[href="/scenarios"]');
    if (link) link.click();
    return !!(await waitFor(onScenarios, 15000));
  };
  var runOne = async function (s, mark) {
    if (!(await backToScenarios())) { mark("couldn't get back to the Scenarios page.", true); return null; }
    var row = scenarioRows().filter(function (r) { return r.id === s.id; })[0];
    if (!row) { mark("not found on the Scenarios page.", true); return null; }
    var before = txt(row.tr.querySelector("td.last-search"));
    var reprice = row.tr.querySelector("td.refresh a");
    mark("repricing in LoanSifter…");
    if (reprice) reprice.click();
    // Repricing either opens the results or finishes on the list (new "Last Search" time).
    await waitFor(function () {
      if (/\/search-results\//.test(location.pathname)) return true;
      var r = scenarioRows().filter(function (x) { return x.id === s.id; })[0];
      return r && !r.tr.querySelector(".in-progress") && txt(r.tr.querySelector("td.last-search")) !== before;
    }, 90000);
    if (!/\/search-results\//.test(location.pathname)) {
      var r2 = scenarioRows().filter(function (x) { return x.id === s.id; })[0];
      var view = r2 && r2.tr.querySelector("td.split-button button.p-splitbutton-button");
      if (view) view.click();
    }
    if (!(await waitFor(onResults, 90000))) { mark("the results page didn't open.", true); return null; }
    await sleep(800);
    mark("opening rate grids…");
    var capture = await captureHere(s.id);
    var grids = capture.products.filter(function (p) { return p.grid.length; }).length;
    mark("read " + capture.products.length + " products, " + grids + " rate grids.");
    return capture;
  };

  var start = async function () {
    if (onResults() && !onScenarios()) {
      var mark1 = logLine(txt(doc.querySelector(".scenarioName")) || "This search");
      var c1 = await captureHere(undefined);
      if (await sendCapture(c1.scenarioName || "This search", c1, mark1)) say("Done.");
      else { mark1("not sent.", true); copyBox([c1]); }
      return finish();
    }
    if (!onScenarios()) {
      say("Open LoanSifter's Scenarios page (or a search results page), then click Send to LoanM8 again.");
      return finish();
    }
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem(STORE) || "[]"); } catch (e) { saved = []; }
    var rows = scenarioRows();
    say("Tick the saved scenarios to price and send. Your choice is remembered for next time.");
    var list = doc.createElement("div");
    list.setAttribute("style", "max-height:40vh;overflow:auto;margin:6px 0;padding:6px;background:rgba(255,255,255,.06);border-radius:8px");
    var boxes = rows.map(function (r) {
      var label = doc.createElement("label");
      label.setAttribute("style", "display:flex;gap:8px;align-items:flex-start;margin:4px 0;cursor:pointer");
      var cb = doc.createElement("input");
      cb.type = "checkbox";
      cb.checked = saved.length ? saved.indexOf(r.id) >= 0 : /^M8\b/i.test(r.name);
      var span = doc.createElement("span");
      span.textContent = r.name;
      label.appendChild(cb); label.appendChild(span); list.appendChild(label);
      return { r: r, cb: cb };
    });
    box.insertBefore(list, log);
    button("Price and send", false, async function () {
      var picked = boxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return { id: b.r.id, name: b.r.name }; });
      if (!picked.length) { say("Tick at least one scenario."); return; }
      try { localStorage.setItem(STORE, JSON.stringify(picked.map(function (p) { return p.id; }))); } catch (e) {}
      list.remove();
      Array.prototype.slice.call(box.querySelectorAll("button")).forEach(function (b) { b.remove(); });
      var leftovers = [];
      for (var i = 0; i < picked.length; i++) {
        say("Scenario " + (i + 1) + " of " + picked.length + ". Please leave this tab alone until it finishes.");
        var mark = logLine(picked[i].name);
        try {
          var cap = await runOne(picked[i], mark);
          if (cap && !(await sendCapture(picked[i].name, cap, mark))) leftovers.push(cap);
        } catch (e) { mark("stopped: " + (e && e.message), true); }
      }
      await backToScenarios();
      if (leftovers.length) copyBox(leftovers); else say("Done. Check the LoanM8 tab for the summary.");
      finish();
    });
    button("Cancel", true, function () { box.remove(); window.__loanm8Running = false; });
  };
  start().catch(function (e) { say("Something went wrong (" + (e && e.message) + "). Nothing more was sent."); finish(); });
}
`;

/** The bookmarklet as runnable JavaScript, pointed at a LoanM8 site. */
export function bookmarkletSource(origin: string): string {
  if (!/^https?:\/\/[^/"\s]+$/.test(origin)) throw new Error("bookmarklet origin must be a bare http(s) origin");
  return `(${BODY.trim().replace(/^function sendToLoanM8/, "function").replace(ORIGIN_SLOT, origin)})()`;
}

/** What goes in the bookmark's URL field. */
export function bookmarkletUrl(origin: string): string {
  return "javascript:" + encodeURIComponent(bookmarkletSource(origin));
}
