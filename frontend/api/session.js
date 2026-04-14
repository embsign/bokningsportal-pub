// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { apiRequest } from "./client.js";

export const getSession = () => apiRequest("/session");

export const getBootstrap = () => apiRequest("/bootstrap");


export const loginWithRfid = (uid) =>
  apiRequest("/rfid-login", {
    method: "POST",
    body: JSON.stringify({ uid }),
  });

export const rotatePersonalLoginLink = () =>
  apiRequest("/kiosk/access-token", {
    method: "POST",
  });

export const getDemoLinks = () => apiRequest("/demo-links");
