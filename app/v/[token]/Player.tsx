"use client";

import { useRef } from "react";

/** The video, with captions on, and a quiet "they watched" ping on the first play (D55). */
export default function Player({ token, src, type, poster, captions, title }: { token: string; src: string; type: string; poster: string | null; captions: boolean; title: string }) {
  const pinged = useRef(false);
  const onPlay = () => {
    if (pinged.current) return;
    pinged.current = true;
    fetch("/api/cc/videos/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), keepalive: true }).catch(() => undefined);
  };
  return (
    <video className="vw-video" controls playsInline preload="metadata" poster={poster ?? undefined} onPlay={onPlay} aria-label={title}>
      <source src={src} type={type.split(";")[0]} />
      {captions ? <track kind="captions" src={`/v/${token}/captions.vtt`} srcLang="en" label="English" default /> : null}
      Your browser can&apos;t play this video. <a href={src}>Download it</a>.
    </video>
  );
}
