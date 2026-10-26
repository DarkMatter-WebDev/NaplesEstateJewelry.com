// The open list of the shop's two dropdowns — the toolbar Sort and "Products
// per page" — styled to match the site ("Option B", owner 2026-10-25: "Build
// Option B, and give the Products per page list the same look."). Before, the
// browser drew its own list with the words flush against the left edge.
//
// How: Chrome/Edge's customizable select (`appearance: base-select`), which
// lets the page style the list itself (`::picker(select)`, the options and
// their check mark). Measured on the real sort box in Chrome 152 before
// building: the list opens under the box at its width, even though the select
// itself is invisible (opacity 0, laid over its label — DECISIONS, 2026-10-25).
//
// Where it applies, and where it must NOT:
//   - `(hover: hover)` only = computers. Phones and tablets keep their own
//     picker (iPhone/iPad's wheel) and the 16px no-zoom rule exactly as they are.
//   - `@supports (appearance: base-select)` = browsers that can do it. Others
//     keep today's list; nothing breaks.
// The CSS is appended at the END of each component's own <style>, so it wins
// over that block's `appearance: none` by order (same specificity).

/** CSS for one dropdown; `scope` = the box that holds the real <select>. */
export function shopSelectPickerCss(scope: string): string {
  return `
        @media (hover: hover) {
          @supports (appearance: base-select) {
            ${scope} select,
            ${scope} select::picker(select) {
              appearance: base-select;
            }
            ${scope} select::picker(select) {
              opacity: 1;
              min-width: anchor-size(width);
              margin-top: 6px;
              padding: 6px;
              border: 1px solid rgba(115, 92, 0, 0.28);
              border-radius: 8px;
              background: #ffffff;
              box-shadow: 0 14px 30px rgba(42, 34, 12, 0.14);
              font-family: var(--font-label);
            }
            ${scope} option {
              gap: 8px;
              padding: 8px 12px 8px 8px;
              border-radius: 6px;
              background: transparent;
              color: var(--color-on-surface);
              cursor: pointer;
              font-family: var(--font-label);
              font-size: 0.86rem;
              font-weight: 600;
              letter-spacing: normal;
              text-transform: none;
            }
            ${scope} option::checkmark {
              color: var(--color-primary);
            }
            ${scope} option:checked {
              color: var(--color-primary);
              font-weight: 800;
            }
            ${scope} option:hover,
            ${scope} option:focus-visible {
              background: color-mix(in srgb, var(--color-primary) 12%, #ffffff);
              outline: none;
            }
          }
        }`;
}
