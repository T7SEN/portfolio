"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type MouseEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useFinePointer } from "@/components/home/use-fine-pointer";
import { SoundToggle } from "@/components/sound/sound-toggle";
import { ArrowIcon } from "@/components/site/arrow-icon";
import { Badge } from "@/components/site/badge";
import { CalmToggle } from "@/components/site/calm-toggle";
import { cx, LINK_HOVER, RULE } from "@/components/site/class-names";
import { Container } from "@/components/site/container";
import { Label } from "@/components/site/label";
import { pillClassName } from "@/components/site/pill";
import { SiteAnchor, isOnSite } from "@/components/site/site-anchor";
import { HomeLink } from "@/components/site/site-header";
import { TextLink } from "@/components/site/text-link";
import { DotJoined } from "@/components/study/dot-joined";
import { menuCopy } from "@/content/menu";
import { site } from "@/content/site";
import type { StudySlug } from "@/content/types";
import { overlayStore } from "@/lib/overlay-store";

import { CloseIcon } from "./menu-icons";
import { MENU_ROWS, type MenuRow, rowForPath } from "./menu-rows";
import { useShortcutKeys } from "./menu-shortcut";
import { PaletteButton } from "./palette-button";

// The faint dot lattice of the preview, in the edge token, strongest towards
// the inline end where the preview sits.
const LATTICE =
  "bg-[radial-gradient(circle,var(--color-edge)_1px,transparent_1.5px)] bg-size-[18px_18px]";

/**
 * The overlay menu (REQ-NAV-03): a full-screen Radix dialog named Menu,
 * loaded on its first open (overlays.tsx) and opened and closed by the
 * overlay store. It repeats the bar with Close in Menu's place, lists every
 * study in study order with a preview of the one in hover or focus, then the
 * site's other pages. Focus moves in on open (to the current study's row, or
 * the first), stays inside while open (Radix's focus scope, trapped and
 * looping), and goes back on close to where it was when the menu opened.
 */
export default function MenuDialog() {
  const overlay = useSyncExternalStore(
    overlayStore.subscribe,
    overlayStore.getSnapshot,
    overlayStore.getServerSnapshot,
  );
  const pathname = usePathname();
  const shownPath = useRef(pathname);

  // A move to another page (a link here, or back and forward) ends the menu.
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    if (overlayStore.getSnapshot() === "menu") overlayStore.close();
  }, [pathname]);

  return (
    <Dialog.Root
      open={overlay === "menu"}
      onOpenChange={(open) => {
        if (!open && overlayStore.getSnapshot() === "menu") {
          overlayStore.close();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-lenis-prevent
          className="fixed inset-0 z-60 bg-void"
        />
        <Dialog.Content
          data-lenis-prevent
          data-part="menu"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const content = event.currentTarget as HTMLElement | null;
            content
              ?.querySelector<HTMLElement>(
                '[data-part="menu-row"][data-active="true"]',
              )
              ?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // The palette took over from the menu: it owns focus now, and
            // the place to return to stays with it.
            if (overlayStore.getSnapshot() !== null) return;
            const opener = overlayStore.takeReturnFocus();
            if (opener?.isConnected) opener.focus();
          }}
          onClick={closeOnLink}
          className="fixed inset-0 z-60 flex flex-col overflow-y-auto overscroll-contain bg-void text-text transition-opacity duration-200 ease-out starting:opacity-0"
        >
          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none fixed inset-0 -z-10 opacity-50",
              LATTICE,
              "[mask-image:radial-gradient(ellipse_60%_70%_at_82%_72%,var(--color-void),transparent_75%)]",
              "rtl:[mask-image:radial-gradient(ellipse_60%_70%_at_18%_72%,var(--color-void),transparent_75%)]",
            )}
          />
          <Dialog.Title className="sr-only">{menuCopy.name}</Dialog.Title>
          <MenuBody pathname={pathname} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Any link in the menu ends it: a page change also does (above), but a link
// to the page already on screen changes nothing. A click that opens a new
// tab or window leaves the menu open.
function closeOnLink(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element).closest("a[href]");
  if (link !== null && overlayStore.getSnapshot() === "menu") {
    overlayStore.close();
  }
}

function MenuBody({ pathname }: { pathname: string | null }) {
  const current = rowForPath(pathname);
  const [active, setActive] = useState<StudySlug>(
    current?.slug ?? MENU_ROWS[0]?.slug ?? "making-of",
  );
  const finePointer = useFinePointer();
  const keys = useShortcutKeys();
  const shown = MENU_ROWS.find((row) => row.slug === active);

  return (
    <>
      {/* The bar again, laid out as the page's, so nothing jumps: Close
          sits where Menu was. */}
      <Container
        width="full"
        className="flex flex-wrap items-center justify-between gap-x-1 gap-y-2 py-3 sm:gap-x-4 lg:py-7"
      >
        <HomeLink egg={false} />
        <nav aria-label={site.names.siteControls}>
          <ul className="flex flex-wrap items-center justify-end gap-1 sm:gap-2.5">
            <li className="relative flex">
              <SoundToggle variant="menu" />
            </li>
            <li className="flex">
              <PaletteButton />
            </li>
            <li className="flex">
              <Dialog.Close
                data-part="menu-close"
                className={cx(
                  pillClassName({ variant: "quiet", size: "bar", gap: false }),
                  "gap-2 max-sm:gap-1.5 max-sm:rounded-xl max-sm:px-2.5",
                )}
              >
                <CloseIcon className="size-4" />
                {site.controls.close}
              </Dialog.Close>
            </li>
          </ul>
        </nav>
      </Container>

      <Container
        width="full"
        className="grid flex-1 content-start gap-x-12 gap-y-10 pt-6 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:pt-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] xl:gap-x-16"
      >
        <div>
          <Label parts={menuCopy.workLabel(MENU_ROWS.length)} />
          <nav aria-label={menuCopy.listName} className="mt-5 sm:mt-6">
            <ol className={cx("border-t", RULE)}>
              {MENU_ROWS.map((row) => (
                <li key={row.slug} className={cx("border-b", RULE)}>
                  <ProjectRow
                    row={row}
                    active={row.slug === active}
                    current={row.slug === current?.slug}
                    onActive={() => setActive(row.slug)}
                  />
                </li>
              ))}
            </ol>
          </nav>
          <nav aria-label={menuCopy.pagesName} className="mt-6 sm:mt-8">
            <ul className="flex flex-wrap gap-x-8 gap-y-1">
              {menuCopy.pages.map(({ href, label }) => (
                <li key={href}>
                  <SiteAnchor
                    href={href}
                    aria-current={href === pathname ? "page" : undefined}
                    className={cx(
                      "inline-flex min-h-11 items-center text-base text-text aria-[current=page]:text-glow",
                      LINK_HOVER,
                    )}
                  >
                    {label}
                    {!isOnSite(href) && (
                      <ArrowIcon
                        direction="out"
                        className="ms-1 size-3.5 text-glow"
                      />
                    )}
                  </SiteAnchor>
                </li>
              ))}
            </ul>
          </nav>
          {/* Calm in the menu too [T7SEN, 15 Nov 2026], the hero's corner
              switch, so it is one press away from every page's bar. */}
          <div className="mt-6 sm:mt-8">
            <CalmToggle variant="pill" />
          </div>
        </div>
        {shown !== undefined && <ProjectPreview row={shown} />}
      </Container>

      {/* Hints for a keyboard; on touch neither key exists. */}
      {finePointer && (
        <Container
          width="full"
          className="flex flex-wrap justify-between gap-x-6 gap-y-1 pb-6 font-mono text-xs tracking-[0.08em] text-muted lg:pb-8"
        >
          <p>{menuCopy.closeHint}</p>
          <p>{menuCopy.commandsHint(keys)}</p>
        </Container>
      )}
    </>
  );
}

type ProjectRowProps = {
  row: MenuRow;
  /** In hover or focus, or last so: in glow with an arrow, and in the preview. */
  active: boolean;
  /** The study on screen now. */
  current: boolean;
  onActive: () => void;
};

function ProjectRow({ row, active, current, onActive }: ProjectRowProps) {
  return (
    <Link
      href={row.href}
      data-part="menu-row"
      data-active={active}
      aria-current={current ? "page" : undefined}
      onPointerEnter={onActive}
      onFocus={onActive}
      className={cx(
        // The tags sit at the row's end where the list has the room, and under
        // the title on phones and beside the preview below 1280 px.
        "group grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 transition-colors sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-x-4 lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_auto]",
        row.full ? "min-h-18 py-3 sm:min-h-20" : "min-h-14 py-2.5 sm:min-h-16",
      )}
    >
      {/* The list's own order says the number to assistive technology. */}
      <span
        aria-hidden="true"
        className="font-mono text-xs tracking-[0.08em] text-muted group-data-[active=true]:text-glow"
      >
        {row.number}
      </span>
      <span
        className={cx(
          "flex min-w-0 items-center gap-3 font-display leading-tight font-semibold tracking-[-0.01em] transition-colors group-data-[active=true]:text-glow",
          row.full
            ? "text-[clamp(1.75rem,1rem_+_2vw,2.75rem)] text-text"
            : "text-[1.25rem] text-muted sm:text-heading",
        )}
      >
        <span className="min-w-0 break-words">{row.title}</span>
        <ArrowIcon
          direction="forward"
          className="size-[0.6em] opacity-0 transition-opacity group-data-[active=true]:opacity-100"
        />
      </span>
      {/* Keeps the title and the tags apart in the link's name. */}
      <span className="sr-only">, </span>
      <Label
        as="span"
        parts={row.tags}
        tone={row.inProgress ? "violet" : "muted"}
        className={cx(
          "col-start-2 sm:col-start-auto sm:text-end lg:col-start-2 lg:text-start xl:col-start-auto xl:text-end",
          !row.inProgress && "group-data-[active=true]:text-text",
        )}
      />
    </Link>
  );
}

// The project in hover or focus, framed as the preview draws it. A full
// study shows its shape as the field forms it (its tier 3 still); a short
// study has no shape, so its frame holds only what its card already shows,
// its badge and its stack. Hidden below 1024 px, where the list takes the
// whole width.
function ProjectPreview({ row }: { row: MenuRow }) {
  return (
    <aside
      aria-label={menuCopy.previewName(row.title)}
      data-part="menu-preview"
      // Below 1024 px it follows the list, the links and Calm, filling the
      // room a phone's menu left empty [T7SEN, 15 Nov 2026: "Preview card
      // below (Recommended)"]: a compact card, the frame small beside the
      // line, so it fits that room rather than a screen of its own.
      className="max-lg:grid max-lg:max-w-xl max-lg:grid-cols-[8.5rem_minmax(0,1fr)] max-lg:items-center max-lg:gap-x-4 lg:pt-10"
    >
      <div
        className={cx(
          "relative aspect-[59/40] overflow-hidden rounded-2xl border bg-void",
          RULE,
        )}
      >
        {/* Every still is in place, so a move between rows only fades. Plain
            img elements: the site uses no image optimisation service. */}
        {MENU_ROWS.map(
          (each) =>
            each.still !== null && (
              <picture key={each.slug}>
                <img
                  src={each.still}
                  alt=""
                  decoding="async"
                  loading="lazy"
                  className={cx(
                    "absolute inset-0 size-full object-cover transition-opacity duration-300",
                    each.slug === row.slug ? "opacity-100" : "opacity-0",
                  )}
                />
              </picture>
            ),
        )}
        {row.still === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center lg:gap-4 lg:p-6">
            <Badge tone={row.inProgress ? "progress" : "plain"}>
              {row.badge}
            </Badge>
            <p className="font-mono text-xs text-muted max-lg:hidden">
              <DotJoined parts={row.stack} />
            </p>
          </div>
        )}
        <div
          aria-hidden="true"
          className={cx(
            "absolute inset-0 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,var(--color-void),transparent_75%)] opacity-20",
            LATTICE,
          )}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm leading-snug text-muted max-lg:line-clamp-3 lg:mt-6 lg:text-[1.0625rem] lg:leading-[1.6]">
          {row.line}
        </p>
        <TextLink
          href={row.href}
          aria-label={`${menuCopy.readStudy}, ${row.title}`}
          className="inline-flex min-h-11 items-center font-medium lg:mt-3"
        >
          {menuCopy.readStudy}
        </TextLink>
      </div>
    </aside>
  );
}
