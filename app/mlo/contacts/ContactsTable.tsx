"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cleanTag, tagHref } from "@/lib/contacts/tags";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";
import { bulkContactsAction } from "./actions";

export type ContactRow = { id: string; name: string; sub: string | null; phone: string; state: string; rel: string; badge: string; badgeOff: boolean; tags: string[] };
type Filter = { kind: "contact" | "agent"; q?: string; rel?: string; tag?: string };

/**
 * D73: the Contacts list with row checkboxes, "Select all N matching" and a
 * sticky bulk bar (Add tag / Remove tag). The server checks every person is
 * in the viewer's book (`bulkContactsAction`); D78 adds the other actions.
 */
export default function ContactsTable({ rows, total, filter, knownTags, selectAll }: { rows: ContactRow[]; total: number; filter: Filter; knownTags: string[]; selectAll: boolean }) {
  const id = useId();
  const router = useRouter();
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selectAll ? pageIds : []));
  const [matching, setMatching] = useState(selectAll && total > rows.length);
  const [tag, setTag] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

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
  const run = (op: "addTag" | "removeTag") => {
    const t = cleanTag(tag);
    if (!t) return setMsg({ ok: false, text: tc.typeTag });
    start(async () => {
      const target = matching ? { filter } : { ids: [...picked] };
      const r = await bulkContactsAction(target, { op, tag: t }).catch(() => ({ ok: false as const, error: tc.failed }));
      if (r.ok) {
        setMsg({ ok: true, text: r.message });
        setTag("");
        clear();
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  };

  return (
    <div className="cc-bulk">
      {msg ? <div className={`mlo-flash ${msg.ok ? "mlo-flash--ok" : "mlo-flash--err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null}
      <div className="mlo-scroll">
        <table className="mlo-table cc-contacts">
          <thead>
            <tr>
              <th scope="col" className="cc-contacts__pick">
                <input type="checkbox" checked={pageAll} onChange={togglePage} aria-label={tc.selectPage} />
              </th>
              <th scope="col">Name</th>
              <th scope="col" className="cc-hide-sm">Phone</th>
              <th scope="col" className="cc-hide-sm">State</th>
              <th scope="col" className="cc-hide-sm">{filter.kind === "agent" ? "Production" : "Relationship"}</th>
              <th scope="col">Permission</th>
              <th scope="col" className="cc-hide-sm">{tc.tagsHeading}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-picked={picked.has(r.id) || matching ? "" : undefined}>
                <td className="cc-contacts__pick">
                  <input type="checkbox" checked={matching || picked.has(r.id)} onChange={() => (matching ? (setMatching(false), setPicked(new Set(pageIds.filter((x) => x !== r.id)))) : toggle(r.id))} aria-label={tc.selectRow(r.name)} />
                </td>
                <th scope="row">
                  <Link href={`/mlo/contacts/${r.id}`}>{r.name}</Link>
                  {r.sub ? <><br /><span className="mlo-note">{r.sub}</span></> : null}
                  {r.rel ? <span className="cc-show-sm mlo-note">{r.rel}</span> : null}
                  {r.tags.length ? <span className="cc-show-sm"><Chips tags={r.tags} kind={filter.kind} /></span> : null}
                </th>
                <td className="cc-hide-sm">{r.phone}</td>
                <td className="cc-hide-sm">{r.state}</td>
                <td className="cc-hide-sm">{r.rel}</td>
                <td><span className={`mlo-pill ${r.badgeOff ? "mlo-pill--off" : ""}`}>{r.badge}</span></td>
                <td className="cc-hide-sm">{r.tags.length ? <Chips tags={r.tags} kind={filter.kind} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {count > 0 ? (
        <div className="cc-bulkbar" role="region" aria-label={tc.selected(count)}>
          <p className="cc-bulkbar__count">
            <strong>{matching ? tc.allSelected(total) : tc.selected(count)}</strong>
            {!matching && pageAll && total > rows.length ? <button type="button" className="cc-linkbtn" onClick={() => setMatching(true)}>{tc.selectAll(total)}</button> : null}
          </p>
          <div className="cc-bulkbar__row">
            <input className="mlo-input" list={knownTags.length ? `${id}-tags` : undefined} value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run("addTag"); } }} placeholder={tc.addTag} aria-label={tc.bulkTag} maxLength={80} disabled={pending} />
            <button type="button" className="mlo-btn" disabled={pending || !cleanTag(tag)} onClick={() => run("addTag")}>{pending ? tc.bulkWorking : tc.bulkAdd}</button>
            <button type="button" className="mlo-btn mlo-btn--ghost" disabled={pending || !cleanTag(tag)} onClick={() => run("removeTag")}>{tc.bulkRemove}</button>
            <button type="button" className="mlo-btn mlo-btn--ghost" disabled={pending} onClick={clear}>{tc.bulkClear}</button>
          </div>
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
