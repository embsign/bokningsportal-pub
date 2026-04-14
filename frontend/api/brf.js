// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { apiRequest } from "./client.js";

export const registerBrf = (associationName, email, turnstileToken) =>
  apiRequest("/brf/register", {
    method: "POST",
    body: JSON.stringify({
      association_name: associationName,
      email,
      turnstile_token: turnstileToken,
      frontend_base_url: typeof window !== "undefined" ? window.location.origin : undefined,
    }),
  });

export const verifyBrfSetup = (payload) =>
  apiRequest("/brf/setup/verify", {
    method: "POST",
    body: JSON.stringify({ payload }),
  });

export const completeBrfSetup = (accountOwnerToken, email) =>
  apiRequest("/brf/setup/complete", {
    method: "POST",
    body: JSON.stringify({
      account_owner_token: accountOwnerToken,
      email,
      frontend_base_url: typeof window !== "undefined" ? window.location.origin : undefined,
    }),
  });
