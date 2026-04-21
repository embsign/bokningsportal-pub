// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { Env, D1Database } from "./types.js";
import { verifyTurnstileToken } from "./turnstileVerify.js";
import {
  enforceRfidAbusePolicy,
  isRfidUnderAttack,
  recordRfidAuthFailure,
  recordRfidAuthSuccess,
} from "./rfidAuthAbuse.js";
import {
  type TenantEtagSource,
  withTenantConditionalBody,
  withTenantConditionalJson,
} from "./tenantEtag.js";
import { deleteUserBookings, userHasBookings } from "./utils/users.js";
import { cancelFutureBookings, hasFutureBookings } from "./utils/bookingObjects.js";
import { createAccessGroup, listAccessGroups } from "./utils/accessGroups.js";
import { batchGetScreenLastSeen, recordScreenLastSeen } from "./screenPresence.js";
import { buildKioskScreenInstructions } from "./kioskInstructions.js";
import { getScreenByTokenPollCached, invalidateKioskPollAuthCache } from "./kioskPollAuthCacheClient.js";

const json = (data: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers || undefined);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
};

const errorResponse = (status: number, detail: string) => json({ detail }, { status });

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** HTML-mejl i samma palett som frontend/styles.css (Inter, #101c33, #45d3e4, CTA-knapp #f59e0b som --warning). */
const buildBrfSetupInviteHtml = (setupUrl: string, associationName: string) => {
  const safeUrl = escapeHtml(setupUrl);
  const safeName = escapeHtml(associationName);
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Slutför er bokningssida</title>
</head>
<body style="margin:0;padding:0;background:#f4f8fb;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f8fb;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:18px;box-shadow:0 16px 40px rgba(16,28,51,0.12);border:1px solid #45d3e4;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;letter-spacing:0.02em;color:#45d3e4;text-transform:uppercase;">BRF Bokningsportal</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#101c33;">Slutför er bokningssida</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px 28px;">
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;color:#1c3154;">Hej!</p>
              <p style="margin:0 0 20px 0;font-size:16px;line-height:1.55;color:#1c3154;">Ni har påbörjat registrering för <strong style="color:#101c33;">${safeName}</strong>. Klicka på knappen nedan för att fortsätta setup och aktivera ert bokningssystem.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:12px;background:#f59e0b;">
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#101c33;text-decoration:none;border-radius:12px;">Slutför setup</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;color:#1c3154;">Fungerar inte knappen? Kopiera länken nedan och klistra in i webbläsaren.</p>
              <p style="margin:0;padding:14px 16px;background:#f4f8fb;border-radius:10px;border:1px solid rgba(69,211,228,0.45);font-size:13px;line-height:1.45;color:#101c33;word-break:break-all;font-family:ui-monospace,monospace;">${safeUrl}</p>
              <p style="margin:20px 0 0 0;font-size:13px;line-height:1.5;color:#1c3154;">Med vänliga hälsningar<br /><span style="color:#101c33;font-weight:600;">BRF Bokningsportal</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const buildAdminSetupCompleteEmailHtml = (adminUrl: string) => {
  const safeUrl = escapeHtml(adminUrl);
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin-länk till er bokningsportal</title>
</head>
<body style="margin:0;padding:0;background:#f4f8fb;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f8fb;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:18px;box-shadow:0 16px 40px rgba(16,28,51,0.12);border:1px solid #45d3e4;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;letter-spacing:0.02em;color:#45d3e4;text-transform:uppercase;">BRF Bokningsportal</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#101c33;">Er admin-länk</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px 28px;">
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;color:#1c3154;">Setup är nu klar. Klicka på knappen nedan för att öppna administrationsläget.</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#b91c1c;"><strong>Viktigt:</strong> Länken fungerar som ett lösenord och ger full åtkomst. Spara den säkert och dela den inte i onödan.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:12px;background:#f59e0b;">
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#101c33;text-decoration:none;border-radius:12px;">Öppna admin</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;color:#1c3154;">Fungerar inte knappen? Kopiera länken nedan.</p>
              <p style="margin:0;padding:14px 16px;background:#f4f8fb;border-radius:10px;border:1px solid rgba(69,211,228,0.45);font-size:13px;line-height:1.45;color:#101c33;word-break:break-all;font-family:ui-monospace,monospace;">${safeUrl}</p>
              <p style="margin:20px 0 0 0;font-size:13px;line-height:1.5;color:#1c3154;">Med vänliga hälsningar<br /><span style="color:#101c33;font-weight:600;">BRF Bokningsportal</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatDateTimeMinutes = (date: Date) => `${formatDate(date)} ${date.toISOString().slice(11, 16)}`;

const parseDate = (value: string) => {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
};

const escapeIcsText = (value: string) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const toIcsUtcDateTime = (isoValue: string) => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

const toIcsStampNow = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const buildBookingIcs = (booking: {
  id: string;
  startTime: string;
  endTime: string;
  serviceName: string;
  apartmentId: string;
}) => {
  const dtStart = toIcsUtcDateTime(booking.startTime);
  const dtEnd = toIcsUtcDateTime(booking.endTime);
  if (!dtStart || !dtEnd) {
    return null;
  }
  const uid = `${booking.id}@brf-bokningsportal`;
  const summary = `Bokning: ${booking.serviceName}`;
  const description = `Lägenhet ${booking.apartmentId}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BRF Bokningsportal//SE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsStampNow()}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
};

const isValidClockTime = (value: string | null | undefined) => Boolean(value && /^\d{2}:\d{2}$/.test(value));

const normalizeClockTime = (value: string | null | undefined, fallback = "12:00") =>
  isValidClockTime(value) ? (value as string) : fallback;

const getMinutesFromClockTime = (value: string) => {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
};

const getUtcNowFromEnv = (env: Env) => {
  const forced = env.FORCE_NOW_UTC;
  if (!forced) {
    return new Date();
  }
  const parsed = new Date(forced);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const getTimestampIso = (env: Env) => getUtcNowFromEnv(env).toISOString();

const getWindowBoundaries = (bookingObject: any, nowUtc: Date) => {
  const minDate = new Date(nowUtc);
  minDate.setUTCDate(minDate.getUTCDate() + (bookingObject.window_min_days as number));
  const maxDate = new Date(nowUtc);
  maxDate.setUTCDate(maxDate.getUTCDate() + (bookingObject.window_max_days as number));
  return {
    minMs: minDate.getTime(),
    maxMs: maxDate.getTime(),
  };
};

const getNextAvailableStart = (bookingObject: any, nowUtc: Date) => {
  const windowMinDays = Number(bookingObject.window_min_days || 0);
  const candidateDate = new Date(
    Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(), 0, 0, 0)
  );
  candidateDate.setUTCDate(candidateDate.getUTCDate() + windowMinDays);

  if (bookingObject.booking_type === "full-day") {
    return buildFullDayRange(candidateDate, bookingObject).start;
  }

  const parsedSlotMinutes = Number(bookingObject.slot_duration_minutes);
  const slotMinutes = Number.isFinite(parsedSlotMinutes) && parsedSlotMinutes > 0 ? parsedSlotMinutes : 60;
  const slotWindow = getTimeSlotWindowConfig(bookingObject);
  for (
    let minuteOffset = slotWindow.startMinutes;
    minuteOffset + slotMinutes <= slotWindow.endMinutes;
    minuteOffset += slotMinutes
  ) {
    const start = new Date(
      Date.UTC(
        candidateDate.getUTCFullYear(),
        candidateDate.getUTCMonth(),
        candidateDate.getUTCDate(),
        0,
        0,
        0
      )
    );
    start.setUTCMinutes(minuteOffset);
    if (start.getTime() >= nowUtc.getTime()) {
      return start;
    }
  }

  const nextDay = new Date(candidateDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayStart = new Date(
    Date.UTC(nextDay.getUTCFullYear(), nextDay.getUTCMonth(), nextDay.getUTCDate(), 0, 0, 0)
  );
  nextDayStart.setUTCMinutes(slotWindow.startMinutes);
  return nextDayStart;
};

const maybeDelayAvailability = async (env: Env) => {
  const raw = env.DEBUG_AVAILABILITY_DELAY_MS;
  const delayMs = Number(raw);
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 8000)));
};

const getFullDayTimeConfig = (bookingObject: any) => {
  const startTime = normalizeClockTime(bookingObject?.full_day_start_time);
  const endTime = normalizeClockTime(bookingObject?.full_day_end_time);
  return {
    startTime,
    endTime,
    startMinutes: getMinutesFromClockTime(startTime),
    endMinutes: getMinutesFromClockTime(endTime),
  };
};

const getTimeSlotWindowConfig = (bookingObject: any) => {
  const startTime = normalizeClockTime(bookingObject?.time_slot_start_time, "08:00");
  const endTime = normalizeClockTime(bookingObject?.time_slot_end_time, "20:00");
  return {
    startTime,
    endTime,
    startMinutes: getMinutesFromClockTime(startTime),
    endMinutes: getMinutesFromClockTime(endTime),
  };
};

const validateAdminBookingObjectBody = (body: any): string | null => {
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return "invalid_booking_object_name";
  }
  const windowMin = Number(body?.window_min_days ?? 0);
  const windowMax = Number(body?.window_max_days ?? 0);
  if (Number.isFinite(windowMin) && Number.isFinite(windowMax) && windowMin > windowMax) {
    return "invalid_booking_window";
  }
  if (body?.booking_type === "time-slot") {
    const startTime = normalizeClockTime(body?.time_slot_start_time, "08:00");
    const endTime = normalizeClockTime(body?.time_slot_end_time, "20:00");
    const sm = getMinutesFromClockTime(startTime);
    const em = getMinutesFromClockTime(endTime);
    if (em <= sm) {
      return "invalid_time_slot_window";
    }
    const parsedSlot = Number(body?.slot_duration_minutes);
    const slotM = Number.isFinite(parsedSlot) && parsedSlot > 0 ? parsedSlot : 60;
    if (em - sm < slotM) {
      return "invalid_time_slot_duration";
    }
  }
  return null;
};

const buildFullDayRange = (date: Date, bookingObject: any) => {
  const config = getFullDayTimeConfig(bookingObject);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
  start.setUTCMinutes(config.startMinutes);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
  end.setUTCMinutes(config.endMinutes);
  if (config.endMinutes <= config.startMinutes) {
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return { start, end, ...config };
};

const getJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const parseRequiredPositiveInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const parseBearerToken = (value: string | null) => {
  if (!value) return null;
  const [type, token] = value.split(" ");
  if (!type || !token) return null;
  if (type.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
};

const PAIRING_CODE_REGEX = /^[A-Z0-9]{6}$/;
const PAIRING_CODE_TTL_MINUTES = 30;
const ORDER_EMAIL_TO = "info@embsign.se";

const normalizePairingCode = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const isValidPairingCode = (value: string) => PAIRING_CODE_REGEX.test(value);

const getScreenByToken = async (db: D1Database, token: string) =>
  (await db
    .prepare(
      `SELECT bs.*, t.name AS tenant_name, t.last_changed_at AS tenant_last_changed_at
       FROM booking_screens bs
       JOIN tenants t ON t.id = bs.tenant_id
       WHERE bs.screen_token = ?
         AND bs.is_active = 1
       LIMIT 1`
    )
    .bind(token)
    .first()) as any;

const getPairingExpiryIso = () => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + PAIRING_CODE_TTL_MINUTES);
  return expiry.toISOString();
};

const base64UrlEncode = (input: string) => {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const base64UrlDecode = (input: string) => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const sha1Hex = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const getAppConfig = async (db: D1Database, key: string) =>
  (await db.prepare("SELECT value FROM app_config WHERE key = ?").bind(key).first()) as any;

const getSetupSalt = async (db: D1Database) => {
  const row = await getAppConfig(db, "setup_link_salt");
  return row?.value ? String(row.value) : "";
};

const sendResendEmail = async (env: Env, to: string, subject: string, html: string) => {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    const missing: string[] = [];
    if (!env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (!env.MAIL_FROM) missing.push("MAIL_FROM");
    return { ok: false, error: "missing_email_config", missing };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [to],
        subject,
        html,
      }),
    });
    if (!response.ok) {
      return { ok: false, error: "resend_failed", status: response.status };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "resend_unavailable" };
  }
};

const getAuthContext = async (db: D1Database, token: string) =>
  (await db
    .prepare(
      `SELECT
         at.token AS access_token,
         at.tenant_id AS tenant_id,
         t.name AS tenant_name,
         t.is_setup_complete AS tenant_is_setup_complete,
         t.last_changed_at AS tenant_last_changed_at,
         u.id AS user_id,
         u.apartment_id AS user_apartment_id,
         u.house AS user_house,
         u.is_admin AS user_is_admin,
         u.is_active AS user_is_active
       FROM access_tokens at
       JOIN tenants t ON t.id = at.tenant_id
       JOIN users u ON u.id = at.user_id
       WHERE at.token = ?`
    )
    .bind(token)
    .first()) as any;

const requireAuth = async (request: Request, env: Env) => {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { error: errorResponse(401, "unauthorized") };
  }
  const context = await getAuthContext(env.DB, token);
  if (context) {
    const tenant = {
      id: context.tenant_id,
      name: context.tenant_name,
      is_setup_complete: context.tenant_is_setup_complete,
      last_changed_at: String(context.tenant_last_changed_at ?? ""),
    };
    const user = {
      id: context.user_id,
      apartment_id: context.user_apartment_id,
      is_admin: context.user_is_admin,
      is_account_owner: 0,
      tenant_id: tenant.id,
      house: context.user_house,
      is_active: context.user_is_active,
    };
    if (!user.is_active) {
      return { error: errorResponse(401, "unauthorized") };
    }
    return { user, tenant };
  }

  const tenant = await env.DB.prepare("SELECT * FROM tenants WHERE account_owner_token = ?")
    .bind(token)
    .first();
  if (!tenant) {
    return { error: errorResponse(401, "unauthorized") };
  }
  return {
    tenant: {
      id: tenant.id as string,
      name: tenant.name as string,
      is_setup_complete: tenant.is_setup_complete,
      admin_email: ((tenant as any).admin_email as string | null | undefined) ?? null,
      last_changed_at: String((tenant as any).last_changed_at ?? ""),
    },
    user: {
      id: "account-owner",
      apartment_id: "admin",
      is_admin: 1,
      is_account_owner: 1,
      tenant_id: tenant.id as string,
      house: null,
      is_active: 1,
    },
  };
};

const handleBrfRegister = async (request: Request, env: Env) => {
  const body = await getJsonBody(request);
  const associationName = body?.association_name?.trim();
  const email = body?.email?.trim();
  const turnstileToken = body?.turnstile_token?.trim();
  const frontendBaseUrl = body?.frontend_base_url?.trim();
  if (!associationName || !email || !turnstileToken) {
    return errorResponse(400, "invalid_payload");
  }
  const turnstile = await verifyTurnstileToken(request, env, turnstileToken);
  if (!turnstile.ok) {
    const details: string =
      turnstile.error === "turnstile_invalid" && "codes" in turnstile && turnstile.codes?.length
        ? `turnstile_invalid:${turnstile.codes.join(",")}`
        : turnstile.error || "turnstile_invalid";
    if (turnstile.error === "turnstile_invalid") {
      return errorResponse(400, details);
    }
    if (turnstile.error === "missing_turnstile_secret") {
      return errorResponse(500, details);
    }
    return errorResponse(503, details);
  }

  const setupSalt = await getSetupSalt(env.DB);
  if (!setupSalt) {
    return errorResponse(500, "missing_setup_salt");
  }

  const uuid = crypto.randomUUID();
  const hash = await sha1Hex(`${associationName}|${email}|${uuid}|${setupSalt}`);
  const payload = base64UrlEncode(
    JSON.stringify({
      association_name: associationName,
      email,
      uuid,
      sha1: hash,
    })
  );
  const requestUrl = new URL(request.url);
  const baseUrlCandidate = frontendBaseUrl || env.FRONTEND_BASE_URL || requestUrl.origin;
  let setupBaseUrl: string;
  try {
    const parsed = new URL(baseUrlCandidate);
    setupBaseUrl = parsed.origin;
  } catch {
    setupBaseUrl = requestUrl.origin;
  }
  const setupUrl = `${setupBaseUrl.replace(/\/$/, "")}/setup/${payload}`;

  const mailResult = await sendResendEmail(
    env,
    email,
    "Slutför er bokningssida",
    buildBrfSetupInviteHtml(setupUrl, associationName)
  );
  if (!mailResult.ok) {
    const detail =
      mailResult.error === "missing_email_config" && (mailResult as any).missing
        ? `missing_email_config:${(mailResult as any).missing.join(",")}`
        : mailResult.error === "resend_failed" && typeof (mailResult as any).status === "number"
          ? `resend_failed:${(mailResult as any).status}`
          : mailResult.error || "resend_failed";
    return errorResponse(503, detail);
  }

  return json({ setup_url: setupUrl });
};

type VerifiedSetupPayload =
  | { ok: false; error: Response }
  | { ok: true; associationName: string; email: string; registerUuid: string };

const verifySetupLinkPayload = async (env: Env, payload: unknown): Promise<VerifiedSetupPayload> => {
  if (!payload || typeof payload !== "string") {
    return { ok: false, error: errorResponse(400, "invalid_payload") };
  }
  let decoded: any;
  try {
    decoded = JSON.parse(base64UrlDecode(payload));
  } catch {
    return { ok: false, error: errorResponse(400, "invalid_payload") };
  }

  const associationName = decoded?.association_name;
  const email = decoded?.email;
  const uuid = decoded?.uuid;
  const sha1 = decoded?.sha1;
  if (!associationName || !email || !uuid || !sha1) {
    return { ok: false, error: errorResponse(400, "invalid_payload") };
  }

  const setupSalt = await getSetupSalt(env.DB);
  if (!setupSalt) {
    return { ok: false, error: errorResponse(500, "missing_setup_salt") };
  }

  const expected = await sha1Hex(`${associationName}|${email}|${uuid}|${setupSalt}`);
  if (expected !== sha1) {
    return { ok: false, error: errorResponse(401, "invalid_signature") };
  }

  return {
    ok: true,
    associationName: String(associationName).trim(),
    email: String(email).trim(),
    registerUuid: String(uuid).trim(),
  };
};

const handleBrfSetupVerify = async (request: Request, env: Env) => {
  const body = await getJsonBody(request);
  const verified = await verifySetupLinkPayload(env, body?.payload);
  if (!verified.ok) {
    return verified.error;
  }
  const { associationName, email, registerUuid } = verified;
  const existingTenant = (await env.DB
    .prepare(
      `SELECT id, is_setup_complete, account_owner_token
       FROM tenants
       WHERE id = ?
       LIMIT 1`
    )
    .bind(registerUuid)
    .first()) as any;

  if (!existingTenant) {
    const tenantId = registerUuid;
    const accountOwnerToken = crypto.randomUUID();
    await env.DB
      .prepare(
        `INSERT INTO tenants (id, name, is_active, account_owner_token, admin_email, is_setup_complete)
         VALUES (?, ?, 1, ?, ?, 0)`
      )
      .bind(tenantId, associationName, accountOwnerToken, email)
      .run();
  }

  const tenant = (existingTenant
    ? existingTenant
    : await env.DB
        .prepare(
          `SELECT id, is_setup_complete, account_owner_token
           FROM tenants
           WHERE id = ?
           LIMIT 1`
        )
        .bind(registerUuid)
        .first()) as any;

  const accountOwnerTokenOut = String(tenant?.account_owner_token || "").trim();
  if (!accountOwnerTokenOut) {
    return errorResponse(500, "tenant_missing_owner_token");
  }

  const isComplete = Number(tenant?.is_setup_complete) === 1;
  return json({
    association_name: associationName,
    email,
    uuid: registerUuid,
    tenant_id: String(tenant.id),
    ...(isComplete ? {} : { account_owner_token: accountOwnerTokenOut }),
    is_setup_complete: isComplete,
  });
};

const handleBrfSetupResendAdminLink = async (request: Request, env: Env) => {
  const body = await getJsonBody(request);
  const verified = await verifySetupLinkPayload(env, body?.payload);
  if (!verified.ok) {
    return verified.error;
  }
  const { email, registerUuid } = verified;

  const row = (await env.DB
    .prepare(
      `SELECT id, admin_email, is_setup_complete, account_owner_token
       FROM tenants
       WHERE id = ?
       LIMIT 1`
    )
    .bind(registerUuid)
    .first()) as any;

  if (!row) {
    return errorResponse(404, "not_found");
  }
  if (Number(row.is_setup_complete) !== 1) {
    return errorResponse(409, "setup_not_complete");
  }

  const storedEmail = String(row.admin_email || "").trim().toLowerCase();
  const payloadEmail = email.trim().toLowerCase();
  if (!storedEmail || storedEmail !== payloadEmail) {
    return errorResponse(403, "email_mismatch");
  }

  const accountOwnerToken = String(row.account_owner_token || "").trim();
  if (!accountOwnerToken) {
    return errorResponse(500, "tenant_missing_owner_token");
  }

  const requestUrl = new URL(request.url);
  const bodyBaseUrl = String(body?.frontend_base_url || "").trim();
  const baseUrlCandidate = bodyBaseUrl || env.FRONTEND_BASE_URL || requestUrl.origin;
  let adminBaseUrl: string;
  try {
    adminBaseUrl = new URL(baseUrlCandidate).origin;
  } catch {
    adminBaseUrl = requestUrl.origin;
  }
  const adminUrl = `${adminBaseUrl.replace(/\/$/, "")}/admin/${accountOwnerToken}`;
  const mailResult = await sendResendEmail(
    env,
    storedEmail,
    "Admin‑länk till er bokningsportal",
    buildAdminSetupCompleteEmailHtml(adminUrl)
  );

  if (mailResult.ok) {
    const displayEmail = String(row.admin_email || "").trim() || email;
    return json({ ok: true, email_sent: true, email: displayEmail });
  }
  const err = mailResult as { error: string; missing?: string[]; status?: number };
  return json({
    ok: false,
    email_sent: false,
    email_error: err.error,
    ...(err.error === "missing_email_config" && err.missing?.length ? { missing_email_config: err.missing } : {}),
  });
};

const handleBrfSetupComplete = async (request: Request, env: Env) => {
  const body = await getJsonBody(request);
  const accountOwnerToken = body?.account_owner_token;
  const email = body?.email;
  if (!accountOwnerToken || !email) {
    return errorResponse(400, "invalid_payload");
  }

  await env.DB.prepare("UPDATE tenants SET is_setup_complete = 1 WHERE account_owner_token = ?")
    .bind(accountOwnerToken)
    .run();

  const requestUrl = new URL(request.url);
  const bodyBaseUrl = body?.frontend_base_url?.trim();
  const baseUrlCandidate = bodyBaseUrl || env.FRONTEND_BASE_URL || requestUrl.origin;
  let adminBaseUrl: string;
  try {
    const parsed = new URL(baseUrlCandidate);
    adminBaseUrl = parsed.origin;
  } catch {
    adminBaseUrl = requestUrl.origin;
  }
  const adminUrl = `${adminBaseUrl.replace(/\/$/, "")}/admin/${accountOwnerToken}`;
  const mailResult = await sendResendEmail(
    env,
    email,
    "Admin‑länk till er bokningsportal",
    buildAdminSetupCompleteEmailHtml(adminUrl)
  );

  if (mailResult.ok) {
    return json({ ok: true, admin_url: adminUrl, email_sent: true });
  }
  const err = mailResult as { error: string; missing?: string[]; status?: number };
  return json({
    ok: true,
    admin_url: adminUrl,
    email_sent: false,
    email_error: err.error,
    ...(err.error === "missing_email_config" && err.missing?.length ? { missing_email_config: err.missing } : {}),
  });
};

const requireAdmin = async (request: Request, env: Env) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) {
    return auth;
  }
  if (auth.user.is_account_owner !== 1) {
    return { error: errorResponse(403, "forbidden") };
  }
  return auth;
};

const requireAdminUser = async (request: Request, env: Env) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) {
    return auth;
  }
  if (auth.user.is_admin !== 1) {
    return { error: errorResponse(403, "forbidden") };
  }
  return auth;
};

const isMissingBookingBlocksTableError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("no such table: booking_blocks");
};

const listBookingBlocksInRange = async (db: D1Database, bookingObjectId: string, startTime: string, endTime: string) => {
  try {
    const rows = await db
      .prepare(
        `SELECT id, start_time, end_time
         FROM booking_blocks
         WHERE booking_object_id = ?
           AND NOT (end_time <= ? OR start_time >= ?)`
      )
      .bind(bookingObjectId, startTime, endTime)
      .all();
    return rows.results;
  } catch (error) {
    if (isMissingBookingBlocksTableError(error)) {
      return [];
    }
    throw error;
  }
};

const listUserGroups = async (db: D1Database, userId: string) => {
  const rows = await db
    .prepare(
      `SELECT ag.name
       FROM user_access_groups uag
       JOIN access_groups ag ON uag.group_id = ag.id
       WHERE uag.user_id = ?`
    )
    .bind(userId)
    .all();
  return rows.results.map((row: any) => row.name as string);
};

const permissionMatchesUser = (user: any, userGroups: Set<string>, scope: string, value: string) => {
  if (scope === "house") return user.house === value;
  if (scope === "apartment") return user.apartment_id === value;
  if (scope === "group") return userGroups.has(value);
  return false;
};

const canUserAccessWithPermissions = (permissions: any[], user: any, userGroups: string[]) => {
  if (!permissions.length) {
    return true;
  }
  const groupsSet = new Set(userGroups);
  const deny = permissions.filter((p: any) => p.mode === "deny");
  if (deny.some((p: any) => permissionMatchesUser(user, groupsSet, p.scope as string, p.value as string))) {
    return false;
  }
  const allow = permissions.filter((p: any) => p.mode === "allow");
  if (!allow.length) {
    return true;
  }
  return allow.some((p: any) => permissionMatchesUser(user, groupsSet, p.scope as string, p.value as string));
};

type MaxBookingScope = "object" | "group" | null;

const buildInClausePlaceholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");

const toUniqueTrimmedStrings = (values: unknown[]) => {
  const result = new Set<string>();
  for (const value of values || []) {
    const normalized = String(value || "").trim();
    if (normalized) {
      result.add(normalized);
    }
  }
  return Array.from(result);
};

const getUserGroupNamesFromPayload = (body: any) =>
  toUniqueTrimmedStrings(Array.isArray(body?.groups) ? body.groups : []);

const normalizeStoredRfid = (value: unknown) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (/[^0-9A-F]/.test(raw)) return null;
  const noLeadingZeros = raw.replace(/^0+/, "");
  const normalized = noLeadingZeros || "0";
  if (normalized.length < 4) return null;
  if (!/[1-9A-F]/.test(normalized)) return null;
  return normalized;
};

const toHexFromDecString = (dec: string) => {
  try {
    return BigInt(dec).toString(16).toUpperCase();
  } catch {
    return null;
  }
};

const toDecFromHexString = (hex: string) => {
  try {
    return BigInt(`0x${hex}`).toString(10);
  } catch {
    return null;
  }
};

const getRfidLookupCandidates = (value: unknown) => {
  const normalized = normalizeStoredRfid(value);
  if (!normalized) return [];
  const candidates = new Set<string>([normalized]);

  const isDigitsOnly = /^[0-9]+$/.test(normalized);
  if (isDigitsOnly) {
    const asHex = toHexFromDecString(normalized);
    if (asHex) candidates.add(asHex);
  } else {
    const asDec = toDecFromHexString(normalized);
    if (asDec) candidates.add(asDec);
  }
  return Array.from(candidates);
};

const getValidatedUserRfidTagsFromPayload = (body: any) => {
  const sourceTags = Array.isArray(body?.rfid_tags)
    ? body.rfid_tags
    : body?.rfid
      ? [body.rfid]
      : [];
  const uniqueInput = toUniqueTrimmedStrings(sourceTags);
  const validTags: string[] = [];
  const invalidTags: string[] = [];
  for (const input of uniqueInput) {
    const normalized = normalizeStoredRfid(input);
    if (!normalized) {
      invalidTags.push(input);
      continue;
    }
    validTags.push(normalized);
  }
  return {
    tags: toUniqueTrimmedStrings(validTags),
    invalidTags,
  };
};

const listAccessGroupsByNames = async (db: D1Database, tenantId: string, groupNames: string[]) => {
  if (!groupNames.length) {
    return new Map<string, string>();
  }
  const rows = await db
    .prepare(
      `SELECT id, name
       FROM access_groups
       WHERE tenant_id = ?
         AND name IN (${buildInClausePlaceholders(groupNames.length)})`
    )
    .bind(tenantId, ...groupNames)
    .all();
  return new Map<string, string>(
    rows.results.map((row: any) => [String(row.name), String(row.id)])
  );
};

const ensureAccessGroupIdsByNames = async (db: D1Database, tenantId: string, groupNames: string[]) => {
  if (!groupNames.length) {
    return new Map<string, string>();
  }
  const existing = await listAccessGroupsByNames(db, tenantId, groupNames);
  const missing = groupNames.filter((name) => !existing.has(name));
  if (!missing.length) {
    return existing;
  }
  const dbAny = db as any;
  const createStatements = missing.map((name) =>
    db
      .prepare("INSERT OR IGNORE INTO access_groups (id, tenant_id, name) VALUES (?, ?, ?)")
      .bind(`group-${crypto.randomUUID()}`, tenantId, name)
  );
  await dbAny.batch(createStatements);
  return listAccessGroupsByNames(db, tenantId, groupNames);
};

const replaceUserAccessGroups = async (db: D1Database, userId: string, groupIds: string[]) => {
  const dbAny = db as any;
  const statements = [
    db.prepare("DELETE FROM user_access_groups WHERE user_id = ?").bind(userId),
    ...groupIds.map((groupId) =>
      db.prepare("INSERT INTO user_access_groups (user_id, group_id) VALUES (?, ?)").bind(userId, groupId)
    ),
  ];
  await dbAny.batch(statements);
};

const replaceUserRfidTags = async (db: D1Database, tenantId: string, userId: string, rfidTags: string[]) => {
  const dbAny = db as any;
  const statements = [
    db.prepare("UPDATE rfid_tags SET is_active = 0 WHERE user_id = ?").bind(userId),
    ...rfidTags.map((uid) =>
      db
        .prepare(
          `INSERT INTO rfid_tags (uid, tenant_id, user_id, is_active)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(tenant_id, uid) DO UPDATE SET user_id = excluded.user_id, is_active = 1`
        )
        .bind(uid, tenantId, userId)
    ),
  ];
  await dbAny.batch(statements);
};

const getBookingGroupMaxBookings = async (db: D1Database, tenantId: string, groupIds: string[]) => {
  if (!groupIds.length) {
    return new Map<string, number>();
  }
  const rows = await db
    .prepare(
      `SELECT id, max_bookings
       FROM booking_groups
       WHERE tenant_id = ?
         AND id IN (${buildInClausePlaceholders(groupIds.length)})`
    )
    .bind(tenantId, ...groupIds)
    .all();
  const map = new Map<string, number>();
  for (const row of rows.results as any[]) {
    const limit = Number(row.max_bookings);
    if (Number.isFinite(limit) && limit > 0) {
      map.set(String(row.id), limit);
    }
  }
  return map;
};

const getActiveBookingCountsByObject = async (
  db: D1Database,
  userId: string,
  nowIso: string,
  bookingObjectIds: string[]
) => {
  if (!bookingObjectIds.length) {
    return new Map<string, number>();
  }
  const rows = await db
    .prepare(
      `SELECT booking_object_id, COUNT(1) AS count
       FROM bookings
       WHERE user_id = ?
         AND cancelled_at IS NULL
         AND end_time >= ?
         AND booking_object_id IN (${buildInClausePlaceholders(bookingObjectIds.length)})
       GROUP BY booking_object_id`
    )
    .bind(userId, nowIso, ...bookingObjectIds)
    .all();
  return new Map<string, number>(
    rows.results.map((row: any) => [String(row.booking_object_id), Number(row.count || 0)])
  );
};

const getActiveBookingCountsByGroup = async (
  db: D1Database,
  userId: string,
  tenantId: string,
  nowIso: string,
  groupIds: string[]
) => {
  if (!groupIds.length) {
    return new Map<string, number>();
  }
  const rows = await db
    .prepare(
      `SELECT bo.group_id, COUNT(1) AS count
       FROM bookings b
       JOIN booking_objects bo ON bo.id = b.booking_object_id
       WHERE b.user_id = ?
         AND bo.tenant_id = ?
         AND b.cancelled_at IS NULL
         AND b.end_time >= ?
         AND bo.group_id IN (${buildInClausePlaceholders(groupIds.length)})
       GROUP BY bo.group_id`
    )
    .bind(userId, tenantId, nowIso, ...groupIds)
    .all();
  return new Map<string, number>(
    rows.results.map((row: any) => [String(row.group_id), Number(row.count || 0)])
  );
};

const getEffectiveMaxBookingsConfigFromGroupLimits = (
  bookingObject: any,
  groupLimitsById: Map<string, number>
): { limit: number | null; scope: MaxBookingScope } => {
  const overrideLimit = Number(bookingObject?.max_bookings_override);
  if (Number.isFinite(overrideLimit) && overrideLimit > 0) {
    return { limit: overrideLimit, scope: "object" as const };
  }
  if (!bookingObject?.group_id) {
    return { limit: null, scope: null };
  }
  const groupLimit = Number(groupLimitsById.get(String(bookingObject.group_id)));
  if (Number.isFinite(groupLimit) && groupLimit > 0) {
    return { limit: groupLimit, scope: "group" as const };
  }
  return { limit: null, scope: null };
};

const getBookingObjectPermissionsFromPayload = (body: any) => {
  const rawPermissions =
    body?.permissions || [
      ...(body?.allowHouses || []).map((value: string) => ({ mode: "allow", scope: "house", value })),
      ...(body?.allowGroups || []).map((value: string) => ({ mode: "allow", scope: "group", value })),
      ...(body?.allowApartments || []).map((value: string) => ({ mode: "allow", scope: "apartment", value })),
      ...(body?.denyHouses || []).map((value: string) => ({ mode: "deny", scope: "house", value })),
      ...(body?.denyGroups || []).map((value: string) => ({ mode: "deny", scope: "group", value })),
      ...(body?.denyApartments || []).map((value: string) => ({ mode: "deny", scope: "apartment", value })),
    ];

  const unique = new Map<string, { mode: string; scope: string; value: string }>();
  for (const permission of rawPermissions) {
    const mode = String(permission?.mode || "").trim();
    const scope = String(permission?.scope || "").trim();
    const value = String(permission?.value || "").trim();
    if (!mode || !scope || !value) {
      continue;
    }
    const key = `${mode}|${scope}|${value}`;
    unique.set(key, { mode, scope, value });
  }
  return Array.from(unique.values());
};

const replaceBookingObjectPermissions = async (
  db: D1Database,
  bookingObjectId: string,
  permissions: { mode: string; scope: string; value: string }[]
) => {
  const dbAny = db as any;
  const statements = [
    db.prepare("DELETE FROM booking_object_permissions WHERE booking_object_id = ?").bind(bookingObjectId),
    ...permissions.map((permission) =>
      db
        .prepare("INSERT INTO booking_object_permissions (booking_object_id, mode, scope, value) VALUES (?, ?, ?, ?)")
        .bind(bookingObjectId, permission.mode, permission.scope, permission.value)
    ),
  ];
  await dbAny.batch(statements);
};

const getActiveRfidTagUserContext = async (db: D1Database, uid: string, tenantId?: string | null) => {
  const tenantFilterSql = tenantId ? "AND rt.tenant_id = ?" : "";
  const statement = db.prepare(
    `SELECT
       rt.tenant_id AS rfid_tenant_id,
       u.id AS user_id,
       u.apartment_id AS user_apartment_id,
       u.is_admin AS user_is_admin
     FROM rfid_tags rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.uid = ?
       AND rt.is_active = 1
       ${tenantFilterSql}
     LIMIT 1`
  );
  const bound = tenantId ? statement.bind(uid, tenantId) : statement.bind(uid);
  return (await bound.first()) as any;
};

const buildServicesForAuth = async (db: D1Database, auth: { user: any; tenant: any }, env: Env) => {
  const nowUtc = getUtcNowFromEnv(env);
  const nowIso = new Date().toISOString();
  const bookingObjects = await db
    .prepare("SELECT * FROM booking_objects WHERE tenant_id = ? AND is_active = 1 ORDER BY name COLLATE NOCASE ASC")
    .bind(auth.tenant.id)
    .all();
  let filtered: any[] = bookingObjects.results;
  if (auth.user.is_admin !== 1) {
    const [userGroups, permissionRows] = await Promise.all([
      listUserGroups(db, auth.user.id),
      db
        .prepare(
          `SELECT bop.booking_object_id, bop.mode, bop.scope, bop.value
           FROM booking_object_permissions bop
           JOIN booking_objects bo ON bo.id = bop.booking_object_id
           WHERE bo.tenant_id = ?
             AND bo.is_active = 1`
        )
        .bind(auth.tenant.id)
        .all(),
    ]);
    const permissionsByObject = new Map<string, any[]>();
    for (const permission of permissionRows.results) {
      const objectId = permission.booking_object_id as string;
      if (!permissionsByObject.has(objectId)) {
        permissionsByObject.set(objectId, []);
      }
      permissionsByObject.get(objectId)!.push(permission);
    }
    filtered = bookingObjects.results.filter((obj: any) =>
      canUserAccessWithPermissions(permissionsByObject.get(obj.id as string) || [], auth.user, userGroups)
    );
  }
  const groupIds = toUniqueTrimmedStrings(filtered.map((obj: any) => obj.group_id));
  const groupLimitsById = await getBookingGroupMaxBookings(db, auth.tenant.id, groupIds);

  const maxConfigByObjectId = new Map<
    string,
    { limit: number | null; scope: MaxBookingScope }
  >();
  const limitedObjectIds: string[] = [];
  const limitedGroupIds = new Set<string>();
  for (const obj of filtered as any[]) {
    const config = getEffectiveMaxBookingsConfigFromGroupLimits(obj, groupLimitsById);
    const objectId = String(obj.id);
    maxConfigByObjectId.set(objectId, config);
    if (config.limit !== null) {
      if (config.scope === "group" && obj.group_id) {
        limitedGroupIds.add(String(obj.group_id));
      } else {
        limitedObjectIds.push(objectId);
      }
    }
  }

  const [activeCountsByObjectId, activeCountsByGroupId] = await Promise.all([
    getActiveBookingCountsByObject(db, auth.user.id, nowIso, limitedObjectIds),
    getActiveBookingCountsByGroup(db, auth.user.id, auth.tenant.id, nowIso, Array.from(limitedGroupIds)),
  ]);

  return filtered.map((obj: any) => {
      const nextAvailableStart = getNextAvailableStart(obj, nowUtc);
      const maxBookings =
        maxConfigByObjectId.get(String(obj.id)) || {
          limit: null,
          scope: null as MaxBookingScope,
        };
      const activeCount =
        maxBookings.limit !== null
          ? maxBookings.scope === "group" && obj.group_id
            ? Number(activeCountsByGroupId.get(String(obj.group_id)) || 0)
            : Number(activeCountsByObjectId.get(String(obj.id)) || 0)
          : 0;
      const maxBookingsReached = maxBookings.limit !== null && activeCount >= maxBookings.limit;
      return {
      id: obj.id,
      name: obj.name,
      description: obj.description || "",
      booking_type: obj.booking_type,
      slot_duration_minutes: obj.slot_duration_minutes,
      full_day_start_time: normalizeClockTime(obj.full_day_start_time),
      full_day_end_time: normalizeClockTime(obj.full_day_end_time),
      time_slot_start_time: normalizeClockTime(obj.time_slot_start_time, "08:00"),
      time_slot_end_time: normalizeClockTime(obj.time_slot_end_time, "20:00"),
      window_min_days: obj.window_min_days,
      window_max_days: obj.window_max_days,
      next_available:
        obj.booking_type === "time-slot"
          ? formatDateTimeMinutes(nextAvailableStart)
          : formatDate(nextAvailableStart),
      next_available_start: nextAvailableStart.toISOString(),
      price_weekday_cents: obj.price_weekday_cents,
      price_weekend_cents: obj.price_weekend_cents,
      group_id: obj.group_id || null,
      max_bookings_limit: maxBookings.limit,
      max_bookings_scope: maxBookings.scope,
      max_bookings_reached: maxBookingsReached,
      };
    });
};

const getCurrentBookingsForUser = async (db: D1Database, userId: string) => {
  const rows = await db
    .prepare(
      `SELECT b.id, b.start_time, b.end_time, b.booking_object_id, bo.group_id AS booking_group_id, bo.name AS booking_object_name
       FROM bookings b
       JOIN booking_objects bo ON bo.id = b.booking_object_id
       WHERE b.user_id = ? AND b.cancelled_at IS NULL
         AND datetime(b.end_time) > datetime('now')
       ORDER BY b.start_time ASC`
    )
    .bind(userId)
    .all();
  return rows.results.map((row: any) => ({
    id: row.id,
    service_name: row.booking_object_name,
    booking_object_id: row.booking_object_id,
    booking_group_id: row.booking_group_id,
    date: (row.start_time as string).slice(0, 10),
    time_label: row.end_time ? `${row.start_time.slice(11, 16)}-${row.end_time.slice(11, 16)}` : "Heldag",
    status: "mine",
  }));
};

const listBookableUsersForTenant = async (db: D1Database, tenantId: string) => {
  const rows = await db
    .prepare(
      `SELECT id, apartment_id, house, is_admin
       FROM users
       WHERE tenant_id = ? AND is_active = 1
       ORDER BY apartment_id COLLATE NOCASE ASC`
    )
    .bind(tenantId)
    .all();
  return rows.results.map((row: any) => ({
    id: row.id,
    apartment_id: row.apartment_id,
    house: row.house,
    is_admin: Number(row.is_admin) === 1,
  }));
};

const buildMonthAvailability = async (db: D1Database, user: any, bookingObjectId: string, month: string, nowUtc: Date) => {
  const bookingObject = await db.prepare("SELECT * FROM booking_objects WHERE id = ?").bind(bookingObjectId).first();
  if (!bookingObject) return null;

  const [year, monthIndex] = month.split("-").map((part) => Number(part));
  const firstDate = new Date(Date.UTC(year, monthIndex - 1, 1));
  const lastDate = new Date(Date.UTC(year, monthIndex, 0));
  const rangeStart = buildFullDayRange(firstDate, bookingObject).start;
  const rangeEnd = buildFullDayRange(lastDate, bookingObject).end;

  const bookings = await db
    .prepare(
      `SELECT b.id, b.user_id, u.apartment_id, b.start_time, b.end_time
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE booking_object_id = ?
         AND cancelled_at IS NULL
         AND NOT (end_time <= ? OR start_time >= ?)`
    )
    .bind(bookingObjectId, rangeStart.toISOString(), rangeEnd.toISOString())
    .all();
  const overlaps = bookings.results.map((row: any) => ({
    bookingId: row.id as string,
    userId: row.user_id as string,
    bookedByApartmentId: row.apartment_id as string,
    startMs: new Date(row.start_time as string).getTime(),
    endMs: new Date(row.end_time as string).getTime(),
  }));
  const blockRows = await listBookingBlocksInRange(db, bookingObjectId, rangeStart.toISOString(), rangeEnd.toISOString());
  const blockOverlaps = blockRows.map((row: any) => ({
    blockId: row.id as string,
    startMs: new Date(row.start_time as string).getTime(),
    endMs: new Date(row.end_time as string).getTime(),
  }));

  const days: {
    date: string;
    status: string;
    booking_id?: string | null;
    booked_by_apartment_id?: string | null;
    block_id?: string | null;
  }[] = [];
  const nowMs = nowUtc.getTime();
  const { minMs, maxMs } = getWindowBoundaries(bookingObject, nowUtc);
  for (let day = 1; day <= new Date(year, monthIndex, 0).getDate(); day += 1) {
    const date = new Date(Date.UTC(year, monthIndex - 1, day));
    const dateString = formatDate(date);
    const candidate = buildFullDayRange(date, bookingObject);
    let status = "available";
    const startMs = candidate.start.getTime();
    const endMs = candidate.end.getTime();
    const outsideWindow = startMs < minMs || endMs > maxMs;
    if (endMs <= nowMs || outsideWindow) {
      status = "disabled";
    }
    const overlap = overlaps.find((booking) => booking.startMs < candidate.end.getTime() && booking.endMs > candidate.start.getTime());
    const blockOverlap = blockOverlaps.find((block) => block.startMs < candidate.end.getTime() && block.endMs > candidate.start.getTime());
    if (overlap) {
      status = overlap.userId === user.id ? "mine" : "booked";
      days.push({
        date: dateString,
        status,
        booking_id: overlap.bookingId,
        booked_by_apartment_id: overlap.bookedByApartmentId,
      });
      continue;
    }
    if (blockOverlap) {
      status = "blocked";
      days.push({
        date: dateString,
        status,
        block_id: blockOverlap.blockId,
      });
      continue;
    }
    days.push({ date: dateString, status });
  }
  return days;
};

const buildWeekAvailability = async (db: D1Database, user: any, bookingObjectId: string, weekStart: string, nowUtc: Date) => {
  const bookingObject = await db.prepare("SELECT * FROM booking_objects WHERE id = ?").bind(bookingObjectId).first();
  if (!bookingObject) return null;
  const startDate = parseDate(weekStart);
  const endDate = addDays(startDate, 7);
  const overlapsResult = await db
    .prepare(
      `SELECT b.id, b.user_id, u.apartment_id, b.start_time, b.end_time FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE booking_object_id = ?
         AND cancelled_at IS NULL
         AND NOT (end_time <= ? OR start_time >= ?)`
    )
    .bind(bookingObjectId, startDate.toISOString(), endDate.toISOString())
    .all();
  const overlaps = overlapsResult.results.map((row: any) => ({
    bookingId: row.id as string,
    userId: row.user_id as string,
    bookedByApartmentId: row.apartment_id as string,
    startMs: new Date(row.start_time as string).getTime(),
    endMs: new Date(row.end_time as string).getTime(),
  }));
  const blockRows = await listBookingBlocksInRange(db, bookingObjectId, startDate.toISOString(), endDate.toISOString());
  const blockOverlaps = blockRows.map((row: any) => ({
    blockId: row.id as string,
    startMs: new Date(row.start_time as string).getTime(),
    endMs: new Date(row.end_time as string).getTime(),
  }));
  const parsedSlotMinutes = Number(bookingObject.slot_duration_minutes);
  const slotMinutes = Number.isFinite(parsedSlotMinutes) && parsedSlotMinutes > 0 ? parsedSlotMinutes : 60;
  const slotWindow = getTimeSlotWindowConfig(bookingObject);
  const nowMs = nowUtc.getTime();
  const { minMs, maxMs } = getWindowBoundaries(bookingObject, nowUtc);
  const days = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const dateString = formatDate(date);
    const label = date.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "numeric" });
    const slots = [];
    for (
      let minuteOffset = slotWindow.startMinutes;
      minuteOffset + slotMinutes <= slotWindow.endMinutes;
      minuteOffset += slotMinutes
    ) {
      const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
      start.setUTCMinutes(minuteOffset);
      const end = new Date(start);
      end.setUTCMinutes(end.getUTCMinutes() + slotMinutes);
      const startMs = start.getTime();
      const endMs = end.getTime();
      let status: "available" | "booked" | "mine" | "disabled" | "blocked";
      const overlap = overlaps.find((booking) => booking.startMs < endMs && booking.endMs > startMs);
      const blockOverlap = blockOverlaps.find((block) => block.startMs < endMs && block.endMs > startMs);
      if (overlap) {
        status = overlap.userId === user.id ? "mine" : "booked";
      } else if (blockOverlap) {
        status = "blocked";
      } else {
        const outsideWindow = startMs < minMs || endMs > maxMs;
        status = outsideWindow ? "disabled" : "available";
      }
      // Passed slots should always be visually disabled, regardless of booking ownership.
      if (endMs <= nowMs) {
        status = "disabled";
      }
      const isWeekend = [0, 6].includes(start.getUTCDay());
      const price = isWeekend ? (bookingObject.price_weekend_cents as number) : (bookingObject.price_weekday_cents as number);
      slots.push({
        id: `${dateString}-${minuteOffset}`,
        label: `${start.toISOString().slice(11, 16)}-${end.toISOString().slice(11, 16)}`,
        status,
        price_cents: price,
        booking_id: overlap ? overlap.bookingId : null,
        booked_by_apartment_id: overlap ? overlap.bookedByApartmentId : null,
        block_id: blockOverlap ? blockOverlap.blockId : null,
      });
    }
    days.push({ label, date: dateString, slots });
  }
  return days;
};

const handleRfidLogin = async (request: Request, env: Env) => {
  const body = await getJsonBody(request);
  const abuseBlock = await enforceRfidAbusePolicy(request, env, body as Record<string, unknown>);
  if (abuseBlock) {
    return abuseBlock;
  }

  const uidCandidates = getRfidLookupCandidates(body?.uid);
  const tenantIdFromBody = String(body?.tenant_id || "").trim();
  const screenToken = parseBearerToken(request.headers.get("authorization"));
  if (!uidCandidates.length) {
    await recordRfidAuthFailure(env, request);
    return errorResponse(401, "invalid_rfid");
  }

  let tenantIdFilter: string | null = null;
  let screenContext: any = null;
  if (screenToken) {
    const screen = await getScreenByToken(env.DB, screenToken);
    if (!screen) {
      await recordRfidAuthFailure(env, request);
      return errorResponse(401, "invalid_screen_token");
    }
    tenantIdFilter = String(screen.tenant_id);
    screenContext = screen;
  } else if (tenantIdFromBody) {
    tenantIdFilter = tenantIdFromBody;
  }

  const rfidContext = (await env.DB
    .prepare(
      `SELECT
         rt.tenant_id AS tag_tenant_id,
         u.id AS user_id,
         u.apartment_id AS user_apartment_id,
         u.is_admin AS user_is_admin
       FROM rfid_tags rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.uid IN (${buildInClausePlaceholders(uidCandidates.length)})
         AND rt.is_active = 1
         AND (? IS NULL OR rt.tenant_id = ?)
       LIMIT 1`
    )
    .bind(...uidCandidates, tenantIdFilter, tenantIdFilter)
    .first()) as any;
  if (!rfidContext) {
    await recordRfidAuthFailure(env, request);
    return errorResponse(401, "invalid_rfid");
  }
  if (tenantIdFilter && String(rfidContext.tag_tenant_id) !== tenantIdFilter) {
    await recordRfidAuthFailure(env, request);
    return errorResponse(403, "rfid_not_allowed_for_screen");
  }

  const existingAccessToken = await env.DB.prepare(
    "SELECT token FROM access_tokens WHERE user_id = ? LIMIT 1"
  ).bind(rfidContext.user_id).first();
  const accessToken =
    (existingAccessToken?.token as string | undefined) || crypto.randomUUID();
  if (!existingAccessToken) {
    await env.DB.prepare(
      `INSERT INTO access_tokens (token, tenant_id, user_id, created_at, source)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'kiosk')`
    ).bind(accessToken, rfidContext.tag_tenant_id, rfidContext.user_id).run();
  } else {
    await env.DB.prepare("UPDATE access_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?")
      .bind(accessToken)
      .run();
  }

  await recordRfidAuthSuccess(env, request);

  return json(
    {
      booking_url: `/user/${accessToken}`,
      user: {
        id: rfidContext.user_id,
        apartment_id: rfidContext.user_apartment_id,
        is_admin: Number(rfidContext.user_is_admin) === 1,
      },
      tenant: screenContext ? { id: screenContext.tenant_id, name: screenContext.tenant_name } : undefined,
    }
  );
};

const handleKioskAccessToken = async (request: Request, env: Env) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  await env.DB.prepare("DELETE FROM access_tokens WHERE user_id = ?").bind(auth.user.id).run();
  const accessToken = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO access_tokens (token, tenant_id, user_id, created_at, source)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'kiosk')`
  ).bind(accessToken, auth.tenant.id, auth.user.id).run();
  return json({ access_token: accessToken, login_url: `/user/${accessToken}` });
};

const handleDemoLinks = async (request: Request, env: Env) => {
  const requestUrl = new URL(request.url);
  const frontendBaseUrlCandidate = env.FRONTEND_BASE_URL || requestUrl.origin;
  let frontendOrigin = requestUrl.origin;
  try {
    frontendOrigin = new URL(frontendBaseUrlCandidate).origin;
  } catch {
    frontendOrigin = requestUrl.origin;
  }

  const buildLink = (path: string) => `${frontendOrigin.replace(/\/$/, "")}${path}`;
  const buildPayload = (userTokens: string[], adminUserToken: string | null, accountOwnerToken: string | null) => ({
    links: {
      users: userTokens.slice(0, 2).map((token) => ({
        path: `/user/${token}`,
        url: buildLink(`/user/${token}`),
      })),
      admin_user: adminUserToken
        ? {
            path: `/user/${adminUserToken}`,
            url: buildLink(`/user/${adminUserToken}`),
          }
        : null,
      account_owner: accountOwnerToken
        ? {
            path: `/admin/${accountOwnerToken}`,
            url: buildLink(`/admin/${accountOwnerToken}`),
          }
        : null,
    },
  });

  const emptyTenant: TenantEtagSource = { id: "demo-brf", last_changed_at: "__none__" };

  try {
    const demoTenant = (await env.DB.prepare(
      `SELECT id, account_owner_token, last_changed_at
       FROM tenants
       WHERE id = 'demo-brf'
       LIMIT 1`
    ).bind().first()) as any;
    if (!demoTenant) {
      return withTenantConditionalJson(request, emptyTenant, buildPayload([], null, null));
    }

    const tokenRows = await env.DB
      .prepare(
        `SELECT
           u.apartment_id,
           u.is_admin,
           at.token
         FROM users u
         JOIN access_tokens at ON at.user_id = u.id
         WHERE u.tenant_id = ?
           AND u.is_active = 1
         ORDER BY u.is_admin DESC, u.apartment_id ASC`
      )
      .bind(demoTenant.id)
      .all();

    const userTokens = tokenRows.results
      .filter((row: any) => Number(row.is_admin) !== 1)
      .slice(0, 2)
      .map((row: any) => row.token as string)
      .filter(Boolean);
    const adminUserToken =
      (tokenRows.results.find((row: any) => Number(row.is_admin) === 1)?.token as string | undefined) || null;
    const accountOwnerToken = (demoTenant.account_owner_token as string | undefined) || null;

    const tenantEtag: TenantEtagSource = {
      id: String(demoTenant.id),
      last_changed_at: String(demoTenant.last_changed_at ?? ""),
    };
    return withTenantConditionalJson(request, tenantEtag, buildPayload(userTokens, adminUserToken, accountOwnerToken));
  } catch {
    return withTenantConditionalJson(request, emptyTenant, buildPayload([], null, null));
  }
};

const handlePublicConfig = async (_request: Request, env: Env) =>
  json({
    turnstile_site_key: String(env.TURNSTILE_SITE_KEY || "").trim(),
    rfid_under_attack: await isRfidUnderAttack(env),
  });

const isSafeTenantIdParam = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const isSafeAndroidVersion = (value: string) => /^[0-9A-Za-z._-]{1,64}$/.test(value);
const buildTenantApkObjectKey = (version: string) => `bokningsportal-kiosk-${version}.apk`;

const handleKioskWebContext = async (request: Request, env: Env, url: URL) => {
  const tenantId = String(url.searchParams.get("tenant_id") || "").trim();
  if (!tenantId || !isSafeTenantIdParam(tenantId)) {
    return errorResponse(400, "invalid_tenant_id");
  }
  const row = (await env.DB
    .prepare(
      `SELECT id, name, is_active, is_setup_complete
       FROM tenants
       WHERE id = ?
       LIMIT 1`
    )
    .bind(tenantId)
    .first()) as any;
  if (!row || Number(row.is_active) !== 1 || Number(row.is_setup_complete) !== 1) {
    return errorResponse(404, "kiosk_unavailable");
  }
  return json({
    tenant: { id: String(row.id), name: String(row.name || "") },
  });
};

const requireScreenAuth = async (request: Request, env: Env, mode: "default" | "poll" = "default") => {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { error: errorResponse(401, "unauthorized") };
  }
  const screen =
    mode === "poll"
      ? await getScreenByTokenPollCached(env, env.DB, token)
      : await getScreenByToken(env.DB, token);
  if (!screen) {
    return { error: errorResponse(401, "unauthorized") };
  }
  return { screen };
};

const handleKioskPairingAnnounce = async (request: Request, env: Env) => {
  const body = await getJsonBody(request);
  const pairingCode = normalizePairingCode(body?.pairing_code || body?.code);
  if (!isValidPairingCode(pairingCode)) {
    return errorResponse(400, "invalid_pairing_code");
  }

  const existing = await env.DB.prepare("SELECT code FROM kiosk_pairing_codes WHERE code = ?").bind(pairingCode).first();
  if (existing) {
    await env.DB
      .prepare(
        `UPDATE kiosk_pairing_codes
         SET status = CASE WHEN status = 'paired' THEN status ELSE 'pending' END,
             last_seen_at = CURRENT_TIMESTAMP,
             expires_at = ?,
             paired_screen_id = CASE WHEN status = 'paired' THEN paired_screen_id ELSE NULL END
         WHERE code = ?`
      )
      .bind(getPairingExpiryIso(), pairingCode)
      .run();
  } else {
    await env.DB
      .prepare(
        `INSERT INTO kiosk_pairing_codes (code, status, first_seen_at, last_seen_at, expires_at)
         VALUES (?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`
      )
      .bind(pairingCode, getPairingExpiryIso())
      .run();
  }

  return json({ pairing_code: pairingCode, status: "pending" });
};

const handleAdminOrderBookingScreens = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;

  const body = await getJsonBody(request);
  const quantity = Math.max(1, Math.min(50, Number(body?.quantity || 1)));
  const tenantAdminEmail = String((auth.tenant as any)?.admin_email || "").trim();
  const contactEmail = String(body?.contact_email || "").trim() || tenantAdminEmail;
  const contactName = String(body?.contact_name || "").trim() || String(auth.user.apartment_id || "");
  const tenantName = String(auth.tenant.name || "");
  const associationEmailLine = tenantAdminEmail || contactEmail;

  const subject = `Beställningsförfrågan bokningsskärmar - ${tenantName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Beställningsförfrågan bokningsskärmar</h2>
      <p><strong>Förening:</strong> ${escapeHtml(tenantName)}</p>
      <p><strong>Föreningens e-postadress:</strong> ${escapeHtml(associationEmailLine || "Ej angiven")}</p>
      <p><strong>Tenant-ID:</strong> ${escapeHtml(String(auth.tenant.id))}</p>
      <p><strong>Antal skärmar:</strong> ${quantity}</p>
      <p><strong>Pris:</strong> 6 000 kr/st inklusive moms</p>
      <p><strong>Kontaktperson (angiven vid beställning):</strong> ${escapeHtml(contactName || "Ej angiven")}</p>
      <p><strong>Kontakt e-post (angiven vid beställning):</strong> ${escapeHtml(contactEmail || "Ej angiven")}</p>
      <p>Vänligen återkom till kunden för fortsatt hantering.</p>
    </div>
  `;

  const mailResult = await sendResendEmail(env, ORDER_EMAIL_TO, subject, html);
  if (!mailResult.ok) {
    const detail =
      mailResult.error === "missing_email_config" && (mailResult as any).missing
        ? `missing_email_config:${(mailResult as any).missing.join(",")}`
        : mailResult.error === "resend_failed" && typeof (mailResult as any).status === "number"
          ? `resend_failed:${(mailResult as any).status}`
          : mailResult.error || "resend_failed";
    return errorResponse(503, detail);
  }
  return json({ ok: true, sent_to: ORDER_EMAIL_TO });
};

const handleAdminBookingScreens = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;

  const rows = await env.DB
    .prepare(
      `SELECT id, tenant_id, name, pairing_code, screen_token, is_active, created_at, updated_at, paired_at, last_seen_at, last_verified_at
       FROM booking_screens
       WHERE tenant_id = ? AND is_active = 1
       ORDER BY datetime(created_at) DESC`
    )
    .bind(auth.tenant.id)
    .all();
  const screenRows = rows.results as any[];
  const ids = screenRows.map((r) => String(r.id));
  const lastSeenDo = await batchGetScreenLastSeen(env, ids);
  const booking_screens = screenRows.map((r) => {
    const id = String(r.id);
    const fromDo = lastSeenDo[id];
    const atDo = fromDo != null && fromDo !== "" ? fromDo : null;
    return {
      ...r,
      last_seen_at: atDo ?? r.last_seen_at ?? null,
      last_verified_at: atDo ?? r.last_verified_at ?? null,
    };
  });
  return withTenantConditionalJson(request, auth.tenant, { booking_screens });
};

const handleAdminPairBookingScreen = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);

  const pairingCode = normalizePairingCode(body?.pairing_code || body?.code);
  const name = String(body?.name || "").trim();
  if (!isValidPairingCode(pairingCode)) {
    return errorResponse(400, "invalid_pairing_code");
  }
  if (!name) {
    return errorResponse(400, "invalid_name");
  }

  const pairingRow = await env.DB
    .prepare(
      `SELECT code, status, expires_at
       FROM kiosk_pairing_codes
       WHERE code = ?`
    )
    .bind(pairingCode)
    .first();
  if (!pairingRow) {
    return errorResponse(404, "pairing_code_not_found");
  }
  if (String(pairingRow.status) === "paired") {
    return errorResponse(409, "pairing_code_already_used");
  }
  const expiresAt = new Date(String(pairingRow.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return errorResponse(409, "pairing_code_expired");
  }

  const screenId = `screen-${crypto.randomUUID()}`;
  const screenToken = crypto.randomUUID();

  await env.DB
    .prepare(
      `INSERT INTO booking_screens (
         id, tenant_id, name, pairing_code, screen_token, is_active, created_at, updated_at, paired_at, last_verified_at
       ) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
    .bind(screenId, auth.tenant.id, name, pairingCode, screenToken)
    .run();

  await recordScreenLastSeen(env, screenId, getTimestampIso(env));

  await env.DB
    .prepare(
      `UPDATE kiosk_pairing_codes
       SET status = 'paired',
           paired_screen_id = ?,
           paired_at = CURRENT_TIMESTAMP,
           last_seen_at = CURRENT_TIMESTAMP
       WHERE code = ?`
    )
    .bind(screenId, pairingCode)
    .run();

  return json({
    id: screenId,
    name,
    pairing_code: pairingCode,
    tenant_id: auth.tenant.id,
    tenant_name: auth.tenant.name,
  });
};

const handleAdminUpdateBookingScreen = async (request: Request, env: Env, screenId: string) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  const name = String(body?.name || "").trim();
  if (!name) {
    return errorResponse(400, "invalid_name");
  }
  const existing = await env.DB
    .prepare("SELECT screen_token FROM booking_screens WHERE id = ? AND tenant_id = ? AND is_active = 1")
    .bind(screenId, auth.tenant.id)
    .first();
  if (!existing) {
    return errorResponse(404, "not_found");
  }
  const result = await env.DB
    .prepare(
      `UPDATE booking_screens
       SET name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ? AND is_active = 1`
    )
    .bind(name, screenId, auth.tenant.id)
    .run();
  if (!result?.success) {
    return errorResponse(404, "not_found");
  }
  await invalidateKioskPollAuthCache(env, String((existing as any).screen_token || ""));
  return json({ id: screenId, name });
};

const handleAdminDeleteBookingScreen = async (request: Request, env: Env, screenId: string) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;

  const screen = await env.DB
    .prepare("SELECT pairing_code, screen_token FROM booking_screens WHERE id = ? AND tenant_id = ? AND is_active = 1")
    .bind(screenId, auth.tenant.id)
    .first();
  if (!screen) {
    return errorResponse(404, "not_found");
  }

  await env.DB
    .prepare(
      `UPDATE booking_screens
       SET is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`
    )
    .bind(screenId, auth.tenant.id)
    .run();
  await env.DB.prepare("DELETE FROM kiosk_pairing_codes WHERE code = ?").bind(String(screen.pairing_code)).run();
  await invalidateKioskPollAuthCache(env, String((screen as any).screen_token || ""));
  return json({ id: screenId, deleted: true });
};

const handleKioskPairingClaim = async (request: Request, env: Env) => {
  const body = await getJsonBody(request);
  const pairingCode = normalizePairingCode(body?.pairing_code || body?.code);
  if (!isValidPairingCode(pairingCode)) {
    return errorResponse(400, "invalid_pairing_code");
  }

  const row = await env.DB
    .prepare(
      `SELECT bs.id, bs.name, bs.tenant_id, bs.screen_token, t.name AS tenant_name
       FROM booking_screens bs
       JOIN tenants t ON t.id = bs.tenant_id
       WHERE bs.pairing_code = ? AND bs.is_active = 1
       LIMIT 1`
    )
    .bind(pairingCode)
    .first();
  if (!row) {
    return errorResponse(404, "not_paired");
  }

  const ts = getTimestampIso(env);
  await recordScreenLastSeen(env, String(row.id), ts);

  return json({
    paired: true,
    screen: {
      id: row.id,
      name: row.name,
      screen_token: row.screen_token,
      tenant_id: row.tenant_id,
      tenant_name: row.tenant_name,
    },
  });
};

const handleKioskScreenStatus = async (request: Request, env: Env) => {
  const auth = await requireScreenAuth(request, env, "poll");
  if ("error" in auth) return auth.error;
  const ts = getTimestampIso(env);
  await recordScreenLastSeen(env, String(auth.screen.id), ts);
  const tenantTargetVersionRow = (await env.DB
    .prepare(
      `SELECT kiosk_target_android_version
       FROM tenants
       WHERE id = ?
       LIMIT 1`
    )
    .bind(String(auth.screen.tenant_id))
    .first()) as any;
  const targetAndroidVersion = String(tenantTargetVersionRow?.kiosk_target_android_version || "").trim();
  const androidDownloadPath = targetAndroidVersion
    ? `/api/kiosk/screen/apk?version=${encodeURIComponent(targetAndroidVersion)}`
    : "";
  const kioskTenant: TenantEtagSource = {
    id: String(auth.screen.tenant_id),
    last_changed_at: String(auth.screen.tenant_last_changed_at ?? ""),
  };
  const instructions = buildKioskScreenInstructions(env, {
    targetAndroidVersion,
    androidDownloadPath,
  });
  return withTenantConditionalJson(request, kioskTenant, {
    connected: true,
    screen: {
      id: auth.screen.id,
      name: auth.screen.name,
      tenant_id: auth.screen.tenant_id,
      tenant_name: auth.screen.tenant_name,
    },
    ...(instructions ? { instructions } : {}),
  });
};

const handleKioskScreenApkDownload = async (request: Request, env: Env, url: URL) => {
  const auth = await requireScreenAuth(request, env);
  if ("error" in auth) return auth.error;
  const requestedVersion = String(url.searchParams.get("version") || "").trim();
  if (!requestedVersion || !isSafeAndroidVersion(requestedVersion)) {
    return errorResponse(400, "invalid_version");
  }
  const tenantRow = (await env.DB
    .prepare(
      `SELECT kiosk_target_android_version
       FROM tenants
       WHERE id = ?
       LIMIT 1`
    )
    .bind(String(auth.screen.tenant_id))
    .first()) as any;
  const targetVersion = String(tenantRow?.kiosk_target_android_version || "").trim();
  if (!targetVersion || targetVersion !== requestedVersion) {
    return errorResponse(404, "version_not_enabled");
  }
  const bucket = env.ANDROID_APK_R2;
  if (!bucket) {
    return errorResponse(503, "apk_storage_unavailable");
  }
  const objectKey = buildTenantApkObjectKey(targetVersion);
  const apkObject = await bucket.get(objectKey);
  if (!apkObject?.body) {
    return errorResponse(404, "apk_not_found");
  }
  const headers = new Headers();
  headers.set("content-type", "application/vnd.android.package-archive");
  headers.set("cache-control", "no-store");
  headers.set("content-disposition", `attachment; filename="bokningsportal-kiosk-${targetVersion}.apk"`);
  return new Response(apkObject.body, { status: 200, headers });
};

const handleKioskRfidLogin = async (request: Request, env: Env) => {
  const auth = await requireScreenAuth(request, env);
  if ("error" in auth) return auth.error;

  const body = await getJsonBody(request);
  const abuseBlock = await enforceRfidAbusePolicy(request, env, body as Record<string, unknown>);
  if (abuseBlock) {
    return abuseBlock;
  }

  const uidCandidates = getRfidLookupCandidates(body?.uid);
  const tenantIdFromBody = String(body?.tenant_id || "").trim();
  if (!uidCandidates.length) {
    await recordRfidAuthFailure(env, request);
    return errorResponse(401, "invalid_rfid");
  }
  if (tenantIdFromBody && tenantIdFromBody !== String(auth.screen.tenant_id)) {
    await recordRfidAuthFailure(env, request);
    return errorResponse(403, "rfid_not_allowed_for_screen");
  }

  const rfidContext = (await env.DB
    .prepare(
      `SELECT
         rt.tenant_id AS tag_tenant_id,
         u.id AS user_id,
         u.apartment_id AS user_apartment_id,
         u.is_admin AS user_is_admin
       FROM rfid_tags rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.uid IN (${buildInClausePlaceholders(uidCandidates.length)})
         AND rt.is_active = 1
         AND rt.tenant_id = ?
       LIMIT 1`
    )
    .bind(...uidCandidates, auth.screen.tenant_id)
    .first()) as any;
  if (!rfidContext) {
    await recordRfidAuthFailure(env, request);
    return errorResponse(401, "invalid_rfid");
  }

  const existingAccessToken = await env.DB
    .prepare("SELECT token FROM access_tokens WHERE user_id = ? LIMIT 1")
    .bind(rfidContext.user_id)
    .first();
  const accessToken = (existingAccessToken?.token as string | undefined) || crypto.randomUUID();
  if (!existingAccessToken) {
    await env.DB
      .prepare(
        `INSERT INTO access_tokens (token, tenant_id, user_id, created_at, source)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'kiosk')`
      )
      .bind(accessToken, rfidContext.tag_tenant_id, rfidContext.user_id)
      .run();
  } else {
    await env.DB
      .prepare("UPDATE access_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?")
      .bind(accessToken)
      .run();
  }

  const ts = getTimestampIso(env);
  await recordScreenLastSeen(env, String(auth.screen.id), ts);

  await recordRfidAuthSuccess(env, request);

  return json({
    booking_url: `/user/${accessToken}`,
    user: {
      id: rfidContext.user_id,
      apartment_id: rfidContext.user_apartment_id,
      is_admin: Number(rfidContext.user_is_admin) === 1,
    },
    tenant: { id: auth.screen.tenant_id, name: auth.screen.tenant_name },
  });
};

const handleHealth = async (_request: Request, env: Env) => {
  try {
    await env.DB.prepare("SELECT 1 AS ok").bind().first();
    return json({ ok: true, db: "ok" });
  } catch {
    return json({ ok: false, db: "error" }, { status: 503 });
  }
};
const handleSession = async (request: Request, env: Env) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  if (auth.tenant.is_setup_complete === 0) {
    return errorResponse(401, "setup_incomplete");
  }
  return withTenantConditionalJson(request, auth.tenant, {
    tenant: { id: auth.tenant.id, name: auth.tenant.name },
    user: {
      id: auth.user.id,
      apartment_id: auth.user.apartment_id,
      is_admin: auth.user.is_admin === 1,
      is_account_owner: auth.user.is_account_owner === 1,
    },
  });
};

const handleServices = async (request: Request, env: Env) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  const services = await buildServicesForAuth(env.DB, auth, env);
  return withTenantConditionalJson(request, auth.tenant, { services });
};

const handleCurrentBookings = async (request: Request, env: Env) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  const bookings = await getCurrentBookingsForUser(env.DB, auth.user.id);
  return withTenantConditionalJson(request, auth.tenant, { bookings });
};

const handleBootstrap = async (request: Request, env: Env) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  if (auth.tenant.is_setup_complete === 0) {
    return errorResponse(401, "setup_incomplete");
  }
  const [services, bookings] = await Promise.all([
    buildServicesForAuth(env.DB, auth, env),
    getCurrentBookingsForUser(env.DB, auth.user.id),
  ]);
  return withTenantConditionalJson(request, auth.tenant, {
    tenant: { id: auth.tenant.id, name: auth.tenant.name },
    user: {
      id: auth.user.id,
      apartment_id: auth.user.apartment_id,
      is_admin: auth.user.is_admin === 1,
      is_account_owner: auth.user.is_account_owner === 1,
    },
    services,
    bookings,
  });
};

const handleCreateBooking = async (request: Request, env: Env) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  const bookingObjectId = body?.booking_object_id;
  const startTime = body?.start_time;
  const endTime = body?.end_time;
  const action = String(body?.action || "book").trim();
  const bookingForUserId = String(body?.booking_for_user_id || "").trim();
  if (!bookingObjectId || !startTime || !endTime) {
    return errorResponse(400, "invalid_payload");
  }
  const isBlockRequest = action === "block";
  if (isBlockRequest && auth.user.is_admin !== 1) {
    return errorResponse(403, "forbidden");
  }
  if (bookingForUserId && auth.user.is_admin !== 1) {
    return errorResponse(403, "forbidden");
  }
  const bookingObject = await env.DB.prepare("SELECT * FROM booking_objects WHERE id = ?").bind(bookingObjectId).first();
  if (!bookingObject) return errorResponse(404, "not_found");
  if (String(bookingObject.tenant_id) !== String(auth.tenant.id)) {
    return errorResponse(403, "forbidden");
  }
  if (auth.user.is_admin !== 1) {
    const permissionRows = await env.DB
      .prepare("SELECT mode, scope, value FROM booking_object_permissions WHERE booking_object_id = ?")
      .bind(bookingObjectId)
      .all();
    const userGroups = permissionRows.results.length ? await listUserGroups(env.DB, auth.user.id) : [];
    if (!canUserAccessWithPermissions(permissionRows.results as any[], auth.user, userGroups)) {
      return errorResponse(403, "forbidden");
    }
  }
  let effectiveUserId = auth.user.id as string;
  if (!isBlockRequest && bookingForUserId) {
    const targetUser = await env.DB
      .prepare("SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1")
      .bind(bookingForUserId, auth.tenant.id)
      .first();
    if (!targetUser) {
      return errorResponse(404, "target_user_not_found");
    }
    effectiveUserId = String(targetUser.id);
  }
  const bypassMaxBookingsLimit =
    isBlockRequest || (auth.user.is_admin === 1 && !isBlockRequest && Boolean(bookingForUserId));
  const nowIso = new Date().toISOString();
  const bookingObjectGroupId = String(bookingObject.group_id || "").trim();
  const groupLimitsById = bookingObjectGroupId
    ? await getBookingGroupMaxBookings(env.DB, String(bookingObject.tenant_id), [bookingObjectGroupId])
    : new Map<string, number>();
  const maxBookingsConfig = getEffectiveMaxBookingsConfigFromGroupLimits(bookingObject, groupLimitsById);
  const maxBookingsLimit = maxBookingsConfig.limit;
  if (maxBookingsLimit !== null && !bypassMaxBookingsLimit) {
    const activeCount =
      maxBookingsConfig.scope === "group" && bookingObjectGroupId
        ? Number(
            (
              await getActiveBookingCountsByGroup(
                env.DB,
                effectiveUserId,
                String(bookingObject.tenant_id),
                nowIso,
                [bookingObjectGroupId]
              )
            ).get(bookingObjectGroupId) || 0
          )
        : Number((await getActiveBookingCountsByObject(env.DB, effectiveUserId, nowIso, [String(bookingObjectId)])).get(String(bookingObjectId)) || 0);
    if (activeCount >= maxBookingsLimit) {
      return errorResponse(409, "max_bookings_reached");
    }
  }
  const overlap = await env.DB
    .prepare(
      `SELECT COUNT(1) as count
       FROM bookings
       WHERE booking_object_id = ?
         AND cancelled_at IS NULL
         AND NOT (end_time <= ? OR start_time >= ?)`
    )
    .bind(bookingObjectId, startTime, endTime)
    .first();
  if ((overlap?.count as number) > 0) {
    return errorResponse(409, "conflict");
  }
  const blockOverlap = await env.DB
    .prepare(
      `SELECT COUNT(1) as count
       FROM booking_blocks
       WHERE booking_object_id = ?
         AND NOT (end_time <= ? OR start_time >= ?)`
    )
    .bind(bookingObjectId, startTime, endTime)
    .first();
  if ((blockOverlap?.count as number) > 0) {
    return errorResponse(409, "blocked");
  }
  const start = new Date(startTime);
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + (bookingObject.window_min_days as number));
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + (bookingObject.window_max_days as number));
  if (start < minDate || start > maxDate) {
    return errorResponse(409, "outside_booking_window");
  }
  const isWeekend = [0, 6].includes(start.getUTCDay());
  const priceCents = isWeekend ? (bookingObject.price_weekend_cents as number) : (bookingObject.price_weekday_cents as number);
  if (isBlockRequest) {
    const blockId = crypto.randomUUID();
    await env.DB
      .prepare(
        `INSERT INTO booking_blocks (id, tenant_id, booking_object_id, start_time, end_time, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(
        blockId,
        bookingObject.tenant_id,
        bookingObjectId,
        startTime,
        endTime,
        String(body?.block_reason || "").trim() || null,
        auth.user.id
      )
      .run();
    return json({ booking_block_id: blockId, kind: "block" });
  }
  const bookingId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO bookings (id, tenant_id, user_id, booking_object_id, start_time, end_time, price_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(bookingId, bookingObject.tenant_id, effectiveUserId, bookingObjectId, startTime, endTime, priceCents).run();
  return json({ booking_id: bookingId, kind: "booking" });
};

const handleCancelBooking = async (request: Request, env: Env, bookingId: string) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  const booking = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(bookingId).first();
  if (booking) {
    if (auth.user.is_admin !== 1 && booking.user_id !== auth.user.id) {
      return errorResponse(403, "forbidden");
    }
    await env.DB.prepare("UPDATE bookings SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ?").bind(bookingId).run();
    return new Response(null, { status: 204 });
  }
  const block = await env.DB.prepare("SELECT * FROM booking_blocks WHERE id = ?").bind(bookingId).first();
  if (!block) return errorResponse(404, "not_found");
  if (auth.user.is_admin !== 1) {
    return errorResponse(403, "forbidden");
  }
  if (String(block.tenant_id) !== String(auth.tenant.id)) {
    return errorResponse(403, "forbidden");
  }
  await env.DB.prepare("DELETE FROM booking_blocks WHERE id = ?").bind(bookingId).run();
  return new Response(null, { status: 204 });
};

const handleBookableUsers = async (request: Request, env: Env) => {
  const auth = await requireAdminUser(request, env);
  if ("error" in auth) return auth.error;
  const users = await listBookableUsersForTenant(env.DB, auth.tenant.id);
  return withTenantConditionalJson(request, auth.tenant, { users });
};

const handleCalendarDownload = async (request: Request, env: Env, url: URL) => {
  const bookingId = url.searchParams.get("booking_id");
  if (!bookingId) {
    return errorResponse(400, "invalid_payload");
  }
  const booking = (await env.DB
    .prepare(
      `SELECT
         b.id,
         b.start_time,
         b.end_time,
         b.cancelled_at,
         b.tenant_id,
         t.last_changed_at AS tenant_last_changed_at,
         bo.name AS booking_object_name,
         u.apartment_id AS booked_user_apartment_id
       FROM bookings b
       JOIN tenants t ON t.id = b.tenant_id
       JOIN booking_objects bo ON bo.id = b.booking_object_id
       JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`
    )
    .bind(bookingId)
    .first()) as any;
  if (!booking || booking.cancelled_at) {
    return errorResponse(404, "not_found");
  }
  const ics = buildBookingIcs({
    id: booking.id as string,
    startTime: booking.start_time as string,
    endTime: booking.end_time as string,
    serviceName: booking.booking_object_name as string,
    apartmentId: booking.booked_user_apartment_id as string,
  });
  if (!ics) {
    return errorResponse(500, "calendar_generation_failed");
  }
  const fileName = `bokning-${booking.id}.ics`;
  const tenantEtag: TenantEtagSource = {
    id: String(booking.tenant_id),
    last_changed_at: String(booking.tenant_last_changed_at ?? ""),
  };
  return withTenantConditionalBody(
    request,
    tenantEtag,
    "text/calendar; charset=utf-8",
    () => ics,
    { "content-disposition": `attachment; filename="${fileName}"` }
  );
};

const handleAvailabilityMonth = async (request: Request, env: Env, url: URL) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  const bookingObjectId = url.searchParams.get("booking_object_id");
  const month = url.searchParams.get("month");
  if (!bookingObjectId || !month) return errorResponse(400, "invalid_payload");
  await maybeDelayAvailability(env);
  const nowUtc = getUtcNowFromEnv(env);
  const days = await buildMonthAvailability(env.DB, auth.user, bookingObjectId, month, nowUtc);
  if (!days) return errorResponse(404, "not_found");
  return withTenantConditionalJson(request, auth.tenant, { days });
};

const handleAvailabilityWeek = async (request: Request, env: Env, url: URL) => {
  const auth = await requireAuth(request, env);
  if ("error" in auth) return auth.error;
  const bookingObjectId = url.searchParams.get("booking_object_id");
  const weekStart = url.searchParams.get("week_start");
  if (!bookingObjectId || !weekStart) return errorResponse(400, "invalid_payload");
  await maybeDelayAvailability(env);
  const nowUtc = getUtcNowFromEnv(env);
  const days = await buildWeekAvailability(env.DB, auth.user, bookingObjectId, weekStart, nowUtc);
  if (!days) return errorResponse(404, "not_found");
  return withTenantConditionalJson(request, auth.tenant, { days });
};

const handleAdminUsers = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const users = await env.DB
    .prepare(
      `SELECT
         u.id,
         u.apartment_id,
         u.house,
         u.is_admin,
         u.is_active,
         GROUP_CONCAT(DISTINCT ag.name) AS group_names,
         GROUP_CONCAT(DISTINCT CASE WHEN rt.is_active = 1 THEN rt.uid END) AS rfid_tags
       FROM users u
       LEFT JOIN user_access_groups uag ON uag.user_id = u.id
       LEFT JOIN access_groups ag ON ag.id = uag.group_id
       LEFT JOIN rfid_tags rt ON rt.user_id = u.id
       WHERE u.tenant_id = ?
       GROUP BY u.id, u.apartment_id, u.house, u.is_admin, u.is_active
       ORDER BY u.apartment_id ASC`
    )
    .bind(auth.tenant.id)
    .all();
  const result = users.results.map((user: any) => ({
    id: user.id,
    apartment_id: user.apartment_id,
    house: user.house || "",
    groups: user.group_names
      ? String(user.group_names)
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : [],
    rfid_tags: user.rfid_tags
      ? String(user.rfid_tags)
          .split(",")
          .filter((uid) => uid.length > 0)
      : [],
    rfid: user.rfid_tags ? String(user.rfid_tags).split(",").filter((uid) => uid.length > 0)[0] || "" : "",
    is_admin: user.is_admin === 1,
    is_active: user.is_active === 1,
  }));
  return withTenantConditionalJson(request, auth.tenant, { users: result });
};

const getFrontendOriginForLoginLinks = (request: Request, env: Env, overrideBase?: string | null) => {
  const requestUrl = new URL(request.url);
  const trimmed = overrideBase?.trim();
  const paramBase = trimmed ?? requestUrl.searchParams.get("frontend_base_url")?.trim() ?? null;
  const originHeader = request.headers.get("origin")?.trim();
  const envBase = String(env.FRONTEND_BASE_URL || "").trim();
  let frontendOrigin = requestUrl.origin;
  for (const candidate of [paramBase, originHeader, envBase]) {
    if (!candidate) continue;
    try {
      frontendOrigin = new URL(candidate).origin;
      break;
    } catch {
      /* try next */
    }
  }
  return frontendOrigin.replace(/\/$/, "");
};

const ensureUserAccessToken = async (env: Env, tenantId: string, userId: string, source: string) => {
  const existing = await env.DB.prepare("SELECT token FROM access_tokens WHERE user_id = ? LIMIT 1").bind(userId).first();
  if (existing?.token) {
    return String(existing.token);
  }
  const token = crypto.randomUUID();
  await env.DB
    .prepare(
      `INSERT INTO access_tokens (token, tenant_id, user_id, created_at, source)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)`
    )
    .bind(token, tenantId, userId, source)
    .run();
  return token;
};

const handleAdminUsersLoginQrExport = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;

  const origin = getFrontendOriginForLoginLinks(request, env);

  const userRows = await env.DB
    .prepare(
      `SELECT u.id, u.apartment_id, u.house
       FROM users u
       WHERE u.tenant_id = ? AND u.is_active = 1
       ORDER BY u.apartment_id ASC`
    )
    .bind(auth.tenant.id)
    .all();

  const rows: {
    user_id: string;
    apartment_id: string;
    house: string;
    login_path: string;
    login_url: string;
  }[] = [];

  for (const u of userRows.results as any[]) {
    const userId = u.id as string;
    const token = await ensureUserAccessToken(env, auth.tenant.id, userId, "admin_qr_pdf");
    const loginPath = `/user/${token}`;
    rows.push({
      user_id: userId,
      apartment_id: String(u.apartment_id || ""),
      house: String(u.house || "").trim(),
      login_path: loginPath,
      login_url: `${origin}${loginPath}`,
    });
  }

  return withTenantConditionalJson(request, auth.tenant, {
    tenant_name: String(auth.tenant.name || ""),
    rows,
  });
};

const handleAdminUserLoginQr = async (request: Request, env: Env, userId: string) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const row = await env.DB
    .prepare("SELECT id, apartment_id, house FROM users WHERE id = ? AND tenant_id = ? LIMIT 1")
    .bind(userId, auth.tenant.id)
    .first();
  if (!row) {
    return errorResponse(404, "not_found");
  }
  const origin = getFrontendOriginForLoginLinks(request, env);
  const token = await ensureUserAccessToken(env, auth.tenant.id, userId, "admin_user_qr");
  const loginPath = `/user/${token}`;
  return withTenantConditionalJson(request, auth.tenant, {
    login_url: `${origin}${loginPath}`,
    login_path: loginPath,
    apartment_id: String(row.apartment_id || ""),
    house: String(row.house || "").trim(),
    tenant_name: String(auth.tenant.name || ""),
  });
};

const handleAdminUserLoginQrRotate = async (request: Request, env: Env, userId: string) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const row = await env.DB
    .prepare("SELECT id, apartment_id, house FROM users WHERE id = ? AND tenant_id = ? LIMIT 1")
    .bind(userId, auth.tenant.id)
    .first();
  if (!row) {
    return errorResponse(404, "not_found");
  }
  const body = await getJsonBody(request);
  const origin = getFrontendOriginForLoginLinks(request, env, body?.frontend_base_url);
  await env.DB.prepare("DELETE FROM access_tokens WHERE user_id = ?").bind(userId).run();
  const token = crypto.randomUUID();
  await env.DB
    .prepare(
      `INSERT INTO access_tokens (token, tenant_id, user_id, created_at, source)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'admin_rotate_qr')`
    )
    .bind(token, auth.tenant.id, userId)
    .run();
  const loginPath = `/user/${token}`;
  return json({
    login_url: `${origin}${loginPath}`,
    login_path: loginPath,
    apartment_id: String(row.apartment_id || ""),
    house: String(row.house || "").trim(),
    tenant_name: String(auth.tenant.name || ""),
  });
};

const handleAdminUpdateUser = async (request: Request, env: Env, userId: string) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  if (!body) return errorResponse(400, "invalid_payload");
  const apartmentTaken = await env.DB
    .prepare("SELECT id FROM users WHERE tenant_id = ? AND apartment_id = ? AND id != ? LIMIT 1")
    .bind(auth.tenant.id, body.apartment_id, userId)
    .first();
  if (apartmentTaken) {
    return errorResponse(409, "apartment_id_taken");
  }
  await env.DB.prepare(
    `UPDATE users SET apartment_id = ?, house = ?, is_admin = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(body.apartment_id, body.house, body.is_admin ? 1 : 0, body.is_active ? 1 : 0, userId).run();

  const groupNames = getUserGroupNamesFromPayload(body);
  const groupIdsByName = await ensureAccessGroupIdsByNames(env.DB, auth.tenant.id, groupNames);
  const groupIds = groupNames
    .map((name) => groupIdsByName.get(name))
    .filter((id): id is string => Boolean(id));
  const { tags: rfidTags, invalidTags } = getValidatedUserRfidTagsFromPayload(body);
  if (invalidTags.length) {
    const sample = invalidTags.slice(0, 3).join(",");
    return errorResponse(400, `invalid_rfid_format:${sample}`);
  }
  await Promise.all([
    replaceUserAccessGroups(env.DB, userId, groupIds),
    replaceUserRfidTags(env.DB, auth.tenant.id, userId, rfidTags),
  ]);
  return json({ id: userId });
};

const handleAdminAccessGroups = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  if (request.method === "GET") {
    const groups = await listAccessGroups(env.DB, auth.tenant.id);
    return withTenantConditionalJson(request, auth.tenant, { groups });
  }
  const body = await getJsonBody(request);
  if (!body?.name) return errorResponse(400, "invalid_payload");
  const group = await createAccessGroup(env.DB, auth.tenant.id, body.name);
  return json({ group });
};

const handleAdminCreateUser = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  if (!body?.apartment_id) return errorResponse(400, "invalid_payload");

  const apartmentTaken = await env.DB
    .prepare("SELECT id FROM users WHERE tenant_id = ? AND apartment_id = ? LIMIT 1")
    .bind(auth.tenant.id, body.apartment_id)
    .first();
  if (apartmentTaken) {
    return errorResponse(409, "apartment_id_taken");
  }

  const userId = `user-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO users (id, tenant_id, apartment_id, house, is_active, is_admin)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    userId,
    auth.tenant.id,
    body.apartment_id,
    body.house || null,
    body.is_active === false ? 0 : 1,
    body.is_admin ? 1 : 0
  ).run();

  const groupNames = getUserGroupNamesFromPayload(body);
  const groupIdsByName = await ensureAccessGroupIdsByNames(env.DB, auth.tenant.id, groupNames);
  const groupIds = groupNames
    .map((name) => groupIdsByName.get(name))
    .filter((id): id is string => Boolean(id));
  const { tags: rfidTags, invalidTags } = getValidatedUserRfidTagsFromPayload(body);
  if (invalidTags.length) {
    const sample = invalidTags.slice(0, 3).join(",");
    return errorResponse(400, `invalid_rfid_format:${sample}`);
  }
  await Promise.all([
    replaceUserAccessGroups(env.DB, userId, groupIds),
    replaceUserRfidTags(env.DB, auth.tenant.id, userId, rfidTags),
  ]);

  return json({ id: userId });
};

const handleAdminDeleteUser = async (request: Request, env: Env, userId: string, url: URL) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const deleteBookings = url.searchParams.get("delete_bookings") === "true";
  const hasBookings = await userHasBookings(env.DB, userId);
  if (hasBookings && !deleteBookings) {
    return errorResponse(409, "user_has_bookings");
  }
  if (hasBookings && deleteBookings) {
    await deleteUserBookings(env.DB, userId);
  }
  await env.DB.prepare("DELETE FROM user_access_groups WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM rfid_tags WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ? AND tenant_id = ?")
    .bind(userId, auth.tenant.id)
    .run();
  return json({ id: userId, deleted: true });
};

const handleAdminBookingObjects = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const rows = await env.DB
    .prepare(
      `SELECT
         bo.*,
         bop.mode AS permission_mode,
         bop.scope AS permission_scope,
         bop.value AS permission_value
       FROM booking_objects bo
       LEFT JOIN booking_object_permissions bop ON bop.booking_object_id = bo.id
       WHERE bo.tenant_id = ?
       ORDER BY bo.name COLLATE NOCASE ASC`
    )
    .bind(auth.tenant.id)
    .all();
  const objectsById = new Map<string, any>();
  for (const row of rows.results as any[]) {
    if (!objectsById.has(row.id)) {
      const { permission_mode: _mode, permission_scope: _scope, permission_value: _value, ...bookingObject } = row;
      objectsById.set(row.id, {
        ...bookingObject,
        allowHouses: [],
        allowGroups: [],
        allowApartments: [],
        denyHouses: [],
        denyGroups: [],
        denyApartments: [],
      });
    }
    if (!row.permission_mode || !row.permission_scope) {
      continue;
    }
    const target = objectsById.get(row.id)!;
    const mode = row.permission_mode as string;
    const scope = row.permission_scope as string;
    const value = row.permission_value as string;
    if (mode === "allow" && scope === "house") target.allowHouses.push(value);
    if (mode === "allow" && scope === "group") target.allowGroups.push(value);
    if (mode === "allow" && scope === "apartment") target.allowApartments.push(value);
    if (mode === "deny" && scope === "house") target.denyHouses.push(value);
    if (mode === "deny" && scope === "group") target.denyGroups.push(value);
    if (mode === "deny" && scope === "apartment") target.denyApartments.push(value);
  }
  const objects = Array.from(objectsById.values());
  return withTenantConditionalJson(request, auth.tenant, { booking_objects: objects });
};

const handleAdminDeactivateBookingObject = async (request: Request, env: Env, bookingObjectId: string, url: URL) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const confirm = url.searchParams.get("confirm") === "true";
  const nowIso = new Date().toISOString();
  const hasFuture = await hasFutureBookings(env.DB, bookingObjectId, nowIso);
  if (hasFuture && !confirm) {
    return errorResponse(409, "booking_object_has_future_bookings");
  }
  if (hasFuture) {
    await cancelFutureBookings(env.DB, bookingObjectId, nowIso);
  }
  await env.DB.prepare(
    "UPDATE booking_objects SET is_active = 0 WHERE id = ? AND tenant_id = ?"
  ).bind(bookingObjectId, auth.tenant.id).run();
  return json({ id: bookingObjectId, deactivated: true, cancelled_future: hasFuture });
};

const handleAdminCreateBookingObject = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  if (!body) return errorResponse(400, "invalid_payload");
  const bookingObjectValidation = validateAdminBookingObjectBody(body);
  if (bookingObjectValidation) return errorResponse(400, bookingObjectValidation);
  const maxBookingsOverride = parseRequiredPositiveInt(body.max_bookings_override);
  if (maxBookingsOverride === null) return errorResponse(400, "invalid_max_bookings");
  const id = `obj-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO booking_objects (
      id, tenant_id, name, description, booking_type, slot_duration_minutes, full_day_start_time, full_day_end_time,
      time_slot_start_time, time_slot_end_time,
      window_min_days, window_max_days, price_weekday_cents, price_weekend_cents,
      is_active, group_id, max_bookings_override
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    auth.tenant.id,
    body.name,
    body.description || null,
    body.booking_type,
    body.slot_duration_minutes || null,
    normalizeClockTime(body.full_day_start_time),
    normalizeClockTime(body.full_day_end_time),
    normalizeClockTime(body.time_slot_start_time, "08:00"),
    normalizeClockTime(body.time_slot_end_time, "20:00"),
    body.window_min_days || 0,
    body.window_max_days || 30,
    body.price_weekday_cents || 0,
    body.price_weekend_cents || 0,
    body.is_active ? 1 : 0,
    body.group_id || null,
    maxBookingsOverride
  ).run();
  const permissions = getBookingObjectPermissionsFromPayload(body);
  await replaceBookingObjectPermissions(env.DB, id, permissions);
  return json({ id });
};

const handleAdminUpdateBookingObject = async (request: Request, env: Env, objectId: string) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  if (!body) return errorResponse(400, "invalid_payload");
  const bookingObjectUpdateValidation = validateAdminBookingObjectBody(body);
  if (bookingObjectUpdateValidation) return errorResponse(400, bookingObjectUpdateValidation);
  const maxBookingsOverride = parseRequiredPositiveInt(body.max_bookings_override);
  if (maxBookingsOverride === null) return errorResponse(400, "invalid_max_bookings");
  await env.DB.prepare(
    `UPDATE booking_objects SET
      name = ?, description = ?, booking_type = ?, slot_duration_minutes = ?, full_day_start_time = ?, full_day_end_time = ?,
      time_slot_start_time = ?, time_slot_end_time = ?,
      window_min_days = ?, window_max_days = ?, price_weekday_cents = ?, price_weekend_cents = ?,
      is_active = ?, group_id = ?, max_bookings_override = ?
     WHERE id = ?`
  ).bind(
    body.name,
    body.description || null,
    body.booking_type,
    body.slot_duration_minutes || null,
    normalizeClockTime(body.full_day_start_time),
    normalizeClockTime(body.full_day_end_time),
    normalizeClockTime(body.time_slot_start_time, "08:00"),
    normalizeClockTime(body.time_slot_end_time, "20:00"),
    body.window_min_days || 0,
    body.window_max_days || 30,
    body.price_weekday_cents || 0,
    body.price_weekend_cents || 0,
    body.is_active ? 1 : 0,
    body.group_id || null,
    maxBookingsOverride,
    objectId
  ).run();
  const permissions = getBookingObjectPermissionsFromPayload(body);
  await replaceBookingObjectPermissions(env.DB, objectId, permissions);
  return json({ id: objectId });
};

const handleAdminBookingGroups = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const rows = await env.DB.prepare("SELECT * FROM booking_groups WHERE tenant_id = ?").bind(auth.tenant.id).all();
  return withTenantConditionalJson(request, auth.tenant, { booking_groups: rows.results });
};

const handleAdminCreateBookingGroup = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  if (!body?.name) return errorResponse(400, "invalid_payload");
  const maxBookings = parseRequiredPositiveInt(body.max_bookings);
  if (maxBookings === null) return errorResponse(400, "invalid_max_bookings");
  const id = `group-${crypto.randomUUID()}`;
  await env.DB.prepare("INSERT INTO booking_groups (id, tenant_id, name, max_bookings) VALUES (?, ?, ?, ?)")
    .bind(id, auth.tenant.id, body.name, maxBookings)
    .run();
  return json({ id });
};

const handleImportRulesGet = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const rules = await env.DB.prepare("SELECT * FROM user_import_rules WHERE tenant_id = ?").bind(auth.tenant.id).first();
  return withTenantConditionalJson(request, auth.tenant, { rules: rules || null });
};

const handleImportRulesPut = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  if (!body) return errorResponse(400, "invalid_payload");
  const asText = (value: unknown, fallback = "") =>
    value === undefined || value === null ? fallback : String(value);
  const params = [
    auth.tenant?.id ?? "",
    asText(body.identity_field, "OrgGrupp"),
    asText(body.groups_field, ""),
    asText(body.rfid_field, ""),
    asText(body.active_field, ""),
    asText(body.house_field, ""),
    asText(body.apartment_field, ""),
    asText(body.house_regex, ""),
    asText(body.apartment_regex, ""),
    asText(body.group_separator, "|"),
    asText(body.admin_groups, ""),
  ];
  await env.DB.prepare(
    `INSERT INTO user_import_rules (
      tenant_id, identity_field, groups_field, rfid_field, active_field,
      house_field, apartment_field, house_regex, apartment_regex, group_separator, admin_groups
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET
      identity_field = excluded.identity_field,
      groups_field = excluded.groups_field,
      rfid_field = excluded.rfid_field,
      active_field = excluded.active_field,
      house_field = excluded.house_field,
      apartment_field = excluded.apartment_field,
      house_regex = excluded.house_regex,
      apartment_regex = excluded.apartment_regex,
      group_separator = excluded.group_separator,
      admin_groups = excluded.admin_groups,
      updated_at = CURRENT_TIMESTAMP`
  ).bind(...params).run();
  return json({ status: "ok" });
};

const detectCsvDelimiter = (line: string) => {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const delimiter of candidates) {
    const count = line.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
};

const parseCsv = (csvText: string) => {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const delimiter = detectCsvDelimiter(lines[0] || "");
  const headers = lines[0]?.split(delimiter).map((h) => h.trim()) || [];
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(delimiter).map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] || "";
    });
    return row;
  });
  return { headers, rows };
};

const applyRegex = (value: string, regexString?: string) => {
  if (!regexString) return "";
  try {
    const regex = new RegExp(regexString);
    const match = regex.exec(value);
    if (!match) return "";
    return match.length > 1 ? match.slice(1).join("-") : match[0];
  } catch {
    return "";
  }
};

const parseActiveValue = (value: string) => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return true;
  if (["1", "av", "inaktiv", "inactive", "false", "nej", "no"].includes(normalized)) return false;
  if (["0", "på", "pa", "aktiv", "active", "true", "ja", "yes"].includes(normalized)) return true;
  return true;
};

const deriveAdminApartmentId = (identity: string) => {
  const base = (identity || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  let hash = 0;
  for (let i = 0; i < identity.length; i += 1) {
    hash = (hash * 31 + identity.charCodeAt(i)) >>> 0;
  }
  const suffix = hash.toString(16).slice(0, 8);
  return `admin-${base || "user"}-${suffix}`;
};

const buildImportPreview = async (db: D1Database, tenantId: string, csvText: string, rules: any) => {
  const { headers, rows } = parseCsv(csvText);
  const users = await db.prepare("SELECT * FROM users WHERE tenant_id = ?").bind(tenantId).all();
  const usersByApartment = new Map(users.results.map((u: any) => [u.apartment_id, u]));
  const userGroupRows = await db
    .prepare(
      `SELECT uag.user_id, ag.name
       FROM user_access_groups uag
       JOIN access_groups ag ON ag.id = uag.group_id
       WHERE ag.tenant_id = ?`
    )
    .bind(tenantId)
    .all();
  const groupsByUserId = new Map<string, string[]>();
  for (const row of userGroupRows.results as any[]) {
    const list = groupsByUserId.get(row.user_id) || [];
    list.push(String(row.name));
    groupsByUserId.set(String(row.user_id), list);
  }
  const rfidRows = await db
    .prepare("SELECT user_id, uid FROM rfid_tags WHERE tenant_id = ? AND is_active = 1")
    .bind(tenantId)
    .all();
  const rfidByUserId = new Map((rfidRows.results || []).map((row: any) => [row.user_id, row.uid]));
  const adminGroups = (rules.admin_groups || "").split("|").filter(Boolean);
  const groupSeparator = rules.group_separator || "|";

  const previewRows = rows.map((row: Record<string, string>) => {
    const identity = row[rules.identity_field] || "";
    const apartmentSource = rules.apartment_field ? row[rules.apartment_field] || "" : identity;
    const apartmentBase = apartmentSource || identity;
    const apartmentId = rules.apartment_regex
      ? applyRegex(apartmentBase, rules.apartment_regex)
      : apartmentBase;
    const houseSource = rules.house_field ? row[rules.house_field] || "" : "";
    const house = rules.house_regex
      ? applyRegex(houseSource, rules.house_regex)
      : houseSource;
    const groupsRaw = rules.groups_field ? row[rules.groups_field] || "" : "";
    const groups = groupsRaw ? groupsRaw.split(groupSeparator).map((g) => g.trim()).filter(Boolean) : [];
    const rawRfid = rules.rfid_field ? (row[rules.rfid_field] || "").trim() : "";
    const rfid = normalizeStoredRfid(rawRfid) || "";
    const admin = groups.some((g) => adminGroups.includes(g));
    const activeRaw = rules.active_field ? row[rules.active_field] || "" : "";
    const active = rules.active_field ? parseActiveValue(activeRaw) : true;
    if (!apartmentId && !admin) {
      return {
        identity,
        apartment_id: "",
        house,
        admin: false,
        active,
        groups,
        rfid,
        rfid_status: rfid ? "Ignoreras" : "Oförändrad",
        status: "Ignorerad",
      };
    }
    const resolvedApartmentId = apartmentId || deriveAdminApartmentId(identity);
    const existing = usersByApartment.get(resolvedApartmentId);
    const currentRfid = existing ? String(rfidByUserId.get(existing.id) || "") : "";
    const nextRfid = rfid || "";
    const currentGroups = existing ? (groupsByUserId.get(existing.id) || []).slice().sort() : [];
    const nextGroups = (groups || []).slice().sort();
    const groupsChanged = currentGroups.join("|") !== nextGroups.join("|");
    const rfidStatus = !existing
      ? nextRfid
        ? "Läggs till"
        : "Oförändrad"
      : currentRfid && !nextRfid
        ? "Tas bort"
        : !currentRfid && nextRfid
          ? "Läggs till"
          : currentRfid !== nextRfid
            ? "Byts ut"
            : "Oförändrad";
    const rfidChanged = rfidStatus !== "Oförändrad";
    const status = existing
      ? existing.house === house &&
        Boolean(existing.is_admin) === admin &&
        Boolean(existing.is_active) === active &&
        !groupsChanged &&
        !rfidChanged
        ? "Oförändrad"
        : "Uppdateras"
      : "Ny";
    return {
      identity,
      apartment_id: resolvedApartmentId,
      house,
      admin,
      active,
      groups,
      rfid,
      rfid_status: rfidStatus,
      status,
    };
  });

  const handledRows = previewRows.filter((row) => row.status !== "Ignorerad");
  const seen = new Set(handledRows.map((row) => row.apartment_id).filter(Boolean));
  const removed = users.results.filter((user: any) => !seen.has(user.apartment_id));
  const summary = {
    new: handledRows.filter((row) => row.status === "Ny").length,
    updated: handledRows.filter((row) => row.status === "Uppdateras").length,
    unchanged: handledRows.filter((row) => row.status === "Oförändrad").length,
    ignored: previewRows.filter((row) => row.status === "Ignorerad").length,
    removed: removed.length,
  };

  return { headers, rows: previewRows, summary };
};

const handleImportPreview = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  if (!body?.csv_text || !body?.rules) return errorResponse(400, "invalid_payload");
  const preview = await buildImportPreview(env.DB, auth.tenant.id, body.csv_text, body.rules);
  return json(preview);
};

const handleImportApply = async (request: Request, env: Env) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const body = await getJsonBody(request);
  if (!body?.csv_text || !body?.rules || !body?.actions) return errorResponse(400, "invalid_payload");
  const data = await buildImportPreview(env.DB, auth.tenant.id, body.csv_text, body.rules);
  const importRows = data.rows.filter((row: any) => row.status !== "Ignorerad" && (row.apartment_id || row.admin));
  const totalRows = importRows.length;
  const offset = Math.max(0, Number(body.offset || 0));
  const limit = Math.max(1, Number(body.limit || 100));
  const batchRows = importRows.slice(offset, offset + limit);
  const processedRows = Math.min(offset + batchRows.length, totalRows);
  const done = processedRows >= totalRows;
  const users = await env.DB.prepare("SELECT * FROM users WHERE tenant_id = ?").bind(auth.tenant.id).all();
  const usersByApartment = new Map(users.results.map((u: any) => [u.apartment_id, u]));
  const userGroupRows = await env.DB
    .prepare(
      `SELECT uag.user_id, ag.name
       FROM user_access_groups uag
       JOIN access_groups ag ON ag.id = uag.group_id
       WHERE ag.tenant_id = ?`
    )
    .bind(auth.tenant.id)
    .all();
  const groupsByUserId = new Map<string, string[]>();
  for (const row of userGroupRows.results as any[]) {
    const list = groupsByUserId.get(String(row.user_id)) || [];
    list.push(String(row.name));
    groupsByUserId.set(String(row.user_id), list);
  }
  const rfidRows = await env.DB
    .prepare("SELECT user_id, uid FROM rfid_tags WHERE tenant_id = ? AND is_active = 1")
    .bind(auth.tenant.id)
    .all();
  const rfidByUserId = new Map<string, string[]>();
  for (const row of rfidRows.results as any[]) {
    const list = rfidByUserId.get(String(row.user_id)) || [];
    list.push(String(row.uid));
    rfidByUserId.set(String(row.user_id), list);
  }
  const groupRows = await env.DB
    .prepare("SELECT id, name FROM access_groups WHERE tenant_id = ?")
    .bind(auth.tenant.id)
    .all();
  const groupIdByName = new Map<string, string>(
    (groupRows.results || []).map((row: any) => [String(row.name), String(row.id)])
  );
  const neededGroupNames = new Set<string>();
  for (const row of batchRows as any[]) {
    for (const groupName of row.groups || []) {
      const name = String(groupName || "").trim();
      if (name) neededGroupNames.add(name);
    }
  }
  const dbAny = env.DB as any;
  const groupCreateStatements: any[] = [];
  for (const name of neededGroupNames) {
    if (!groupIdByName.has(name)) {
      const id = `group-${crypto.randomUUID()}`;
      groupIdByName.set(name, id);
      groupCreateStatements.push(
        env.DB.prepare("INSERT INTO access_groups (id, tenant_id, name) VALUES (?, ?, ?)")
          .bind(id, auth.tenant.id, name)
      );
    }
  }
  if (groupCreateStatements.length) {
    await dbAny.batch(groupCreateStatements);
  }

  const pendingStatements: any[] = [];
  const flushPending = async () => {
    if (!pendingStatements.length) return;
    const chunk = pendingStatements.splice(0, pendingStatements.length);
    await dbAny.batch(chunk);
  };
  const pushStatement = async (statement: any) => {
    pendingStatements.push(statement);
    if (pendingStatements.length >= 200) {
      await flushPending();
    }
  };
  const syncUserGroups = async (userId: string, groupNames: string[]) => {
    await pushStatement(env.DB.prepare("DELETE FROM user_access_groups WHERE user_id = ?").bind(userId));
    for (const name of groupNames || []) {
      const groupId = groupIdByName.get(String(name));
      if (!groupId) continue;
      await pushStatement(
        env.DB.prepare("INSERT INTO user_access_groups (user_id, group_id) VALUES (?, ?)")
          .bind(userId, groupId)
      );
    }
  };
  const syncUserRfid = async (userId: string, rfid: string) => {
    await pushStatement(env.DB.prepare("UPDATE rfid_tags SET is_active = 0 WHERE user_id = ?").bind(userId));
    if (!rfid) {
      return;
    }
    await pushStatement(
      env.DB.prepare(
        `INSERT INTO rfid_tags (uid, tenant_id, user_id, is_active)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(tenant_id, uid) DO UPDATE SET user_id = excluded.user_id, is_active = 1`
      ).bind(rfid, auth.tenant.id, userId)
    );
  };
  const syncUserRfids = async (userId: string, rfids: string[]) => {
    await pushStatement(env.DB.prepare("UPDATE rfid_tags SET is_active = 0 WHERE user_id = ?").bind(userId));
    for (const uid of rfids || []) {
      if (!uid) continue;
      await pushStatement(
        env.DB.prepare(
          `INSERT INTO rfid_tags (uid, tenant_id, user_id, is_active)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(tenant_id, uid) DO UPDATE SET user_id = excluded.user_id, is_active = 1`
        ).bind(uid, auth.tenant.id, userId)
      );
    }
  };
  let added = 0;
  let updated = 0;
  let removed = 0;

  const mergedByApartment = new Map<
    string,
    { apartment_id: string; house: string; admin: boolean; active: boolean; groups: string[]; rfids: string[] }
  >();
  for (const row of batchRows as any[]) {
    const key = String(row.apartment_id || "");
    const prev = mergedByApartment.get(key);
    const nextGroups = new Set([...(prev?.groups || []), ...(row.groups || [])].filter(Boolean));
    const normalizedRowRfid = normalizeStoredRfid(row.rfid);
    const nextRfids = new Set([...(prev?.rfids || []), ...(normalizedRowRfid ? [normalizedRowRfid] : [])].filter(Boolean));
    mergedByApartment.set(key, {
      apartment_id: key,
      house: row.house || prev?.house || "",
      admin: Boolean(row.admin || prev?.admin),
      active: typeof row.active === "boolean" ? row.active : prev?.active ?? true,
      groups: Array.from(nextGroups),
      rfids: Array.from(nextRfids),
    });
  }

  for (const row of mergedByApartment.values()) {
    const existing = usersByApartment.get(row.apartment_id);
    if (!existing && body.actions.add_new) {
      const userId = `user-${crypto.randomUUID()}`;
      await pushStatement(
        env.DB.prepare(
          "INSERT INTO users (id, tenant_id, apartment_id, house, is_active, is_admin) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(userId, auth.tenant.id, row.apartment_id, row.house, row.active ? 1 : 0, row.admin ? 1 : 0)
      );
      await syncUserGroups(userId, row.groups || []);
      await syncUserRfids(userId, row.rfids || []);
      usersByApartment.set(row.apartment_id, {
        id: userId,
        apartment_id: row.apartment_id,
        house: row.house,
        is_active: row.active ? 1 : 0,
        is_admin: row.admin ? 1 : 0,
      });
      added += 1;
    }
    if (existing && body.actions.update_existing) {
      const currentGroups = (groupsByUserId.get(existing.id) || []).slice().sort();
      const nextGroups = (row.groups || []).slice().sort();
      const groupsChanged = currentGroups.join("|") !== nextGroups.join("|");
      const currentRfids = (rfidByUserId.get(existing.id) || []).slice().sort();
      const nextRfids = (row.rfids || []).slice().sort();
      const rfidsChanged = currentRfids.join("|") !== nextRfids.join("|");
      const shouldUpdate =
        existing.house !== row.house ||
        Boolean(existing.is_admin) !== row.admin ||
        Boolean(existing.is_active) !== row.active ||
        groupsChanged ||
        rfidsChanged;
      if (!shouldUpdate) {
        continue;
      }
      await pushStatement(
        env.DB.prepare(
          "UPDATE users SET house = ?, is_admin = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(row.house, row.admin ? 1 : 0, row.active ? 1 : 0, existing.id)
      );
      await syncUserGroups(existing.id, row.groups || []);
      await syncUserRfids(existing.id, row.rfids || []);
      updated += 1;
    }
  }

  if (body.actions.remove_missing && done) {
    const seen = new Set(importRows.map((row: any) => row.apartment_id));
    for (const user of users.results) {
      if (!seen.has((user as any).apartment_id)) {
        await pushStatement(env.DB.prepare("UPDATE users SET is_active = 0 WHERE id = ?").bind(user.id));
        removed += 1;
      }
    }
  }
  await flushPending();

  return json({
    status: "ok",
    applied: body.actions,
    summary: { added, updated, removed },
    progress: { processed: processedRows, total: totalRows, done },
  });
};

const handleReportCsv = async (request: Request, env: Env, url: URL) => {
  const auth = await requireAdmin(request, env);
  if ("error" in auth) return auth.error;
  const month = url.searchParams.get("month");
  const bookingObjectId = url.searchParams.get("booking_object_id");
  if (!month || !bookingObjectId) return errorResponse(400, "invalid_payload");
  const rows = await env.DB
    .prepare(
      `SELECT b.id, bo.name as booking_object_name, b.start_time, b.end_time, b.price_cents
       FROM bookings b
       JOIN booking_objects bo ON b.booking_object_id = bo.id
       WHERE b.tenant_id = ?
         AND b.booking_object_id = ?
         AND b.start_time LIKE ?`
    )
    .bind(auth.tenant.id, bookingObjectId, `${month}%`)
    .all();
  const header = "Bokningsobjekt,BokningID,Start,Slut,Pris";
  const body = rows.results
    .map((row: any) => `${row.booking_object_name},${row.id},${row.start_time},${row.end_time},${row.price_cents}`)
    .join("\n");
  return withTenantConditionalBody(request, auth.tenant, "text/csv; charset=utf-8", () => `${header}\n${body}`);
};

export const router = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");

  if (request.method === "GET" && path === "/api/health") return handleHealth(request, env);
  if (request.method === "POST" && path === "/api/rfid-login") return handleRfidLogin(request, env);
  if (request.method === "POST" && path === "/api/brf/register") return handleBrfRegister(request, env);
  if (request.method === "POST" && path === "/api/brf/setup/verify") return handleBrfSetupVerify(request, env);
  if (request.method === "POST" && path === "/api/brf/setup/resend-admin-link")
    return handleBrfSetupResendAdminLink(request, env);
  if (request.method === "POST" && path === "/api/brf/setup/complete") return handleBrfSetupComplete(request, env);
  if (request.method === "POST" && path === "/api/kiosk/access-token") return handleKioskAccessToken(request, env);
  if (request.method === "GET" && path === "/api/demo-links") return handleDemoLinks(request, env);
  if (request.method === "GET" && path === "/api/public-config") return handlePublicConfig(request, env);
  if (request.method === "GET" && path === "/api/kiosk/web-context") return handleKioskWebContext(request, env, url);

  if (request.method === "GET" && path === "/api/bootstrap") return handleBootstrap(request, env);
  if (request.method === "GET" && path === "/api/session") return handleSession(request, env);
  if (request.method === "GET" && path === "/api/services") return handleServices(request, env);
  if (request.method === "GET" && path === "/api/users") return handleBookableUsers(request, env);
  if (request.method === "GET" && path === "/api/bookings/current") return handleCurrentBookings(request, env);
  if (request.method === "GET" && path === "/api/calendar") return handleCalendarDownload(request, env, url);
  if (request.method === "POST" && path === "/api/bookings") return handleCreateBooking(request, env);
  if (request.method === "DELETE" && path.startsWith("/api/bookings/")) {
    return handleCancelBooking(request, env, path.split("/").pop() || "");
  }

  if (request.method === "GET" && path === "/api/availability/month") return handleAvailabilityMonth(request, env, url);
  if (request.method === "GET" && path === "/api/availability/week") return handleAvailabilityWeek(request, env, url);
  if (request.method === "POST" && path === "/api/kiosk/pairing/announce") return handleKioskPairingAnnounce(request, env);
  if (request.method === "POST" && path === "/api/kiosk/pairing/claim") return handleKioskPairingClaim(request, env);
  if (request.method === "GET" && path === "/api/kiosk/screen/status") return handleKioskScreenStatus(request, env);
  if (request.method === "GET" && path === "/api/kiosk/screen/apk") return handleKioskScreenApkDownload(request, env, url);
  if (request.method === "POST" && path === "/api/kiosk/rfid-login") return handleKioskRfidLogin(request, env);

  if (request.method === "GET" && path === "/api/admin/users/login-qr-export") return handleAdminUsersLoginQrExport(request, env);
  if (request.method === "GET" && path === "/api/admin/users") return handleAdminUsers(request, env);
  if (request.method === "POST" && path === "/api/admin/users") return handleAdminCreateUser(request, env);
  if (request.method === "GET" && path === "/api/admin/users/import/rules") return handleImportRulesGet(request, env);
  if (request.method === "PUT" && path === "/api/admin/users/import/rules") return handleImportRulesPut(request, env);
  if (request.method === "POST" && path === "/api/admin/users/import/preview") return handleImportPreview(request, env);
  if (request.method === "POST" && path === "/api/admin/users/import/apply") return handleImportApply(request, env);
  {
    const loginQrMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/login-qr$/);
    if (request.method === "GET" && loginQrMatch) {
      return handleAdminUserLoginQr(request, env, loginQrMatch[1]);
    }
    const rotateMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/login-qr\/rotate$/);
    if (request.method === "POST" && rotateMatch) {
      return handleAdminUserLoginQrRotate(request, env, rotateMatch[1]);
    }
  }
  if (request.method === "DELETE" && path.startsWith("/api/admin/users/")) {
    return handleAdminDeleteUser(request, env, path.split("/").pop() || "", url);
  }
  if (request.method === "PUT" && path.startsWith("/api/admin/users/")) {
    return handleAdminUpdateUser(request, env, path.split("/").pop() || "");
  }
  if (request.method === "GET" && path === "/api/admin/access-groups") return handleAdminAccessGroups(request, env);
  if (request.method === "POST" && path === "/api/admin/access-groups") return handleAdminAccessGroups(request, env);
  if (request.method === "GET" && path === "/api/admin/booking-objects") return handleAdminBookingObjects(request, env);
  if (request.method === "POST" && path === "/api/admin/booking-objects") return handleAdminCreateBookingObject(request, env);
  if (request.method === "POST" && path.startsWith("/api/admin/booking-objects/") && path.endsWith("/deactivate")) {
    const bookingObjectId = path.split("/").slice(-2)[0];
    return handleAdminDeactivateBookingObject(request, env, bookingObjectId, url);
  }
  if (request.method === "PUT" && path.startsWith("/api/admin/booking-objects/")) {
    return handleAdminUpdateBookingObject(request, env, path.split("/").pop() || "");
  }
  if (request.method === "GET" && path === "/api/admin/booking-groups") return handleAdminBookingGroups(request, env);
  if (request.method === "POST" && path === "/api/admin/booking-groups") return handleAdminCreateBookingGroup(request, env);
  if (request.method === "GET" && path === "/api/admin/booking-screens") return handleAdminBookingScreens(request, env);
  if (request.method === "POST" && path === "/api/admin/booking-screens/order") return handleAdminOrderBookingScreens(request, env);
  if (request.method === "POST" && path === "/api/admin/booking-screens/pair") return handleAdminPairBookingScreen(request, env);
  if (request.method === "PUT" && path.startsWith("/api/admin/booking-screens/")) {
    return handleAdminUpdateBookingScreen(request, env, path.split("/").pop() || "");
  }
  if (request.method === "DELETE" && path.startsWith("/api/admin/booking-screens/")) {
    return handleAdminDeleteBookingScreen(request, env, path.split("/").pop() || "");
  }
  if (request.method === "GET" && path === "/api/admin/reports/csv") return handleReportCsv(request, env, url);

  return errorResponse(404, "not_found");
};
