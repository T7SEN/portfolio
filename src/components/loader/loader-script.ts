import {
  CALM_KEY,
  LOADER_ATTRIBUTE,
  LOADER_OFF_ATTRIBUTE,
} from "./loader-config";

// The root layout puts this script in the head as a plain script element, so
// the browser runs it while it parses the page, before the first paint, and
// the cover's first frame is already decided. next/script cannot: with
// beforeInteractive the App Router queues inline code in self.__next_s and
// runs it from app-bootstrap.js once Next.js's own script has loaded
// (next/dist/client/script.js and app-bootstrap.js in next 16.4.5; the
// version-matched guide preventing-flash-before-hydration.md uses a plain
// element). P6's content security policy must allow it by its hash or a
// nonce.
//
// It marks the html element on every full load: data-loader="up" when the
// cover shows, else data-loader-off with the reason, in the order route
// (not "/"), reduced, calm. CSS shows the cover only on "up", so anything
// that stops this script (scripts off, a policy that blocks it, an error)
// leaves no cover, and the island then shows none after a move inside the
// site either. Written in old syntax, since it runs before any polyfill.
const quote = (value: string) => JSON.stringify(value);

export const LOADER_SCRIPT = [
  "(function(){",
  'var d=document.documentElement,o="";',
  "try{",
  'if(location.pathname!=="/")o="route";',
  'else if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)o="reduced";',
  "else{var s=null;try{s=window.sessionStorage}catch(e){}",
  "if(s&&s.getItem(" + quote(CALM_KEY) + ')==="on")o="calm"}',
  "if(o)d.setAttribute(" + quote(LOADER_OFF_ATTRIBUTE) + ",o);",
  "else d.setAttribute(" + quote(LOADER_ATTRIBUTE) + ',"up")',
  "}catch(e){}",
  "})()",
].join("");

/** With scripts off the cover never shows (REQ-CNT-01). */
export const LOADER_NOSCRIPT =
  "<style>[data-loader-cover]{display:none!important}</style>";
