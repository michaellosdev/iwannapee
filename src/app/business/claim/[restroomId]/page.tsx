import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessClaimForm } from "@/components/business-claim-form";
import { getPublicRestroom } from "@/lib/public-directory";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claim a business restroom", robots: { index: false, follow: false } };

export default async function BusinessClaimPage({ params }: { params: Promise<{ restroomId: string }> }) {
  const restroom = await getPublicRestroom((await params).restroomId);
  if (!restroom) notFound();
  const supabase = await createClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  return <main className="business-claim-page"><nav className="public-detail-nav"><Link className="directory-brand" href="/">IWANNAPEE</Link><Link href="/restrooms">Restroom directory</Link></nav><BusinessClaimForm address={restroom.address} restroomId={restroom.id} restroomName={restroom.name} userEmail={data.user?.email || null} /></main>;
}
