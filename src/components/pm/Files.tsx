"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addLink, deleteFile, fileUrl, registerUpload } from "@/app/actions/projects";
import { btn } from "@/components/ui";
import { formatInvoiceDate } from "@/lib/money";
import { formatBytes, type FileRow } from "@/lib/pm";
import { createClient } from "@/lib/supabase/client";

const MAX = 50 * 1024 * 1024; // Supabase free-tier per-file limit
const SHRINK_OVER = 2.5 * 1024 * 1024;

/** Big photos are re-encoded to WebP (max 3000px) so the 1 GB free storage lasts. */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= SHRINK_OVER) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

export function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-80) || "file";
}

export function Files({ projectId, taskId = null, files, canWork, compact }: { projectId: string; taskId?: string | null; files: FileRow[]; canWork: boolean; compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState({ name: "", url: "" });
  const [showLink, setShowLink] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [, start] = useTransition();

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setMsg("");
    const supabase = createClient();
    for (const original of Array.from(list)) {
      setBusy(`Preparing ${original.name}…`);
      const file = await shrinkImage(original);
      if (file.size > MAX) {
        setMsg(`${original.name} is over 50 MB. Upload it to Google Drive and add the link instead.`);
        continue;
      }
      setBusy(`Uploading ${file.name}…`);
      const path = `projects/${projectId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from("files").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) {
        setMsg(`${file.name}: ${error.message}`);
        continue;
      }
      const r = await registerUpload({ project_id: projectId, task_id: taskId, storage_path: path, name: file.name, size: file.size, mime: file.type });
      if (!r.ok) setMsg(r.message);
    }
    setBusy("");
    if (input.current) input.current.value = "";
    router.refresh();
  };

  const open = (id: string) =>
    start(async () => {
      const r = await fileUrl(id);
      if (r.ok) window.open(r.url, "_blank", "noopener");
      else setMsg(r.message);
    });

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteFile(id);
      if (!r.ok) setMsg(r.message);
      router.refresh();
    });

  const saveLink = () =>
    start(async () => {
      const r = await addLink({ project_id: projectId, task_id: taskId, name: link.name || link.url, url: link.url });
      if (!r.ok) return setMsg(r.message);
      setLink({ name: "", url: "" });
      setShowLink(false);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {canWork && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
          className={`rounded-xl border border-dashed border-neutral-300 text-center text-sm text-neutral-500 ${compact ? "p-3" : "p-6"}`}
        >
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          {busy || (
            <>
              Drop files here or{" "}
              <button type="button" className="font-medium text-navy underline" onClick={() => input.current?.click()}>
                choose
              </button>{" "}
              · or{" "}
              <button type="button" className="font-medium text-navy underline" onClick={() => setShowLink(!showLink)}>
                add a Drive link
              </button>
              <div className="mt-1 text-xs text-neutral-400">Up to 50 MB each. Big photos are shrunk to WebP. Keep raws and PSDs on Google Drive and link them.</div>
            </>
          )}
        </div>
      )}
      {showLink && (
        <div className="flex flex-wrap gap-2">
          <input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://drive.google.com/…" aria-label="Link" className="min-w-56 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
          <input value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} placeholder="Name (optional)" aria-label="Link name" className="w-48 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
          <button className={btn.primary} onClick={saveLink} disabled={!link.url}>
            Add link
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-red-700" role="alert">{msg}</p>}
      {files.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-xl ring-1 ring-black/5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-12 shrink-0 rounded bg-neutral-100 py-0.5 text-center text-[10px] font-semibold text-neutral-600 uppercase">{f.kind === "link" ? "link" : (f.name.split(".").pop() ?? "file").slice(0, 4)}</span>
              <button onClick={() => open(f.id)} className="min-w-0 flex-1 truncate text-left hover:text-navy">
                {f.name}
              </button>
              {!compact && <span className="hidden text-xs text-neutral-500 sm:inline">{f.uploaded_by.split("@")[0]} · {formatInvoiceDate(f.created_at.slice(0, 10))}</span>}
              <span className="w-16 text-right text-xs text-neutral-500">{f.kind === "upload" ? formatBytes(f.size) : ""}</span>
              {canWork && (
                <button
                  onClick={() => (confirm === f.id ? remove(f.id) : setConfirm(f.id))}
                  onBlur={() => setConfirm("")}
                  className={btn.danger}
                  aria-label={confirm === f.id ? `Confirm delete ${f.name}` : `Delete ${f.name}`}
                >
                  {confirm === f.id ? "Sure?" : "Delete"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !canWork && <p className="text-sm text-neutral-500">No files yet.</p>
      )}
    </div>
  );
}
