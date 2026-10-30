"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Opens the task side panel by adding ?task=<id> to the current URL. */
export function useOpenTask() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("task", id);
    router.push(`${path}?${sp.toString()}`, { scroll: false });
  };
}
