"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** N = new invoice, Q = new quote, / = search documents. Ignored while typing. */
export function Shortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "n") router.push("/documents/new?type=invoice");
      else if (e.key === "q") router.push("/documents/new?type=quote");
      else if (e.key === "/") {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>("input[name=q]");
        if (search) search.focus();
        else router.push("/documents?focus=1");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
