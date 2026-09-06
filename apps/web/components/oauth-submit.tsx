"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function OAuthSubmit({ children, className = "auth-provider" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending} aria-busy={pending}>
    {pending ? <span role="status">正在连接…</span> : children}
  </button>;
}
