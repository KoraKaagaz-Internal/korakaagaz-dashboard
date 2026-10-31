import type { Metadata } from "next";
import { DEFAULT_BOOKING, type BookingSettings } from "@/lib/crm";
import { createAdminClient } from "@/lib/supabase/admin";
import { EnquiryForm } from "./EnquiryForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start a project · Kora Kaagaz", robots: { index: false } };

/** Public enquiry form. ?embed=1 drops the page chrome for an iframe; ?source=instagram tags the lead. */
export default async function EnquirePage({ searchParams }: { searchParams: Promise<{ embed?: string; source?: string }> }) {
  const sp = await searchParams;
  const { data } = await createAdminClient().from("settings").select("enquiry_services, booking").eq("id", 1).single();
  const booking: BookingSettings = { ...DEFAULT_BOOKING, ...((data?.booking as BookingSettings) ?? {}) };
  const services = (data?.enquiry_services as string[]) ?? [];
  const form = <EnquiryForm services={services} source={sp.source ?? "website"} bookingUrl={booking.enabled ? `/book/${booking.slug}` : null} />;
  if (sp.embed) return <div className="bg-transparent p-1">{form}</div>;
  return (
    <main className="min-h-screen bg-[#f6f6f8] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="font-serif text-2xl text-[#081788] uppercase">Kora Kaagaz</p>
        <h1 className="mt-6 text-3xl font-semibold text-neutral-900">Let&apos;s make something.</h1>
        <p className="mt-2 mb-6 text-neutral-600">Tell us a little about your brand and the project. We reply within a working day.</p>
        {form}
      </div>
    </main>
  );
}
