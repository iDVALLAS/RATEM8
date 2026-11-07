/**
 * lib/pricing/loansifterBookmarklet.ts — the "Send to LoanM8" bookmarklet
 * (owner OK, 2026-11-06: run while the loan officer is logged in to
 * LoanSifter, until the LoanSifter API is available).
 *
 * It runs in the loan officer's own browser tab on a LoanSifter search
 * results page. It never sees or stores a password or login code, and it
 * sends nothing anywhere: it opens each eligible product's rate grid (the
 * same click the loan officer would make), reads rate and price, and shows
 * the result as text with a Copy button. The loan officer pastes that text
 * into /mlo/pricing, which checks it and publishes (loansifter.ts).
 *
 * Page structure it reads (LoanSifter, Angular + PrimeNG, 2026-11-06):
 *  - summary values: div[name=totalLoanAmount|propertyValue|ltv|loanPurpose|loanType|lockPeriod]
 *  - results: lb-eligible-products-table tr.primary-row / tr.alternate-row, cells
 *    td.investor .investor-name, td.productName-cell, then td.column-number:
 *    [0] last updated, [1] lock, [2] rate, [3] APR, [4] price, [5] discount/rebate,
 *    [6] lender fees, [7] LO comp ("-" or "1.500% $7,800"), …
 *  - a row's grid: the next tr.expanded-row, p-table.eligible-product-detail-rates
 *    tbody tr, cells [1] rate, [2] APR, [3] price, …, [6] lender fees.
 *
 * Written as plain ES2017 so it runs as a javascript: URL in any browser.
 */

/**
 * The bookmarklet body, as plain JavaScript text (not compiled by the bundler,
 * so what the loan officer bookmarks is exactly this).
 */
const BODY = String.raw`function sendToLoanM8() {
  var VERSION = 1;
  var doc = document;
  var txt = function (el) {
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  };
  var num = function (s) {
    var m = s.replace(/[$,%()\s]/g, "");
    if (m === "" || m === "-") return null;
    var n = Number(m);
    return isFinite(n) ? n : null;
  };
  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };
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

  var box = doc.createElement("div");
  box.setAttribute("style", "position:fixed;z-index:2147483647;top:16px;right:16px;width:380px;max-width:calc(100vw - 32px);background:#04342C;color:#FAFAF9;border:1px solid #5DCAA5;border-radius:12px;padding:14px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)");
  var status = doc.createElement("p");
  status.textContent = "LoanM8: reading results…";
  box.appendChild(status);
  doc.body.appendChild(box);

  (async function () {
    var rows = rowsOf();
    if (!rows.length) {
      status.textContent = "LoanM8: no results table here. Open a LoanSifter search result first.";
      return;
    }
    // Open every rate grid that is closed, one at a time. If the first
    // three clicks open nothing, stop trying and send what is on screen.
    var opened = 0, failed = 0;
    for (var i = 0; i < rows.length && !(opened === 0 && failed >= 3); i++) {
      var tr = rows[i];
      if (expandedAfter(tr)) continue;
      status.textContent = "LoanM8: opening rate grid " + (i + 1) + " of " + rows.length + "…";
      var targets = [tr.querySelector("td.productName-cell"), tr.querySelector("td.investor"), tr];
      var ok = false;
      for (var t = 0; t < targets.length && !ok; t++) {
        if (!targets[t]) continue;
        targets[t].click();
        for (var w = 0; w < 30; w++) {
          var e = expandedAfter(tr);
          if (e && gridOf(e).length) { ok = true; break; }
          await sleep(100);
        }
      }
      if (ok) opened++; else failed++;
    }
    var products = rowsOf().map(function (tr) {
      var c = tr.querySelectorAll("td.column-number");
      var exp = expandedAfter(tr);
      return {
        investor: txt(tr.querySelector("td.investor .investor-name")),
        product: txt(tr.querySelector("td.productName-cell")),
        lockDays: num(txt(c[1])),
        headline: { rate: num(txt(c[2])), price: num(txt(c[4])) },
        lenderFees: num(txt(c[6])),
        compPct: num((txt(c[7]).split(" ")[0]) || ""),
        grid: exp ? gridOf(exp) : [],
      };
    });
    var val = function (name) { return txt(doc.querySelector('[name="' + name + '"]')); };
    var capture = {
      kind: "loansifter-capture",
      v: VERSION,
      capturedAt: new Date().toISOString(),
      searchedAt: txt(doc.querySelector("lb-search-criteria-summary h1")),
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
    var withGrid = products.filter(function (p) { return p.grid.length > 0; }).length;
    status.textContent = "LoanM8: " + products.length + " products, " + withGrid + " with a full rate grid. Copy, then paste into Pricing snapshots → Import from LoanSifter.";
    var ta = doc.createElement("textarea");
    ta.value = JSON.stringify(capture);
    ta.readOnly = true;
    ta.setAttribute("style", "width:100%;height:80px;margin:8px 0;font:11px monospace;color:#050B08;background:#FAFAF9");
    var copy = doc.createElement("button");
    copy.textContent = "Copy";
    copy.setAttribute("style", "background:#5DCAA5;color:#04342C;border:0;border-radius:8px;padding:6px 14px;font-weight:600;cursor:pointer;margin-right:8px");
    copy.onclick = function () {
      ta.select();
      var done = function () { copy.textContent = "Copied"; };
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, function () { doc.execCommand("copy"); done(); });
      else { doc.execCommand("copy"); done(); }
    };
    var close = doc.createElement("button");
    close.textContent = "Close";
    close.setAttribute("style", "background:transparent;color:#FAFAF9;border:1px solid #5DCAA5;border-radius:8px;padding:6px 14px;cursor:pointer");
    close.onclick = function () { box.remove(); };
    box.appendChild(ta);
    box.appendChild(copy);
    box.appendChild(close);
  })().catch(function (e) {
    status.textContent = "LoanM8: something went wrong (" + (e && e.message) + "). Nothing was sent.";
  });
}
`;

export const BOOKMARKLET_SOURCE = `(${BODY.trim().replace(/^function sendToLoanM8/, "function")})()`;

/** What goes in the bookmark's URL field. */
export function bookmarkletUrl(): string {
  return "javascript:" + encodeURIComponent(BOOKMARKLET_SOURCE);
}
