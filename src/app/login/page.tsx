import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await getUser();
  if (user) redirect("/invoices");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5">
        <h1 className="font-serif text-4xl leading-none text-navy uppercase">
          Kora
          <br />
          Kaagaz
        </h1>
        <p className="mt-6 text-sm text-neutral-600">Sign in with your email to manage invoices.</p>
        {error && <p className="mt-3 text-sm text-red-600">That sign-in link didn&apos;t work. Request a new one.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
