import "server-only";

import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type OutboxRow = {
  id: string;
  to_email: string;
  subject: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailHtml(payload: Record<string, unknown>) {
  const name = escapeHtml(payload.name || "Operations team member");
  const title = escapeHtml(payload.title || "Operations update");
  const body = escapeHtml(payload.body || "There is a new update in Amazing Operations.");
  const appUrl = escapeHtml(process.env.NEXT_PUBLIC_APP_URL || "https://amazing-operations-dashboard.vercel.app");
  return `<!doctype html><html><body style="margin:0;background:#f4f5f6;font-family:Arial,sans-serif;color:#020617"><div style="max-width:620px;margin:32px auto;background:#fff;border-radius:24px;padding:36px"><img src="${appUrl}/assets/logo-wordmark.svg" width="210" alt="Amazing Operations"><p style="color:#0bacf0;font-weight:700;margin-top:34px">Operations update</p><h1 style="font-size:28px;margin:8px 0 16px">${title}</h1><p style="line-height:1.6">Hi ${name},</p><p style="line-height:1.6">${body}</p><a href="${appUrl}" style="display:inline-block;margin-top:18px;background:#0bacf0;color:#fff;text-decoration:none;padding:14px 24px;border-radius:999px">Open Operations</a><p style="margin-top:36px;color:#64748b;font-size:13px">Amazing Tiles Operations</p></div></body></html>`;
}

export async function processEmailOutbox(batchSize = 20) {
  const admin = createSupabaseAdminClient();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OPERATIONS_EMAIL_FROM;
  if (!admin || !apiKey || !from) return { processed: 0, skipped: true };
  const resend = new Resend(apiKey);
  const { data, error } = await admin.rpc("claim_email_outbox", { batch_size: batchSize });
  if (error) throw new Error(`Could not claim email outbox: ${error.message}`);
  const rows = (data ?? []) as OutboxRow[];
  let processed = 0;
  for (const row of rows) {
    try {
      const result = await resend.emails.send({
        from,
        to: row.to_email,
        subject: row.subject,
        html: emailHtml(row.payload ?? {}),
      }, { idempotencyKey: row.idempotency_key });
      if (result.error) throw new Error(result.error.message);
      const { error: finishError } = await admin.rpc("finish_email_outbox", { outbox_id: row.id, delivery_succeeded: true, message_id: result.data?.id ?? null, failure_message: null });
      if (finishError) throw new Error(`Could not finish email outbox item: ${finishError.message}`);
      processed += 1;
    } catch (deliveryError) {
      const { error: finishError } = await admin.rpc("finish_email_outbox", {
        outbox_id: row.id,
        delivery_succeeded: false,
        message_id: null,
        failure_message: deliveryError instanceof Error ? deliveryError.message : "Unknown delivery error",
      });
      if (finishError) throw new Error(`Could not record email delivery failure: ${finishError.message}`);
    }
  }
  return { processed, skipped: false };
}
