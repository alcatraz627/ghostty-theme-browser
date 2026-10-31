// Inline stroke icons, so the page loads no icon font. Each value is the inner
// markup of a 24 by 24 viewBox; dom.mjs svgIcon() wraps it.

export const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  history: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  reset: '<path d="M4 12a8 8 0 108-8H7"/><path d="M7 1v6h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  diff: '<path d="M8 4v16M16 4v16M4 8h8M12 16h8"/>',
  restore: '<path d="M4 4v6h6"/><path d="M4.5 10A8 8 0 118 18.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
  minus: '<path d="M5 12h14"/>',
  chevron: '<path d="M8 10l4 4 4-4"/>',
  refresh: '<path d="M20 5v5h-5"/><path d="M19 10a8 8 0 10.5 5"/>',
};
