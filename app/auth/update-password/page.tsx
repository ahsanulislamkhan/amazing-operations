"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePasswordAction } from "@/app/actions/auth";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirm") ?? "")) {
      setError("The passwords do not match.");
      return;
    }
    setPending(true);
    const result = await updatePasswordAction(password);
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    router.replace("/");
    router.refresh();
  }
  return (
    <main className="auth-flow-shell">
      <form className="auth-flow-card" onSubmit={submit}>
        <img src="/assets/logo-wordmark.svg" alt="Amazing Operations" />
        <p className="login-eyebrow">Team invitation</p>
        <h1>Create your account</h1>
        <p>Choose a password to finish setting up your Amazing Operations account.</p>
        <label className="login-field"><span>New password</span><input name="password" type="password" minLength={10} autoComplete="new-password" required /></label>
        <label className="login-field"><span>Confirm password</span><input name="confirm" type="password" minLength={10} autoComplete="new-password" required /></label>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <button className="login-submit" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      </form>
    </main>
  );
}
