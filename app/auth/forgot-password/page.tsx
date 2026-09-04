"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { requestPasswordResetAction } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    const result = await requestPasswordResetAction(email);
    setPending(false);
    setMessage(result.ok ? "If that account exists, a secure reset link is on its way." : result.error);
  }
  return (
    <main className="auth-flow-shell">
      <form className="auth-flow-card" onSubmit={submit}>
        <img src="/assets/logo-wordmark.svg" alt="Amazing Operations" />
        <p className="login-eyebrow">Account recovery</p>
        <h1>Reset your password</h1>
        <p>Enter your work email and we’ll send a secure reset link.</p>
        <label className="login-field"><span>Work E-mail</span><input name="email" type="email" autoComplete="email" required /></label>
        {message ? <p className="auth-flow-message" role="status">{message}</p> : null}
        <button className="login-submit" type="submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
        <Link href="/">Back to sign in</Link>
      </form>
    </main>
  );
}
