import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { contactStore, listAll, PICKER_CAP } from "@/lib/contacts/store";
import { requestOrigin } from "@/lib/mail/origin";
import { CARD_MAX, CARD_STARTERS } from "@/lib/cards/library";
import { cardStore } from "@/lib/cards/store";
import { cardSignoff, designsFor, recipientFor, stylesFor, thanksStatus } from "@/lib/cards/service";
import { AUDIENCES, cardsOn, cardsRedirect, type Audience } from "@/lib/cards/thanks";
import { FlashBox } from "../MloChrome";
import Builder, { type PickPerson } from "./Builder";
import { discardCardsAction, disconnectThanksAction, neighborhoodAction, prepareCardsAction, sendCardsAction } from "./actions";
import PageHead from "../PageHead";
import NotOnYet from "../NotOnYet";
import "../mlo.css";
import "./cards.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cards by mail", robots: { index: false, follow: false } };

const money = (cents: number | null) => (cents === null ? "unknown" : `$${(cents / 100).toFixed(2)}`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : "");
const KIND = (k: string, s: string | null) => (k === "notecard" ? "Notecard" : `${s ?? "4x6"} postcard`);

/** /mlo/cards — handwritten-style cards by mail through your own Thanks.io account (D53). */
export default async function CardsPage({ searchParams }: { searchParams: Promise<{ f?: string; d?: string; c?: string; starter?: string; group?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const shell = (body: React.ReactNode) => (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="cards" title="Cards by mail" />
        <FlashBox flash={decodeFlash(sp.f)} />
        {body}
      </div>
    </PageShell>
  );
  if (!me) return shell(<p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to send cards.</p>);
  const origin = requestOrigin(await headers());

  if (!cardsOn()) {
    return shell(
      <NotOnYet what="cards" icon="mail" owner={me.role === "owner"}>
        <ol className="mlo-list">
          <li>In Thanks.io (dashboard.thanks.io), open Settings → API Access, and under OAuth Applications click <strong>Create Application</strong>.</li>
          <li>Redirect address: <code>{cardsRedirect(origin)}</code> (and the same path on your production address).</li>
          <li>In Vercel: <code>THANKSIO_CLIENT_ID</code> (not Sensitive) and <code>THANKSIO_CLIENT_SECRET</code> (Sensitive), then redeploy.</li>
        </ol>
      </NotOnYet>,
    );
  }

  const status = await thanksStatus(me);
  if (!status.connected) {
    return shell(
      <section className="mlo-section">
        {status.reconnect ? <p className="mlo-flash mlo-flash--err">Thanks.io stopped accepting Command Center&apos;s connection. Connect it again.</p> : null}
        <p>Connect your own Thanks.io account. Cards are printed, written in a handwriting style and mailed by Thanks.io, and paid from your Thanks.io account (you see the price before anything is sent).</p>
        <div className="mlo-row-form" style={{ marginTop: 12 }}>
          <a className="mlo-btn" href="/api/cc/cards/start">{status.reconnect ? "Reconnect Thanks.io" : "Connect Thanks.io"}</a>
          <span className="mlo-note">No account yet? Make one at thanks.io first, and add a payment method there.</span>
        </div>
      </section>,
    );
  }

  // Review a priced order.
  if (sp.d) {
    const o = await cardStore().order(sp.d);
    if (o && o.ownerUserId === me.id && o.status === "draft") {
      const names = await Promise.all(o.contactIds.slice(0, 60).map(async (id) => { const c = await contactStore().get(id); return c ? [c.firstName, c.lastName].filter(Boolean).join(" ") : ""; }));
      const short = o.balanceCents !== null && o.coveredByBalance === false;
      return shell(
        <>
          <section className="mlo-section cd-review" aria-labelledby="rv-h">
            <h2 id="rv-h" className="text-xl">{o.radius ? o.radius.found : o.contactIds.length} {KIND(o.kind, o.size).toLowerCase()}{(o.radius ? o.radius.found : o.contactIds.length) === 1 ? "" : "s"} · {money(o.estimateCents)}</h2>
            <p className="mlo-note">Priced by Thanks.io just now; nothing has been charged. Paid from your Thanks.io account{o.balanceCents !== null ? ` (balance ${money(o.balanceCents)})` : ""}.{short ? " Your balance doesn't cover it: Thanks.io charges your card on file or refuses the order." : ""}</p>
            {o.testMode ? <p className="mlo-flash">Your Thanks.io account is in test mode: Thanks.io will cancel these instead of mailing them.</p> : null}
            <div className="cd-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {o.imageUrl ? <img src={o.imageUrl} alt="The card's front" /> : null}
              <pre className="cd-signoff">{o.finalMessage.replace(/%FIRST_NAME%/g, "[first name]")}</pre>
            </div>
            <p className="mlo-note" style={{ marginTop: 10 }}>{o.radius ? <>To: the {o.radius.found} homes nearest {o.radius.address} ({AUDIENCES[o.radius.audience as Audience] ?? "every home"}). Thanks.io buys this list when you send (included in the price).</> : <>To: {names.filter(Boolean).join(", ")}{o.contactIds.length > 60 ? ` and ${o.contactIds.length - 60} more` : ""}.</>} From: your name, at your company&apos;s address.</p>
            <div className="mlo-row-form" style={{ marginTop: 12 }}>
              <form action={sendCardsAction.bind(null, o.id)}><button type="submit" className="mlo-btn">Send {o.radius ? o.radius.found : o.contactIds.length} card{(o.radius ? o.radius.found : o.contactIds.length) === 1 ? "" : "s"} for {money(o.estimateCents)}</button></form>
              <form action={discardCardsAction.bind(null, o.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Don&apos;t send</button></form>
            </div>
          </section>
          {o.skipped.length ? (
            <section className="mlo-section" aria-labelledby="sk-h">
              <h2 id="sk-h" className="text-xl">Left out ({o.skipped.length})</h2>
              <ul className="mlo-list">{o.skipped.slice(0, 100).map((s) => <li key={s.contactId}><Link href={`/mlo/contacts/${s.contactId}`}>{s.name}</Link>: {s.reason}</li>)}</ul>
            </section>
          ) : null}
        </>,
      );
    }
  }

  const [nc, p46, p69, styles] = await Promise.all([designsFor(me, "notecard", null), designsFor(me, "postcard", "4x6"), designsFor(me, "postcard", "6x9"), stylesFor(me)]);
  const problem = [nc, p46, p69, styles].find((r) => !r.ok);
  // D87.2: the book page by page (one read used to stop at 500), up to the picker's 5,000; a person sent here from
  // their contact page is always in it.
  const book = await listAll({ ownerUserId: me.id }, { cap: PICKER_CAP });
  const asked = sp.c && !book.contacts.some((c) => c.id === sp.c) ? await contactStore().get(sp.c) : null;
  const contacts = asked && asked.ownerUserId === me.id ? [...book.contacts, asked] : book.contacts;
  const people: PickPerson[] = contacts
    .filter((c) => c.ownerUserId === me.id)
    .map((c) => {
      const has = !!recipientFor(c);
      const note = c.locked ? "on hold" : c.noMail ? "no cards by mail" : !has ? "no mailing address" : "";
      return { id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") || "(no name)", group: c.kind === "agent" ? "agent" : c.relationship || "other", mailable: !note, note };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const history = await cardStore().ordersFor(me.id, 20);
  const pre = sp.c ? [sp.c].filter((id) => people.some((p) => p.id === id && p.mailable)) : sp.group ? people.filter((p) => p.group === sp.group && p.mailable).map((p) => p.id) : [];
  const neighborStarter = CARD_STARTERS.find((s) => s.id === "neighborhood")?.message ?? "";

  return shell(
    <>
      {problem && !problem.ok ? <p className="mlo-flash mlo-flash--err">{problem.error}</p> : null}
      <p className="mlo-note">Pick a card, a design from your Thanks.io library, the words and the people. Thanks.io prices it first; you send it from the next screen. Every card ends with your NMLS number, your company and Equal Housing Opportunity, and comes from your company&apos;s address.</p>
      <Builder
        action={prepareCardsAction}
        people={people}
        designs={{ notecard: nc.ok ? nc.value : [], "4x6": p46.ok ? p46.value : [], "6x9": p69.ok ? p69.value : [] }}
        styles={styles.ok ? styles.value.map((s) => ({ id: s.id, name: s.name })) : []}
        starters={CARD_STARTERS}
        signoff={cardSignoff(me)}
        max={CARD_MAX}
        preselect={pre}
        startWith={sp.starter}
        startGroup={sp.group}
      />
      {book.capped ? <p className="mlo-note">{`Showing the first ${book.contacts.length.toLocaleString("en-US")} of your ${book.total.toLocaleString("en-US")} people (by last name). To send a card to someone further down, open their contact page and choose Send a card.`}</p> : null}
      <section className="mlo-section" id="neighborhood" aria-labelledby="nb-h">
        <h2 id="nb-h" className="text-xl">Mail a neighborhood</h2>
        <p className="mlo-note">4 × 6 postcards to the homes nearest an address (a listing, an open house, your office). Thanks.io finds and prices the list first; nothing is bought until you send. Audiences are by home and stage only, never by family, age or wealth.</p>
        <form action={neighborhoodAction} className="mlo-grid" style={{ marginTop: 10 }}>
          <div className="mlo-row-form">
            <label className="mlo-field" style={{ flex: "2 1 220px" }}><span>Street address</span><input name="street" className="mlo-input" required maxLength={100} /></label>
            <label className="mlo-field" style={{ flex: "1 1 140px" }}><span>City</span><input name="city" className="mlo-input" required maxLength={60} /></label>
            <label className="mlo-field" style={{ flex: "0 1 80px" }}><span>State</span><input name="state" className="mlo-input" required maxLength={2} /></label>
            <label className="mlo-field" style={{ flex: "0 1 110px" }}><span>ZIP</span><input name="zip" className="mlo-input" required inputMode="numeric" maxLength={5} /></label>
          </div>
          <div className="mlo-row-form">
            <label className="mlo-field" style={{ flex: "0 1 140px" }}><span>How many homes</span><input name="count" className="mlo-input" inputMode="numeric" defaultValue={250} /></label>
            <label className="mlo-field" style={{ flex: "1 1 200px" }}><span>Who</span>
              <select name="audience" className="mlo-select" defaultValue="all">{Object.entries(AUDIENCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <input type="hidden" name="size" value="4x6" />
          </div>
          {(p46.ok ? p46.value : []).length ? (
            <div className="cd-designs" role="radiogroup" aria-label="Front design">
              {(p46.ok ? p46.value : []).map((d) => (
                <label key={d.id} className="cd-design">
                  <input type="radio" name="design" value={`${d.id}|${d.image}`} required />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.image} alt="" loading="lazy" />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          ) : <p className="mlo-note">Add a postcard design in Thanks.io (Image Templates) first.</p>}
          <label className="mlo-field"><span>Message (no names: these are neighbors you haven&apos;t met)</span><textarea name="message" rows={5} maxLength={CARD_MAX} className="mlo-textarea" defaultValue={neighborStarter} required /></label>
          <button type="submit" className="mlo-btn">Find the homes and price it</button>
        </form>
      </section>
      <section className="mlo-section" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-xl">Sent</h2>
        {history.filter((o) => o.status !== "draft").length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="mlo-table">
              <thead><tr><th>When</th><th>Card</th><th>People</th><th>Price</th><th>Status</th></tr></thead>
              <tbody>
                {history.filter((o) => o.status !== "draft").map((o) => (
                  <tr key={o.id}>
                    <td>{day(o.sentAt ?? o.createdAt)}</td>
                    <td>{KIND(o.kind, o.size)}</td>
                    <td>{o.contactIds.length}</td>
                    <td>{money(o.estimateCents)}</td>
                    <td>{o.status === "sent" ? `Sent${o.orderId ? ` (Thanks.io #${o.orderId})` : ""}${o.testMode ? ", test mode" : ""}` : o.status === "failed" ? `Not sent: ${o.error}` : o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mlo-note">Nothing yet. Delivery status is in your Thanks.io dashboard.</p>}
        <form action={disconnectThanksAction} style={{ marginTop: 12 }}><button type="submit" className="mlo-btn mlo-btn--ghost">Disconnect Thanks.io</button></form>
      </section>
    </>,
  );
}
