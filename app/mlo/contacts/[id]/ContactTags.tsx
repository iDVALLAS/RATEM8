"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import TagInput from "../TagInput";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";

/**
 * D73: one person's tags on the contact page. Each change saves through the
 * bound server action (`setTagsAction.bind(null, contactId)`), which checks
 * the person is in the viewer's book.
 */
export default function ContactTags({ initial, suggestions, max, action }: { initial: string[]; suggestions: string[]; max: number; action: (tags: string[]) => Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> }) {
  const [tags, setTags] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (next: string[]) => {
    const before = tags;
    setTags(next);
    setMsg({ ok: true, text: tc.saving });
    start(async () => {
      const r = await action(next).catch(() => ({ ok: false as const, error: tc.failed }));
      if (r.ok) {
        setTags(r.tags);
        setMsg({ ok: true, text: tc.saved });
        router.refresh();
      } else {
        setTags(before);
        setMsg({ ok: false, text: r.error });
      }
    });
  };
  return (
    <div className="cc-contact-tags">
      <TagInput value={tags} onChange={save} suggestions={suggestions} max={max} label="Tags" disabled={pending} />
      <p className={msg && !msg.ok ? "mlo-note cc-tag-err" : "mlo-note"} role="status" aria-live="polite">{msg ? msg.text : tags.length ? "" : tc.noTags}</p>
    </div>
  );
}
