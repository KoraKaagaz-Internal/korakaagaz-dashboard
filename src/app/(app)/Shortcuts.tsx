"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * G then H/W/P = go Home / My work / Projects. Editors also get N = new invoice (admin), Q = new quote,
 * P = new project. / = search on the current page. Ignored while typing.
 */
export function Shortcuts({ canEdit, isStaff, isAdmin }: { canEdit: boolean; isStaff: boolean; isAdmin: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let go = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (Date.now() - go < 1200) {
        go = 0;
        if (e.key === "h" && isStaff) router.push("/");
        else if (e.key === "w") router.push("/my-work");
        else if (e.key === "p") router.push("/projects");
        return;
      }
      if (e.key === "g") go = Date.now();
      else if (canEdit && isAdmin && e.key === "n") router.push("/documents/new?type=invoice");
      else if (canEdit && e.key === "q") router.push("/documents/new?type=quote");
      else if (canEdit && e.key === "p") router.push("/projects/new");
      else if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>("input[name=q]");
        if (search) {
          e.preventDefault();
          search.focus();
        } else if (isStaff) {
          e.preventDefault();
          router.push("/documents?focus=1");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, canEdit, isStaff, isAdmin]);
  return null;
}
