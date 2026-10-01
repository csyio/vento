// Small HTML fragments shared across pages.

export const arrowIcon = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0-4-4m4 4 4-4M4 17h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Ebabil: four layers, additive blending (plus-lighter). With reduced motion, still.webp is shown instead (CSS).
export function bird() {
  return `<div class="bird" aria-hidden="true">
  <svg class="wind" viewBox="0 0 320 240" preserveAspectRatio="none">
    <defs><linearGradient id="wg" x1="0" x2="1"><stop offset="0" stop-color="#40a0f0" stop-opacity="0"/><stop offset=".5" stop-color="#3ccfe8" stop-opacity=".9"/><stop offset="1" stop-color="#20e0d0" stop-opacity="0"/></linearGradient></defs>
    <path d="M-20 150 C 60 130, 120 168, 190 146 S 290 140, 340 150"/>
    <path d="M-20 188 C 50 176, 120 204, 200 186 S 300 184, 340 192"/>
    <path d="M-20 108 C 70 96, 130 124, 200 104 S 290 100, 340 110"/>
  </svg>
  <img class="bird-still" src="/assets/img/still.webp" alt="" width="640" height="640" fetchpriority="high">
  <div class="bird-rig">
    <img class="bird-wr" src="/assets/img/wing-r.webp" alt="" width="640" height="640">
    <img src="/assets/img/body.webp" alt="" width="640" height="640">
    <img class="bird-tail" src="/assets/img/tail.webp" alt="" width="640" height="640">
    <img class="bird-wl" src="/assets/img/wing-l.webp" alt="" width="640" height="640">
  </div>
</div>`;
}

// LLMTR logo: the official file, unmodified; dark or light version depending on the background; 141x36 (at least 96 px wide).
// Keep clear space around the logo (the card padding) of more than 50% of the mark's height.
export function llmtrLockup() {
  return `<a class="llmtr" href="https://llmtr.com" rel="noopener"><picture><source media="(prefers-color-scheme: dark)" srcset="/assets/img/llmtr-on-dark.svg"><img src="/assets/img/llmtr-on-light.svg" alt="LLMTR" width="141" height="36"></picture></a>`;
}

export function dlButton(ctx, label, soon) {
  const d = ctx.dl;
  return d.has
    ? `<a class="dl" href="${d.href}" download>${arrowIcon}${label}</a>`
    : `<span class="dl" aria-disabled="true" role="link">${soon}</span>`;
}
