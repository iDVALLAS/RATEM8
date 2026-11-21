"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { cleanTag, sameTag } from "@/lib/contacts/tags";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";

/**
 * D73: tags as chips with ×, a box that adds a tag on Enter, a comma or
 * leaving it, type-ahead from the loan officer's existing tags, and "Your
 * tags" to tap. A typed tag that matches an existing one in other capitals
 * takes the existing spelling, so "vip" and "VIP" don't become two tags.
 */
export default function TagInput({
  value,
  onChange,
  suggestions = [],
  max,
  label,
  disabled = false,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  max: number;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const full = value.length >= max;
  const commit = (raw: string) => {
    const typed = cleanTag(raw);
    setText("");
    if (!typed || full || value.some((t) => sameTag(t, typed))) return;
    const known = suggestions.find((s) => sameTag(s, typed));
    onChange([...value, known ?? typed]);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(text);
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const q = cleanTag(text).toLocaleLowerCase("en-US");
  const offer = suggestions.filter((s) => !value.some((t) => sameTag(t, s)) && (!q || s.toLocaleLowerCase("en-US").includes(q))).slice(0, 8);

  return (
    <div className="cc-tagin">
      {value.length ? (
        <ul className="cc-tags" aria-label={label}>
          {value.map((t) => (
            <li key={t} className="cc-tag">
              <span>{t}</span>
              <button type="button" className="cc-tag__x" aria-label={tc.remove(t)} disabled={disabled} onClick={() => onChange(value.filter((x) => x !== t))}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="cc-tagin__row">
        <input
          className="mlo-input"
          list={suggestions.length ? `${id}-list` : undefined}
          value={text}
          onChange={(e) => (e.target.value.includes(",") ? commit(e.target.value.replace(/,/g, "")) : setText(e.target.value))}
          onKeyDown={onKey}
          onBlur={() => text && commit(text)}
          placeholder={full ? tc.max(max) : tc.addTag}
          aria-label={`${label}: ${tc.addTag}`}
          maxLength={80}
          disabled={disabled || full}
        />
        <button type="button" className="mlo-btn mlo-btn--ghost" disabled={disabled || full || !cleanTag(text)} onClick={() => commit(text)}>{tc.add}</button>
      </div>
      {suggestions.length ? (
        <datalist id={`${id}-list`}>
          {suggestions.slice(0, 200).map((s) => <option key={s} value={s} />)}
        </datalist>
      ) : null}
      {offer.length && !full ? (
        <div className="cc-tagin__suggest">
          <span className="mlo-note">{tc.yourTags}</span>
          {offer.map((s) => (
            <button key={s} type="button" className="cc-tag cc-tag--add" disabled={disabled} onClick={() => onChange([...value, s])}>+ {s}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
