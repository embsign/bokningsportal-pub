// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

export const createElement = (tag, options = {}, children = []) => {
  const element = document.createElement(tag);
  const {
    className,
    text,
    attrs,
    onClick,
    onInput,
    onChange,
    onScroll,
    children: optionChildren,
  } = options;

  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === "boolean") {
          if (value) {
            element.setAttribute(key, "");
          } else {
            element.removeAttribute(key);
          }
          if (key in element) {
            element[key] = value;
          }
          return;
        }
        element.setAttribute(key, value);
        // For input/textarea/select elements, also set the DOM property
        if (key === "value" && (tag === "input" || tag === "textarea" || tag === "select")) {
          element.value = value;
        }
      }
    });
  }
  if (onClick) {
    element.addEventListener("click", onClick);
  }
  if (onInput) {
    element.addEventListener("input", onInput);
  }
  if (onChange) {
    element.addEventListener("change", onChange);
  }
  if (onScroll) {
    element.addEventListener("scroll", onScroll);
  }

  const mergedChildren = [...(optionChildren || []), ...children];
  mergedChildren.forEach((child) => {
    if (child) {
      element.append(child);
    }
  });

  return element;
};

export const clearElement = (element) => {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};
