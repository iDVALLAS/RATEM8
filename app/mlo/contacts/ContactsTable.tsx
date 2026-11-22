"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cleanTag, tagHref } from "@/lib/contacts/tags";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";
import { contactPageCopy as cp } from "@/lib/content/contact-page";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { ruleQuery, type ListRule } from "@/lib/contacts/filter";
import { Icon } from "@/app/mlo/icons";
import { bulkContactsAction, dialAction } from "./actions";

export type ContactRow = {
  id: string;
  name: string;
  initials: string;
  /** "phone · state · relationship" (agents: brokerage and production). */
  line: string;
  badge: string;
  tone: "ok" | "warn" | "bad";
  tags: string[];
  /** A hand-dialed call isn't stopped, held or impossible (the gate still decides when it's tapped). */
  canCall: boolean;
  hasPhone: boolean;
};
type Action = "tag" | "campaign" | "check" | "assign" | "download" | "delete";

function downloadCsv(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * D73/D77: the Contacts list as rows: a pick box, initials, the name, a muted
 * "phone · state · relationship" line, tag chips, a plain badge ("Can text",
 * "Call only", "Do not contact") and 44px Call and Text buttons. "Select all
 * N matching" and the sticky bulk bar (Add tag / Remove tag) are D73's; D78
 * adds Add to a campaign, Check do-not-call and phone type, Assign (owners
 * and team leads), Download (CSV) and Delete (type DELETE; not assistants).
 * The server checks every person is in the viewer's book (`bulkContactsAction`);
 * "all matching" sends the list's rule, which the server runs again.
 */
export default function ContactsTable({ rows, total, rule, knownTags, selectAll, campaigns, team, canDelete }: { rows: ContactRow[]; total: number; rule: ListRule; knownTags: string[]; selectAll: boolean; campaigns: { id: string; name: string; status: string }[]; team: { id: string; name: string }[]; canDelete: boolean }) {
  const kind = rule.kind ?? "contact";
  const id = useId();
  const router = useRouter();
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selectAll ? pageIds : []));
  const [matching, setMatching] = useState(selectAll && total > rows.length);
  const [tag, setTag] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [calling, setCalling] = useState<string | null>(null);
  const [action, setAction] = useState<Action>("tag");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [member, setMember] = useState(team[0]?.id ?? "");
  const [confirm, setConfirm] = useState("");

  const count = matching ? total : picked.size;
  const pageAll = rows.length > 0 && pageIds.every((x) => picked.has(x));
  const toggle = (rid: string) => {
    setMatching(false);
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(rid)) n.delete(rid);
      else n.add(rid);
      return n;
    });
  };
  const togglePage = () => {
    setMatching(false);
    setPicked(pageAll ? new Set() : new Set(pageIds));
  };
  const clear = () => {
    setMatching(false);
    setPicked(new Set());
  };
  const target = () => (matching ? { rule } : { ids: [...picked] });
  const send = (op: Record<string, string>, after?: (csv?: string) => void) =>
    start(async () => {
      const r = await bulkContactsAction(target(), op).catch(() => ({ ok: false as const, error: tc.failed }));
      if (r.ok) {
        if (r.csv) {
          downloadCsv(r.csv, `loanm8-contacts-${new Date().toISOString().slice(0, 10)}.csv`);
          setMsg({ ok: true, text: `${lc.download}: ${r.message}` });
          return;
        }
        setMsg({ ok: true, text: r.message });
        after?.();
        clear();
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  const run = (op: "addTag" | "removeTag") => {
    const t = cleanTag(tag);
    if (!t) return setMsg({ ok: false, text: tc.typeTag });
    send({ op, tag: t }, () => setTag(""));
  };
  // "Check do-not-call and phone type" opens Record permission for just these people.
  const checkHref = matching ? `/mlo/contacts/permission?scope=list&${ruleQuery(rule)}#lines` : `/mlo/contacts/permission?ids=${[...picked].join(",")}#lines`;
  // Call: the contact rules are checked and the call logged first, then the phone app opens.
  const call = async (r: ContactRow) => {
    if (calling) return;
    setCalling(r.id);
    const res = await dialAction(r.id).catch(() => ({ ok: false as const, error: tc.failed }));
    setCalling(null);
    if (res.ok) window.location.href = `tel:${res.tel}`;
    else setMsg({ ok: false, text: `${r.name}: ${res.error}` });
  };

  return (
    <div className="cc-bulk">
      {msg ? <div className={`mlo-flash ${msg.ok ? "mlo-flash--ok" : "mlo-flash--err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null}
      <label className="mlo-check cc-people__all">
        <input type="checkbox" checked={pageAll} onChange={togglePage} aria-label={tc.selectPage} />
        <span>{tc.selectPage}</span>
      </label>
      <ul className="cc-people">
        {rows.map((r) => (
          <li key={r.id} className="cc-person" data-picked={picked.has(r.id) || matching ? "" : undefined}>
            <input type="checkbox" className="cc-person__pick" checked={matching || picked.has(r.id)} onChange={() => (matching ? (setMatching(false), setPicked(new Set(pageIds.filter((x) => x !== r.id)))) : toggle(r.id))} aria-label={tc.selectRow(r.name)} />
            <span className="cc-initials" aria-hidden="true">{r.initials}</span>
            <div className="cc-person__main">
              <Link className="cc-person__name" href={`/mlo/contacts/${r.id}`}>{r.name}</Link>
              {r.line ? <p className="cc-person__line">{r.line}</p> : null}
              <div className="cc-person__meta">
                <span className={`cc-reach cc-reach--${r.tone}`}>{r.badge}</span>
                {r.tags.length ? <Chips tags={r.tags} kind={kind} /> : null}
              </div>
            </div>
            <div className="cc-person__acts">
              {r.canCall ? (
                <a className="cc-iconbtn" href={`/mlo/contacts/${r.id}`} aria-label={`${cp.actions.call} ${r.name}`} aria-busy={calling === r.id || undefined} onClick={(e) => { e.preventDefault(); void call(r); }}><Icon name="phone" /></a>
              ) : (
                <button type="button" className="cc-iconbtn" disabled aria-label={`${cp.actions.call} ${r.name}`}><Icon name="phone" /></button>
              )}
              {r.hasPhone ? (
                <Link className="cc-iconbtn" href={`/mlo/contacts/${r.id}?tab=conversation#compose-text`} aria-label={`${cp.actions.text} ${r.name}`}><Icon name="message" /></Link>
              ) : (
                <button type="button" className="cc-iconbtn" disabled aria-label={`${cp.actions.text} ${r.name}`}><Icon name="message" /></button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {count > 0 ? (
        <div className="cc-bulkbar" role="region" aria-label={tc.selected(count)}>
          <p className="cc-bulkbar__count">
            <strong>{matching ? tc.allSelected(total) : tc.selected(count)}</strong>
            {!matching && pageAll && total > rows.length ? <button type="button" className="cc-linkbtn" onClick={() => setMatching(true)}>{tc.selectAll(total)}</button> : null}
          </p>
          <div className="cc-bulkbar__row">
            <select className="mlo-select" value={action} onChange={(e) => { setAction(e.target.value as Action); setMsg(null); }} aria-label={lc.action} disabled={pending}>
              <option value="tag">{lc.actions.tag}</option>
              <option value="campaign">{lc.actions.campaign}</option>
              <option value="check">{lc.actions.check}</option>
              {team.length ? <option value="assign">{lc.actions.assign}</option> : null}
              <option value="download">{lc.actions.download}</option>
              {canDelete ? <option value="delete">{lc.actions.delete}</option> : null}
            </select>
            <button type="button" className="mlo-btn mlo-btn--ghost" disabled={pending} onClick={clear}>{tc.bulkClear}</button>
          </div>
          {action === "tag" ? (
            <div className="cc-bulkbar__row">
              <input className="mlo-input" list={knownTags.length ? `${id}-tags` : undefined} value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run("addTag"); } }} placeholder={tc.addTag} aria-label={tc.bulkTag} maxLength={80} disabled={pending} />
              <button type="button" className="mlo-btn" disabled={pending || !cleanTag(tag)} onClick={() => run("addTag")}>{pending ? tc.bulkWorking : tc.bulkAdd}</button>
              <button type="button" className="mlo-btn mlo-btn--ghost" disabled={pending || !cleanTag(tag)} onClick={() => run("removeTag")}>{tc.bulkRemove}</button>
            </div>
          ) : action === "campaign" ? (
            campaigns.length ? (
              <>
                <div className="cc-bulkbar__row">
                  <select className="mlo-select cc-bulkbar__grow" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label={lc.pickCampaign} disabled={pending}>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" className="mlo-btn" disabled={pending || !campaignId} onClick={() => send({ op: "campaign", campaignId })}>{pending ? tc.bulkWorking : lc.addToCampaign}</button>
                </div>
                <p className="mlo-note cc-bulkbar__note">{lc.campaignNote}</p>
              </>
            ) : <p className="mlo-note cc-bulkbar__note">{lc.noCampaigns} <Link href="/mlo/campaigns?new=1">{lc.newCampaign}</Link></p>
          ) : action === "check" ? (
            <>
              <div className="cc-bulkbar__row"><Link className="mlo-btn" href={checkHref}>{lc.checkGo}</Link></div>
              <p className="mlo-note cc-bulkbar__note">{lc.checkNote}</p>
            </>
          ) : action === "assign" ? (
            <>
              <div className="cc-bulkbar__row">
                <select className="mlo-select cc-bulkbar__grow" value={member} onChange={(e) => setMember(e.target.value)} aria-label={lc.pickMember} disabled={pending}>
                  {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button type="button" className="mlo-btn" disabled={pending || !member} onClick={() => send({ op: "assign", userId: member })}>{pending ? tc.bulkWorking : lc.assign}</button>
              </div>
              <p className="mlo-note cc-bulkbar__note">{lc.assignNote}</p>
            </>
          ) : action === "download" ? (
            <>
              <div className="cc-bulkbar__row"><button type="button" className="mlo-btn" disabled={pending} onClick={() => send({ op: "download" })}>{pending ? tc.bulkWorking : lc.download}</button></div>
              <p className="mlo-note cc-bulkbar__note">{lc.downloadNote}</p>
            </>
          ) : (
            <>
              <div className="cc-bulkbar__row">
                <input className="mlo-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={lc.deleteWord} aria-label={lc.deleteConfirm} maxLength={20} autoComplete="off" disabled={pending} />
                <button type="button" className="mlo-btn mlo-btn--ghost" disabled={pending || confirm.trim() !== lc.deleteWord} onClick={() => send({ op: "delete", confirm: confirm.trim() }, () => setConfirm(""))}>{pending ? tc.bulkWorking : lc.deleteButton(count)}</button>
              </div>
              <p className="mlo-note cc-bulkbar__note">{lc.deleteNoteBulk}</p>
            </>
          )}
          {knownTags.length ? <datalist id={`${id}-tags`}>{knownTags.slice(0, 200).map((t) => <option key={t} value={t} />)}</datalist> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The first 3 tags as links to everyone with that tag, then "+n". */
function Chips({ tags, kind }: { tags: string[]; kind: "contact" | "agent" }) {
  return (
    <span className="cc-tags">
      {tags.slice(0, 3).map((t) => <Link key={t} href={tagHref(t, kind)} className="cc-tag cc-tag--sm">{t}</Link>)}
      {tags.length > 3 ? <span className="cc-tag cc-tag--sm cc-tag--more">{tc.more(tags.length - 3)}</span> : null}
    </span>
  );
}
