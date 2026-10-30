import { displayName, initials, type Person } from "@/lib/pm";

const TONES = ["bg-[#3846b4]", "bg-[#0f766e]", "bg-[#9333ea]", "bg-[#b45309]", "bg-[#be123c]", "bg-[#4d7c0f]"];

function tone(email: string) {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function Avatar({ email, people, size = 24 }: { email: string; people: Pick<Person, "email" | "name">[]; size?: number }) {
  const name = displayName(email, people);
  return (
    <span
      title={`${name} (${email})`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white ${tone(email)}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initials(name)}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function AvatarStack({ emails, people, max = 3 }: { emails: string[]; people: Pick<Person, "email" | "name">[]; max?: number }) {
  if (!emails.length) return <span className="text-xs text-neutral-400">Unassigned</span>;
  return (
    <span className="flex -space-x-1.5">
      {emails.slice(0, max).map((e) => (
        <Avatar key={e} email={e} people={people} />
      ))}
      {emails.length > max && <span className="ml-2 text-xs text-neutral-500">+{emails.length - max}</span>}
    </span>
  );
}
