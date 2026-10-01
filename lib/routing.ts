/**
 * lib/routing.ts — state-based MLO routing (v15, Patch B).
 *
 * Pure functions over the MLO registry in lib/config.ts. Used by the
 * middleware (resolution), the root layout (MloContext), and the M8 chat
 * route. Behind MLO_ROUTING (default OFF).
 *
 * Modes, derived per state, never by convention:
 *   assign — every MLO serving the state is sponsored by one of the
 *            platform operator's sponsoring companies; the state routes to
 *            CONFIG.routing.stateAssignments[state].
 *   choose — any MLO from another brokerage serves the state (RESPA §8):
 *            the borrower picks from every licensed MLO, nothing
 *            pre-selected, random order, no paid placement.
 *
 * Resolution order (first that applies wins):
 *   1. the borrower's explicit choice (first-party cookie), if that MLO is
 *      licensed in the resolved state
 *   2. the subject property state the borrower gave us
 *   3. the IP region from Vercel's geo headers — a starting guess only
 *   4. nothing: ask "Where's the property?"
 * When the property state and IP state differ, the property state wins.
 *
 * `validateRouting()` runs when this module loads; a bad registry throws,
 * which fails `next build` (the root layout imports this file).
 */

import { CONFIG, ALL_MLOS, STATES, type Mlo, type MloLicense, type Sponsor, type StateCode } from "./config";
import type { MloContextValue, MloSource } from "./mlo-match";
import { usStateName } from "./us-states";

export type RoutingMode = "assign" | "choose";

export type RoutingConfig = {
  mlos: Mlo[];
  licensedStates: StateCode[];
  operatorMloId: string;
  stateAssignments: Partial<Record<StateCode, string>>;
  routingModeOverride: Partial<Record<StateCode, RoutingMode>>;
};

export function defaultRoutingConfig(): RoutingConfig {
  return {
    mlos: ALL_MLOS,
    licensedStates: STATES.map((s) => s.code),
    operatorMloId: CONFIG.routing.operatorMloId,
    stateAssignments: CONFIG.routing.stateAssignments,
    routingModeOverride: CONFIG.routing.routingModeOverride,
  };
}

const sponsorKey = (sp: Sponsor) => `${sp.name.trim().toLowerCase()}|${sp.idNumber.trim()}`;

function licenseFor(m: Mlo, code: string): MloLicense | undefined {
  return m.licenses.find((l) => l.state === code);
}

function serving(cfg: RoutingConfig, code: string): Mlo[] {
  return cfg.mlos.filter((m) => licenseFor(m, code));
}

/** The sponsoring companies of the platform operator's own MLO record. */
export function operatorSponsorKeys(cfg: RoutingConfig = defaultRoutingConfig()): Set<string> {
  const op = cfg.mlos.find((m) => m.id === cfg.operatorMloId);
  return new Set((op?.licenses ?? []).map((l) => sponsorKey(l.sponsor)));
}

/** True when this MLO's sponsor in this state is one of the operator's sponsoring companies. */
export function sameEntityAsOperator(m: Mlo, code: string, cfg: RoutingConfig = defaultRoutingConfig()): boolean {
  const l = licenseFor(m, code);
  return !!l && operatorSponsorKeys(cfg).has(sponsorKey(l.sponsor));
}

/** The derived mode for a state, or null when no licensed MLO serves it. */
export function routingMode(code: string, cfg: RoutingConfig = defaultRoutingConfig()): RoutingMode | null {
  const list = serving(cfg, code);
  if (!list.length) return null;
  const allSame = list.every((m) => sameEntityAsOperator(m, code, cfg));
  if (!allSame) return "choose";
  return cfg.routingModeOverride[code as StateCode] === "choose" ? "choose" : "assign";
}

/** Every rule the registry must satisfy. Empty array = valid. */
export function validateRouting(cfg: RoutingConfig = defaultRoutingConfig()): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const m of cfg.mlos) {
    if (ids.has(m.id)) errors.push(`MLO id "${m.id}" is used twice.`);
    ids.add(m.id);
    for (const l of m.licenses) {
      if (!cfg.licensedStates.includes(l.state)) errors.push(`${m.id} holds a license in ${l.state}, which is not in CONFIG.states.`);
    }
  }
  if (!cfg.mlos.some((m) => m.id === cfg.operatorMloId)) errors.push(`Operator MLO "${cfg.operatorMloId}" is not in the registry.`);

  for (const code of cfg.licensedStates) {
    const list = serving(cfg, code);
    const assignedId = cfg.stateAssignments[code];
    const override = cfg.routingModeOverride[code];
    const derived = list.length ? (list.every((m) => sameEntityAsOperator(m, code, cfg)) ? "assign" : "choose") : null;

    if (override === "assign" && derived === "choose") {
      errors.push(`${code} is forced to "assign", but an MLO from another sponsoring company serves it. It must be "choose".`);
    }
    if (assignedId) {
      const m = cfg.mlos.find((x) => x.id === assignedId);
      if (!m) errors.push(`${code} is assigned to "${assignedId}", who is not in the registry.`);
      else if (!licenseFor(m, code)) errors.push(`${code} is assigned to ${assignedId}, who holds no ${code} license.`);
      else if (!sameEntityAsOperator(m, code, cfg)) {
        errors.push(`${code} is assigned to ${assignedId}, whose ${code} sponsor is not one of the operator's sponsoring companies. Assign mode requires the same entity; this state must be "choose".`);
      } else if (derived === "choose") {
        errors.push(`${code} has an assignment, but an MLO from another sponsoring company serves it. Remove the assignment; the state must be "choose".`);
      }
    } else if (derived === "assign" && override !== "choose") {
      errors.push(`${code} is an assign state with no entry in CONFIG.routing.stateAssignments.`);
    }
  }
  return errors;
}

const ROUTING_ERRORS = validateRouting();
if (ROUTING_ERRORS.length) {
  throw new Error(`MLO routing config is invalid (lib/config.ts):\n- ${ROUTING_ERRORS.join("\n- ")}`);
}

/* ─── Resolution ───────────────────────────────────────────────── */

export type RouteInputs = {
  /** MLO id from the borrower's explicit choice cookie. */
  chosenMloId?: string | null;
  /** Subject property state the borrower gave us (cookie). */
  propertyState?: string | null;
  /** Vercel geo headers. Used in-request only, never stored. */
  ipCountry?: string | null;
  ipRegion?: string | null;
};

const upper = (v: string | null | undefined) => (v ? v.trim().toUpperCase() : null);

function shuffled<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function resolveRoute(inputs: RouteInputs, cfg: RoutingConfig = defaultRoutingConfig(), rand: () => number = Math.random): MloContextValue {
  const propertyState = usStateName(upper(inputs.propertyState)) ? upper(inputs.propertyState) : null;
  const ipState = upper(inputs.ipCountry) === "US" && usStateName(upper(inputs.ipRegion)) ? upper(inputs.ipRegion) : null;
  const chosen = inputs.chosenMloId ? cfg.mlos.find((m) => m.id === inputs.chosenMloId) ?? null : null;

  // Property state wins; then the IP guess; a choice with no state uses
  // the chosen MLO's own state when they hold exactly one license.
  let stateCode = propertyState ?? ipState;
  let source: MloSource = propertyState ? "borrower_stated" : ipState ? "ip" : "none";
  if (!stateCode && chosen && chosen.licenses.length === 1) {
    stateCode = chosen.licenses[0].state;
    source = "chosen";
  }
  const base = {
    stateCode,
    stateName: usStateName(stateCode),
    ipState,
    propertyState,
    moved: !!(propertyState && ipState && propertyState !== ipState),
  };

  if (!stateCode) return { ...base, mlo: null, source: "none", status: "unknown" };

  const mode = routingMode(stateCode, cfg);
  if (!mode) return { ...base, mlo: null, source, status: "unlicensed" };

  const state = stateCode as StateCode;
  // 1. explicit choice, only if licensed for this state
  if (chosen && licenseFor(chosen, state)) {
    return { ...base, state, mlo: chosen, license: licenseFor(chosen, state) ?? null, source: "chosen", status: "matched", borrowerChooses: mode === "choose" };
  }
  if (mode === "assign") {
    const m = cfg.mlos.find((x) => x.id === cfg.stateAssignments[state]);
    if (m) return { ...base, state, mlo: m, license: licenseFor(m, state) ?? null, source, status: "matched", borrowerChooses: false };
  }
  return { ...base, state, mlo: null, source, status: "choose", borrowerChooses: true, candidates: shuffled(serving(cfg, state), rand) };
}

/* ─── Wire format: middleware → layout / API routes ───────────── */

export const ROUTE_HEADER = "x-lm8-route";
export const CHOICE_COOKIE = "lm8_mlo";
export const PROPERTY_COOKIE = "lm8_property_state";

type Wire = {
  s: MloContextValue["status"];
  src: MloSource;
  st: string | null;
  m: string | null;
  c?: string[];
  ip: string | null;
  p: string | null;
};

export function encodeRoute(v: MloContextValue): string {
  const w: Wire = { s: v.status, src: v.source, st: v.stateCode ?? null, m: v.mlo?.id ?? null, c: v.candidates?.map((x) => x.id), ip: v.ipState ?? null, p: v.propertyState ?? null };
  return JSON.stringify(w);
}

/**
 * Rebuilds the context from the middleware header. Only ids travel; every
 * fact is re-read from the registry, and anything inconsistent falls back
 * to "unknown" rather than rendering a mix of two MLOs.
 */
export function decodeRoute(raw: string | null | undefined, cfg: RoutingConfig = defaultRoutingConfig()): MloContextValue {
  const unknown: MloContextValue = { mlo: null, source: "none", status: "unknown" };
  if (!raw) return unknown;
  let w: Wire;
  try {
    w = JSON.parse(raw) as Wire;
  } catch {
    return unknown;
  }
  const stateCode = usStateName(w.st) ? w.st : null;
  const base = {
    stateCode,
    stateName: usStateName(stateCode),
    ipState: usStateName(w.ip) ? w.ip : null,
    propertyState: usStateName(w.p) ? w.p : null,
  };
  const moved = !!(base.propertyState && base.ipState && base.propertyState !== base.ipState);
  const src: MloSource = ["none", "ip", "borrower_stated", "chosen"].includes(w.src) ? w.src : "none";
  if (w.s === "matched" && stateCode) {
    const m = cfg.mlos.find((x) => x.id === w.m);
    const l = m ? licenseFor(m, stateCode) : undefined;
    if (!m || !l) return { ...unknown, ...base, moved };
    return { ...base, moved, state: stateCode as StateCode, mlo: m, license: l, source: src, status: "matched", borrowerChooses: routingMode(stateCode, cfg) === "choose" };
  }
  if (w.s === "choose" && stateCode) {
    const candidates = (w.c ?? []).map((id) => cfg.mlos.find((x) => x.id === id)).filter((m): m is Mlo => !!m && !!licenseFor(m, stateCode));
    return { ...base, moved, state: stateCode as StateCode, mlo: null, source: src, status: "choose", borrowerChooses: true, candidates };
  }
  if (w.s === "unlicensed" && stateCode) return { ...base, moved, mlo: null, source: src, status: "unlicensed" };
  return { ...unknown, ...base, moved };
}
