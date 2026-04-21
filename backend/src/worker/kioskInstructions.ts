// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import type { Env } from "./types.js";

type KioskInstructionOverrides = {
  targetAndroidVersion?: string;
  androidDownloadPath?: string;
};

/** Instruktioner till bokningsskärm (Android/web) via t.ex. GET /api/kiosk/screen/status. */
export const buildKioskScreenInstructions = (env: Env, overrides: KioskInstructionOverrides = {}) => {
  const latestAndroidVersion = String(env.KIOSK_LATEST_ANDROID_VERSION || "").trim();
  const androidDownloadUrl = String(env.KIOSK_ANDROID_DOWNLOAD_URL || "").trim();
  const messageSv = String(env.KIOSK_UPDATE_MESSAGE_SV || "").trim();
  const targetAndroidVersion = String(overrides.targetAndroidVersion || "").trim();
  const androidDownloadPath = String(overrides.androidDownloadPath || "").trim();

  const hasAny = Boolean(
    latestAndroidVersion || androidDownloadUrl || messageSv || targetAndroidVersion || androidDownloadPath
  );
  if (!hasAny) {
    return null;
  }

  return {
    latest_android_version: latestAndroidVersion || null,
    android_download_url: androidDownloadUrl || null,
    message_sv: messageSv || null,
    target_android_version: targetAndroidVersion || null,
    android_download_path: androidDownloadPath || null,
  };
};
