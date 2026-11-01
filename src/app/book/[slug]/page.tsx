import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bookingSlots } from "@/app/actions/crm";
import { BookingPicker } from "./BookingPicker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a call · Kora Kaagaz", robots: { index: false } };

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await bookingSlots(slug);
  if (!data) notFound();
  return (
    <main className="min-h-screen bg-[#f6f6f8] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="font-serif text-2xl text-navy uppercase">{data.business}</p>
        <h1 className="mt-6 text-3xl font-semibold text-neutral-900">{data.booking.title}</h1>
        <p className="mt-2 mb-6 text-neutral-600">
          {data.booking.minutes} minutes · {data.booking.location}
        </p>
        <BookingPicker slug={slug} days={data.days} minutes={data.booking.minutes} />
      </div>
    </main>
  );
}
