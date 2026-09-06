import "server-only";

import { createHash } from "node:crypto";
import { Resend } from "resend";

type StaffAccessType = "invite" | "recovery";

type StaffAccessEmailInput = {
  email: string;
  name: string;
  redirectTo: string;
  staffId: string;
  tokenHash: string;
  type: StaffAccessType;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function staffAccessUrl(redirectTo: string, tokenHash: string, type: StaffAccessType) {
  const url = new URL(redirectTo);
  url.pathname = "/auth/update-password";
  url.search = "";
  url.hash = "";
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

function staffAccessEmailHtml(name: string, actionUrl: string) {
  const safeName = escapeHtml(name);
  const safeActionUrl = escapeHtml(actionUrl);
  const logoUrl = "https://amazing-operations-dashboard.vercel.app/assets/amazing-operations-email-logo.png";

  return `<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Set up your Amazing Operations account</title></head>
<body style="margin:0;padding:0;background:#f3f6f9;color:#0b1324;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Choose a secure password for your Amazing Operations account.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f6f9;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dfe7ef;border-radius:20px;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,.08);">
        <tr><td style="height:6px;background:#00aef3;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 36px;background:#071126;"><img src="${logoUrl}" width="162" height="44" alt="Amazing Operations" style="display:block;width:162px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;"></td></tr>
        <tr><td style="padding:40px 36px 34px;">
          <div style="margin:0 0 13px;color:#008fcb;font-size:12px;font-weight:700;letter-spacing:1.5px;">TEAM ACCOUNT ACCESS</div>
          <h1 style="margin:0 0 18px;color:#071126;font-size:30px;line-height:38px;letter-spacing:-.5px;">Create your account</h1>
          <p style="margin:0 0 14px;color:#334155;font-size:16px;line-height:25px;">Hi ${safeName},</p>
          <p style="margin:0 0 28px;color:#334155;font-size:16px;line-height:25px;">Choose a secure password to access your assigned tasks, warehouse details, documents and team updates.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td align="center" style="border-radius:10px;background:#00aef3;"><a href="${safeActionUrl}" style="display:inline-block;padding:14px 24px;color:#071126;font-size:16px;font-weight:700;line-height:20px;text-decoration:none;">Create my account</a></td></tr></table>
          <p style="margin:0 0 7px;color:#64748b;font-size:13px;line-height:20px;">If the button does not work, copy and paste this secure link:</p>
          <p style="margin:0;word-break:break-all;font-size:13px;line-height:20px;"><a href="${safeActionUrl}" style="color:#007faf;text-decoration:underline;">${safeActionUrl}</a></p>
        </td></tr>
        <tr><td style="padding:22px 36px;background:#f8fafc;border-top:1px solid #e5ebf1;"><p style="margin:0 0 8px;color:#475569;font-size:13px;line-height:20px;">If you were not expecting this email, you can safely ignore it. For help, contact your manager.</p><p style="margin:0;color:#64748b;font-size:12px;line-height:18px;">Amazing Operations · Warehouse operations, moving smoothly.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendStaffAccessEmail(input: StaffAccessEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OPERATIONS_EMAIL_FROM;
  if (!apiKey || !from) return { ok: false as const, error: "Branded email delivery is not configured." };

  const actionUrl = staffAccessUrl(input.redirectTo, input.tokenHash, input.type);
  const tokenKey = createHash("sha256").update(input.tokenHash).digest("hex").slice(0, 32);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: input.email,
    subject: "Set up your Amazing Operations account",
    html: staffAccessEmailHtml(input.name, actionUrl),
  }, { idempotencyKey: `staff-access/${input.type}/${input.staffId}/${tokenKey}` });

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, messageId: data?.id ?? null };
}
