import type { Metadata } from "next";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Check a signed document" };

export default function VerifyPage() {
  return (
    <main className="min-h-screen bg-subtle px-4 py-12">
      <div className="mx-auto max-w-xl">
        <p className="font-serif text-2xl text-navy uppercase">Kora Kaagaz</p>
        <h1 className="mt-4 text-2xl font-semibold">Check a signed document</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Choose the signed PDF. It&apos;s checked in your browser (the file isn&apos;t uploaded): we compare its SHA-256 fingerprint with the one recorded when it was signed. Any
          change to the file, even one character, gives a different fingerprint.
        </p>
        <VerifyForm />
      </div>
    </main>
  );
}
