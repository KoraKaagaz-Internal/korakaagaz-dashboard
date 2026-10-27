import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { signInWithGoogle } from "../actions/auth";

const MESSAGES: Record<string, string> = {
  not_invited: "This Google account isn't invited. Access is by invitation only: ask the Kora Kaagaz admin to invite your email.",
  removed: "Your access has been removed. Contact the admin if this is a mistake.",
  link: "That sign-in link didn't work. Try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await getUser();
  if (user) redirect("/");
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? error) : "";
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5">
        <h1 className="font-serif text-4xl leading-none text-navy uppercase">
          Kora
          <br />
          Kaagaz
        </h1>
        <p className="mt-6 text-sm text-neutral-600">Invoices, quotes and payments for the Kora Kaagaz team.</p>
        {message && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{message}</p>}
        <form action={signInWithGoogle} className="mt-6">
          <button className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm font-medium hover:bg-neutral-50">
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
        <p className="mt-4 text-xs text-neutral-500">Access is by invitation only. People who aren&apos;t invited can&apos;t sign in.</p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.4-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
