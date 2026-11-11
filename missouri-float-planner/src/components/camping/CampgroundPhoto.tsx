"use client";

import Image from "next/image";
import { useState } from "react";
import { EddyIcon } from "@/components/ui/EddyIcon";
import { optimizeBlogImage } from "@/lib/blog-image";
import styles from "./CampingHub.module.css";

/** Exact campground media from the overview, never a nearby river or site photo. */
export default function CampgroundPhoto({
  src,
  name,
  compact = false,
}: {
  src?: string | null;
  name: string;
  compact?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const hasPhoto = Boolean(src && src !== failedSource);
  return (
    <div
      className={compact ? styles.photoThumb : styles.campPhoto}
      data-campground-photo
    >
      {(!hasPhoto || loadedSource !== src) && (
        <div className={styles.photoFallback} aria-hidden={hasPhoto}>
          <EddyIcon name="campground" size={compact ? 28 : 64} decorative />
          {!compact && (
            <span>{hasPhoto ? "Loading photo…" : "Photo unavailable"}</span>
          )}
        </div>
      )}
      {hasPhoto && (
        <Image
          src={src!}
          alt={compact ? "" : name}
          fill
          sizes={
            compact
              ? "48px"
              : "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 380px"
          }
          unoptimized={!optimizeBlogImage(src!)}
          onLoad={() => setLoadedSource(src!)}
          onError={() => setFailedSource(src!)}
          style={{ objectFit: "cover" }}
        />
      )}
    </div>
  );
}
