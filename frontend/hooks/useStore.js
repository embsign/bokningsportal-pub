// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

export const createStore = (initialState) => {
  let state = { ...initialState };
  const listeners = new Set();

  const getState = () => state;

  const setState = (updater) => {
    const nextState = typeof updater === "function" ? updater(state) : updater;
    state = { ...state, ...nextState };
    listeners.forEach((listener) => listener(state));
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
};
