/**
 * D89.2: a build-time fix for a React hydration bug (React error #418,
 * "server rendered HTML didn't match the client"), applied to the copy of
 * React that Next.js bundles for the browser.
 *
 * The bug: Next.js starts hydrating before the whole page has arrived, and
 * React streams large pages in pieces, so part of a page can still be on
 * its way when hydration reaches it. When an element's children include a
 * piece that hasn't arrived yet, React pauses on that element and later
 * "replays" it. For a plain HTML element (a div, a form) the replay claimed
 * the next DOM node again, but by then React's place in the server HTML had
 * already moved inside the element, so it found the element's first child
 * instead of the element: a mismatch, and React threw the page's HTML away
 * and drew it again on the client. It showed up about once in a few hundred
 * page loads, on whichever Command Center page was loading slowly.
 *
 * React fixed this upstream (later releases put React's place back on the
 * element before the replay); the Next.js release this site uses (15.5)
 * still bundles a React without that fix. This loader adds the same lines,
 * word for word, to the replay step in `react-dom-client.*.js`. It changes
 * nothing else. If React's code no longer has the old shape and doesn't
 * already carry the fix, the build fails rather than ship without it.
 */
"use strict";

// The replay step: `case 5` is a host component (an HTML element).
const OLD = /case 5:(\s*)resetHooksOnUnwind\((\w+)\);(\s*)default:(\s*)unwindInterruptedWork\(current, \2\)/g;
// Already fixed (a React with the upstream change, or a second pass).
const FIXED = /fiber === hydrationParentFiber &&\s*\(isHydrating\s*\?\s*\(popToNextHostParent\(fiber\),/;
// Names the fix relies on; all are module-level in react-dom-client.
const NEEDS = ["hydrationParentFiber", "nextHydratableInstance", "isHydrating", "popToNextHostParent"];

/** Returns the source with the fix added. Throws if it can't be placed exactly once. */
function patchReplay(source) {
  if (FIXED.test(source)) return source;
  const hits = source.match(OLD) || [];
  if (hits.length !== 1) throw new Error(`react-replay-fix: expected the host-component replay step once in react-dom-client, found it ${hits.length} times. Check whether the bundled React already has the upstream hydration replay fix and update scripts/react-replay-fix.cjs.`);
  for (const name of NEEDS) {
    if (!new RegExp(`\\b${name}\\b`).test(source)) throw new Error(`react-replay-fix: react-dom-client no longer defines ${name}; update scripts/react-replay-fix.cjs.`);
  }
  return source.replace(OLD, (_m, a, v, b, c) =>
    `case 5:${a}resetHooksOnUnwind(${v});${a}var fiber = ${v};${a}fiber === hydrationParentFiber &&${a}  (isHydrating${a}    ? (popToNextHostParent(fiber),${a}      5 === fiber.tag &&${a}        null != fiber.stateNode &&${a}        (nextHydratableInstance = fiber.stateNode))${a}    : (popToNextHostParent(fiber), (isHydrating = !0)));${b}default:${c}unwindInterruptedWork(current, ${v})`,
  );
}

/** The webpack loader (next.config.ts adds it for react-dom-client only). */
module.exports = function reactReplayFixLoader(source) {
  return patchReplay(String(source));
};
module.exports.patchReplay = patchReplay;
