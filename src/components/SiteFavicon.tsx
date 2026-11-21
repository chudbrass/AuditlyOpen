"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function buildFaviconCandidates(rootUrl: string): string[] {
  try {
    const origin = new URL(rootUrl).origin;
    return [
      new URL("/favicon.ico", origin).href,
      new URL("/favicon.svg", origin).href,
      new URL("/favicon-32x32.png", origin).href,
      new URL("/favicon.png", origin).href,
      new URL("/apple-touch-icon.png", origin).href,
      new URL("/apple-touch-icon-precomposed.png", origin).href,
    ];
  } catch {
    return [];
  }
}

function faviconStorageKey(rootUrl: string): string {
  return `auditly:favicon:${rootUrl}`;
}

export default function SiteFavicon({
  rootUrl,
  name,
  className = "",
}: {
  rootUrl: string;
  name: string;
  className?: string;
}) {
  const candidates = useMemo(() => buildFaviconCandidates(rootUrl), [rootUrl]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [smallSource, setSmallSource] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const src = candidates[candidateIndex];
  const fallback = name.trim().slice(0, 1).toUpperCase() || "?";

  useEffect(() => {
    const savedSource = window.localStorage.getItem(faviconStorageKey(rootUrl));
    const savedIndex = savedSource ? candidates.indexOf(savedSource) : -1;

    setCandidateIndex(savedIndex >= 0 ? savedIndex : 0);
    setLoaded(false);
    setSmallSource(false);
  }, [candidates, rootUrl]);

  useEffect(() => {
    setLoaded(false);
    const image = imgRef.current;
    if (!src || !image || !image.complete) return;

    if (image.naturalWidth > 0) {
      setSmallSource(image.naturalWidth < 32);
      setLoaded(true);
    } else {
      setCandidateIndex((index) => index + 1);
    }
  }, [src]);

  return (
    <span
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-blue-50 text-sm font-bold text-blue-600 ${className}`}
      aria-hidden="true"
    >
      {fallback}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- favicons are remote, tiny, and intentionally unoptimized.
        <img
          ref={imgRef}
          key={src}
          src={src}
          alt=""
          className={`absolute left-1/2 top-1/2 rounded-sm bg-white object-contain transition-opacity -translate-x-1/2 -translate-y-1/2 ${
            smallSource ? "h-5 w-5" : "h-7 w-7"
          } ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={(event) => {
            setSmallSource(event.currentTarget.naturalWidth < 32);
            setLoaded(true);
            window.localStorage.setItem(faviconStorageKey(rootUrl), src);
          }}
          onError={() => {
            setLoaded(false);
            window.localStorage.removeItem(faviconStorageKey(rootUrl));
            setCandidateIndex((index) => index + 1);
          }}
        />
      )}
    </span>
  );
}
