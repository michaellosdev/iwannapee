import Link from "next/link";
import { Accessibility, BadgeCheck, Clock3, MapPin, Star } from "lucide-react";
import type { PublicRestroom } from "@/lib/public-directory";
import { restroomPath } from "@/lib/public-links";

export function PublicRestroomCard({ restroom }: { restroom: PublicRestroom }) {
  const verified = Boolean(restroom.community_verified_at && restroom.community_verification_count > restroom.community_not_found_count);
  return (
    <article className="directory-restroom-card">
      {restroom.cover_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`Restroom at ${restroom.name}`} src={restroom.cover_photo_url} />
      ) : null}
      <div>
        <div className="directory-restroom-flags">
          {verified ? <span><BadgeCheck size={14} /> Community verified</span> : <span className="muted-flag">Needs verification</span>}
          {restroom.rating > 0 ? <span><Star size={13} fill="currentColor" /> {restroom.rating.toFixed(1)}</span> : null}
        </div>
        <h2><Link href={restroomPath(restroom)}>{restroom.name}</Link></h2>
        <p><MapPin size={15} /> {restroom.address}</p>
        <div className="directory-restroom-meta">
          <span><Clock3 size={14} /> {restroom.hours || "Hours not listed"}</span>
          {restroom.features.some((feature) => feature.toLowerCase().includes("access")) ? <span><Accessibility size={14} /> Accessible</span> : null}
        </div>
      </div>
    </article>
  );
}
