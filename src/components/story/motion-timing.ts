// Chapter title reveals: weighted ease-out of about 600 to 900 ms, each word
// rising out of its own mask (REQ-SCR-05).
export const TITLE_REVEAL = {
  duration: 0.8,
  ease: "power3.out",
  stagger: 0.08,
} as const;

// The line under a revealed title fades in with it on the same trigger.
// Its ease starts slowly, so it trails the title's words and the two arrive
// in reading order (REQ-SCR-05).
export const INTRO_REVEAL = { duration: 0.9, ease: "power2.inOut" } as const;

// Calm mode and reduced motion: the title fades in whole, with no movement
// and no split (REQ-A11Y-03, REQ-A11Y-04).
export const TITLE_FADE = { duration: 0.3, ease: "power1.out" } as const;

// A reveal starts once the title's top is 15% inside the viewport. clamp()
// keeps that point within the page's scroll range, so a title near the end
// of the page can never stay hidden.
export const REVEAL_START = "clamp(top 85%)";
