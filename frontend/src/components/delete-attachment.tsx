"use client";

import { useId, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function DeleteAttachment({
  groupId,
  attachment,
  onDeleted,
}: {
  groupId: string;
  attachment: { id: string; fileName: string };
  onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await api(
        `/groups/${groupId}/attachments/${attachment.id}`,
        undefined,
        crypto.randomUUID(),
        "DELETE",
      );
      dialog.current?.close();
      onDeleted();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to delete attachment. Please try again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
      >
        Delete
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          if (busy.current) event.preventDefault();
        }}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40 backdrop:backdrop-blur-sm"
      >
        <div className="space-y-4 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-700">
            <Trash2 size={21} aria-hidden="true" />
          </div>
          <h2 id={titleId} className="text-xl font-semibold">
            Delete attachment?
          </h2>
          <div id={descriptionId} className="space-y-3 text-sm text-stone-600">
            <p className="break-words rounded-lg bg-stone-50 px-3 py-2 font-medium text-stone-900">
              {attachment.fileName}
            </p>
            <p>
              This removes the file from this record. The expense and member
              balances will stay the same.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-4">
            <Button
              autoFocus
              variant="outline"
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-700 text-white hover:bg-red-800"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending ? "Deleting…" : "Delete attachment"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
