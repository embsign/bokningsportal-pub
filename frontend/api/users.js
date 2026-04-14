// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { apiRequest } from "./client.js";

export const getBookableUsers = async () => {
  const { users } = await apiRequest("/users");
  return Array.isArray(users) ? users : [];
};
