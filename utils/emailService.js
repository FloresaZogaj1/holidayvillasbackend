// utils/emailService.js (ESM)
import nodemailer from "nodemailer";
import { Resend } from "resend";

/**
 * Creates a nodemailer transporter if EMAIL_USER/EMAIL_PASS exist.
 * Gmail typically requires an App Password (not the normal account password).
 */
export function createMailTransporterIfConfigured(env = process.env) {
  // Safety: on many hosting providers (including Render), outbound SMTP to Gmail
  // is blocked or times out. Default to disabling SMTP in production.
  const allowSmtp = String(env.ALLOW_SMTP || "").toLowerCase() === "true";
  const nodeEnv = env.NODE_ENV || "";
  if (!allowSmtp && nodeEnv === "production") return null;

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

function getResendIfConfigured(env = process.env) {
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function getResendFrom(env = process.env) {
  // Must be a verified sender in Resend. You can start with Resend's default domain,
  // but in production you should use your own verified domain.
  return env.RESEND_FROM || "onboarding@resend.dev";
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

function formatAttemptDetails(attempt) {
  if (!attempt) return "";
  const meta = attempt?.meta;
  if (!meta || typeof meta !== "object") return "";

  const customer = meta.customer || {};
  const pricing = meta.pricing || {};

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  const lines = [];
  lines.push("Reservation details (from website meta):");
  if (meta.villaName || meta.villa) lines.push(`- Villa: ${meta.villaName || meta.villa}`);
  if (meta.category) lines.push(`- Category: ${meta.category}`);
  if (name) lines.push(`- Guest name: ${name}`);
  if (customer.email) lines.push(`- Guest email: ${customer.email}`);
  if (customer.phone) lines.push(`- Guest phone: ${customer.phone}`);
  if (meta.from) lines.push(`- Check-in: ${meta.from}`);
  if (meta.to) lines.push(`- Check-out: ${meta.to}`);
  if (meta.nights != null) lines.push(`- Nights: ${meta.nights}`);
  if (meta.guests != null) lines.push(`- Guests: ${meta.guests}`);
  if (pricing.totalPrice != null) lines.push(`- Total: ${pricing.totalPrice} ${pricing.currency || ""}`.trim());
  if (pricing.basePerNight != null) lines.push(`- Base per night: ${pricing.basePerNight}`);
  if (pricing.lodgingPerNight != null) lines.push(`- Lodging per night: ${pricing.lodgingPerNight}`);
  if (pricing.breakfastIncluded != null) lines.push(`- Breakfast included: ${pricing.breakfastIncluded ? "yes" : "no"}`);

  return `\n\n${lines.join("\n")}\n`;
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
  const ADMIN_EMAIL_TO = to || env.ADMIN_EMAIL_TO || env.EMAIL_USER;

  const resend = getResendIfConfigured(env);
  const transporter = mailer || createMailTransporterIfConfigured(env);

  const chosenProvider = resend ? "resend" : transporter ? "smtp" : "none";
  console.log("[payments/email] provider selected", {
    provider: chosenProvider,
    hasResendKey: !!env.RESEND_API_KEY,
    hasAdminTo: !!ADMIN_EMAIL_TO,
    nodeEnv: env.NODE_ENV || null,
    allowSmtp: String(env.ALLOW_SMTP || "").toLowerCase() === "true",
  });

  if (!resend && !transporter) {
    console.warn(
      "[payments/email] Skipped: configure RESEND_API_KEY (preferred) or EMAIL_USER/EMAIL_PASS"
    );
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
    formatAttemptDetails(payload?.attempt) +
    `\nSafe fields:\n${JSON.stringify(debug, null, 2)}\n`;

  try {
    if (resend) {
      const from = getResendFrom(env);
      console.log("[payments/email] using provider=resend", {
        to: ADMIN_EMAIL_TO,
        from,
        kind,
        oid,
      });

      const result = await resend.emails.send({
        from,
        to: ADMIN_EMAIL_TO,
        subject,
        text,
      });

      // Resend returns { id } on success, or throws on error.
      console.log("[payments/email] sent (resend)", { id: result?.id, kind, oid });
      return;
    }

    // Fallback SMTP (Gmail)
    console.log("[payments/email] using provider=smtp", {
      to: ADMIN_EMAIL_TO,
      from: env.EMAIL_USER,
      kind,
      oid,
    });
    const info = await transporter.sendMail({
      from: env.EMAIL_USER,
      to: ADMIN_EMAIL_TO,
      subject,
      text,
    });
    console.log("[payments/email] sent (smtp)", { messageId: info.messageId, kind, oid });
  } catch (err) {
    // Resend throws rich errors; log the object so we see status/code.
    console.error("[payments/email] failed", err);
  }
}
