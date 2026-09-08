"use client";
import { useRef, useState } from "react";
import { api, ApiError, type Preview } from "./api";
import type { FinancialCommand } from "./financial";

/** Keep the exact command and retry key until the server resolves a write. */
export function useFinancialOperation(groupId: string) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [committed, setCommitted] = useState(false);
  const busy = useRef(false);
  const attempt = useRef<{
    command: FinancialCommand;
    previewId: string;
    key: string;
  } | null>(null);
  function reset() {
    if (busy.current || uncertain || committed) return;
    attempt.current = null;
    setPreview(null);
    setError("");
  }
  async function prepare(command: FinancialCommand) {
    if (busy.current || uncertain || committed) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await api<Preview>(`/groups/${groupId}/preview`, command);
      attempt.current = {
        command,
        previewId: result.previewId,
        key: crypto.randomUUID(),
      };
      setPreview(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to preview this change.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function confirm() {
    if (busy.current || !attempt.current || committed) return false;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const { command, previewId, key } = attempt.current;
      await api(`/groups/${groupId}/entries`, { command, previewId }, key);
      setUncertain(false);
      setCommitted(true);
      return true;
    } catch (e) {
      // 4xx is a definitive rejection. On transport/server errors retry the same write.
      const rejected =
        e instanceof ApiError && e.status >= 400 && e.status < 500;
      setUncertain(!rejected);
      if (rejected) {
        setPreview(null);
        attempt.current = null;
      }
      setError(
        rejected
          ? e.message
          : "The result could not be confirmed. Retry confirmation to safely check the same operation.",
      );
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return {
    preview,
    error,
    pending,
    uncertain,
    committed,
    reset,
    prepare,
    confirm,
  };
}
