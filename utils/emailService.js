// utils/emailService.js (ESM)
import nodemailer from "nodemailer";

/**
 * Creates a nodemailer transporter if EMAIL_USER/EMAIL_PASS exist.
 * Gmail typically requires an App Password (not the normal account password).
 */
export function createMailTransporterIfConfigured(env = process.env) {
  const EMAIL_USER = env.EMAIL_USER;
  const EMAIL_PASS = env.EMAIL_PASS;
  if (!EMAIL_USER || !EMAIL_PASS) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
}

export function pickPaymentDebugFields(p) {
  const safeKeys = [
    "oid",
    "OrderId",
    "TransId",
    "transId",
    "Response",
    "ProcReturnCode",
    "mdStatus",
    "ErrMsg",
    "errmsg",
    "ErrorMsg",
    "msg",
    "AuthCode",
    "HostRefNum",
    "clientid",
    "amount",
    "currency",
    "rnd",
    "hash",
    "HASH",
    "HASHPARAMS",
    "HASHPARAMSVAL",
    "HASHALG",
  ];
  const out = {};
  for (const k of safeKeys) {
    if (p?.[k] != null && String(p[k]).length) out[k] = p[k];
  }
  return out;
}

/**
 * Sends a short email to admin about payment callback.
 * - Never throws (swallows errors); should not break redirects.
 */
export async function notifyPaymentByEmail({
  kind,
  payload,
  redirectTarget,
  env = process.env,
  mailer,
  to,
}) {
  const EMAIL_USER = env.EMAIL_USER;
  const ADMIN_EMAIL_TO = to || env.ADMIN_EMAIL_TO || EMAIL_USER;

  const transporter = mailer || createMailTransporterIfConfigured(env);
  if (!transporter) {
    console.warn("[payments/email] Skipped: EMAIL_USER/EMAIL_PASS not configured");
    return;
  }
  if (!ADMIN_EMAIL_TO) {
    console.warn("[payments/email] Skipped: ADMIN_EMAIL_TO not configured");
    return;
  }

  const debug = pickPaymentDebugFields(payload);
  const oid = debug.oid || debug.OrderId || "";
  const proc = debug.ProcReturnCode || "";
  const md = debug.mdStatus || "";

  const subject = `[HolidayVillas] Payment ${kind}${oid ? ` (oid: ${oid})` : ""}`;
  const text =
    `Payment callback received (${kind})\n` +
    `Time: ${new Date().toISOString()}\n` +
    (redirectTarget ? `Redirect: ${redirectTarget}\n` : "") +
    (proc ? `ProcReturnCode: ${proc}\n` : "") +
    (md ? `mdStatus: ${md}\n` : "") +
    `\nSafe fields:\n${JSON.stringify(debug, null, 2)}\n`;

  try {
    const info = await transporter.sendMail({
      from: EMAIL_USER,
      to: ADMIN_EMAIL_TO,
      subject,
      text,
    });
    console.log("[payments/email] sent", { messageId: info.messageId, kind, oid });
  } catch (err) {
    console.error("[payments/email] failed", err);
  }
}
