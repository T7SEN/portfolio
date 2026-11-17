"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { usePathname, useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useFinePointer } from "@/components/home/use-fine-pointer";
import { scrollToSection } from "@/components/motion/scroll-to-section";
import { cx } from "@/components/site/class-names";
import {
  paletteCopy,
  tierChoiceName,
  tierFallback,
  tierValue,
} from "@/content/palette";
import { site } from "@/content/site";
import type { Text } from "@/content/types";
import type { EggId } from "@/engine/types";
import { calmStore } from "@/lib/calm-store";
import { requestEgg } from "@/lib/eggs";
import { isFieldRoute } from "@/lib/field-routes";
import { overlayStore } from "@/lib/overlay-store";
import {
  soundStore,
  type SoundStatus,
  type TicksStatus,
} from "@/lib/sound-store";
import { type TierChoice, tierChoiceStore } from "@/lib/tier-choice-store";
import { tierStore } from "@/lib/tier-store";

import { refusalFor } from "./egg-refusal";
import { CloseIcon, SearchIcon } from "./menu-icons";
import { copyText, openAddress } from "./palette-actions";
import {
  ACTION_ROWS,
  type ActionId,
  goRowsFor,
  type GoRow,
  hiddenRowsFor,
  matchesSearch,
  runningTier,
  SETTING_ROWS,
  type SettingId,
  TIER_ROWS,
  type TierReading,
} from "./palette-commands";

// The preview's rules inside the panel and its border, as the edge token
// over the surface: #373744 and #444453 in the artboard.
const PANEL_RULE = "border-edge/45";

const MOVE_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

// The full placeholder needs about 266 px of Geist at 16 px; the search line
// gives it that from a 360 px screen.
const ROOM_QUERY = "(min-width: 22.5rem)";

function roomQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return null;
  return window.matchMedia(ROOM_QUERY);
}

function watchRoom(listener: () => void) {
  const query = roomQuery();
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

const hasRoom = () => roomQuery()?.matches ?? true;
const serverHasRoom = () => true;

const SOUND_VALUES: Record<SoundStatus, Text> = {
  off: paletteCopy.values.off,
  waiting: paletteCopy.values.waiting,
  starting: paletteCopy.values.on,
  on: paletteCopy.values.on,
  failed: paletteCopy.values.failed,
};

const TICKS_VALUES: Record<TicksStatus, Text> = {
  off: paletteCopy.values.off,
  on: paletteCopy.values.on,
  failed: paletteCopy.values.failed,
};

/**
 * The command palette (REQ-NAV-04): a Radix dialog named Command palette
 * holding a cmdk menu, loaded on its first open (overlays.tsx) and opened
 * and closed by the overlay store. Radix Dialog directly rather than cmdk's
 * Command.Dialog, which passes only a class name to the dialog's content and
 * so leaves no way to choose where focus goes on open and close.
 */
export default function PaletteDialog() {
  const overlay = useSyncExternalStore(
    overlayStore.subscribe,
    overlayStore.getSnapshot,
    overlayStore.getServerSnapshot,
  );
  const isOpen = overlay === "palette";
  const pathname = usePathname();
  const shownPath = useRef(pathname);

  // A move to another page (back and forward included) ends the palette.
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    if (overlayStore.getSnapshot() === "palette") overlayStore.close();
  }, [pathname]);

  // The open and close ticks are the tick listener's, from the overlay store
  // (interface-ticks.tsx); a command that closes the palette plays only that
  // close, one tick for the press.
  function closeAfterRun() {
    if (overlayStore.getSnapshot() === "palette") overlayStore.close();
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && overlayStore.getSnapshot() === "palette") {
          overlayStore.close();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-lenis-prevent
          className="fixed inset-0 z-60 bg-void/90 transition-opacity duration-200 ease-out starting:opacity-0"
        />
        <Dialog.Content
          data-lenis-prevent
          data-part="palette"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const content = event.currentTarget as HTMLElement | null;
            content?.querySelector<HTMLElement>("[cmdk-input]")?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // The menu took over from the palette: it owns focus now, and
            // the place to return to stays with it.
            if (overlayStore.getSnapshot() !== null) return;
            const opener = overlayStore.takeReturnFocus();
            // Without a scroll, so a glide to a home chapter is not pulled
            // back to the control that opened the palette.
            if (opener?.isConnected) opener.focus({ preventScroll: true });
          }}
          // From 640 px the panel sits as artboard 7 has it, 12% down, on a
          // screen tall enough; on a shorter one it rises to centre its
          // first page (about 45rem), so Go to, Settings and Actions all
          // show at 1280 by 800 [T7SEN, 15 Nov 2026: "the palette list is
          // too long"]; it always ends 1rem above the screen's foot.
          className="fixed inset-x-2 top-2 z-60 mx-auto flex max-h-[calc(100dvh-1rem)] max-w-160 flex-col overflow-hidden rounded-[10px] border border-edge/60 bg-surface text-text outline-hidden transition-opacity duration-200 ease-out [--palette-top:max(1rem,min(12svh,calc(50svh-22.5rem)))] sm:top-(--palette-top) sm:max-h-[calc(100svh-var(--palette-top)-1rem)] starting:opacity-0"
        >
          <Dialog.Title className="sr-only">{paletteCopy.name}</Dialog.Title>
          <PaletteBody pathname={pathname} onCloseAfterRun={closeAfterRun} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Page = "root" | "tier";

/**
 * Words said in the status region. shown: also on screen, where no row
 * already says them (why an egg did not play, a failed copy or sound);
 * otherwise they are for assistive technology only, since the row's value
 * or note shows the same.
 */
type Notice = { id: number; text: Text; shown: boolean };

type CopyState = "idle" | "copied" | "failed";

type BodyProps = {
  pathname: string | null;
  onCloseAfterRun: () => void;
};

// Mounted only while the dialog is open, so every open starts afresh: the
// first page, an empty search and the first row active.
function PaletteBody({ pathname, onCloseAfterRun }: BodyProps) {
  const router = useRouter();
  const finePointer = useFinePointer();
  const roomy = useSyncExternalStore(watchRoom, hasRoom, serverHasRoom);
  const sound = useSyncExternalStore(
    soundStore.subscribe,
    soundStore.getSnapshot,
    soundStore.getServerSnapshot,
  );
  const calm = useSyncExternalStore(
    calmStore.subscribe,
    calmStore.getSnapshot,
    calmStore.getServerSnapshot,
  );
  const choice = useSyncExternalStore(
    tierChoiceStore.subscribe,
    tierChoiceStore.getSnapshot,
    tierChoiceStore.getServerSnapshot,
  );
  const reading = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );

  const [page, setPage] = useState<Page>("root");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copy, setCopy] = useState<CopyState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const isLive = useRef(true);

  const running = runningTier(choice, reading);
  const fallback = fallbackFor(choice, running, reading);

  // Each notice is a new node, so the same words said twice are heard twice.
  const announce = useCallback((text: Text, shown = false) => {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, text, shown }));
  }, []);

  const hidden = page === "root" ? hiddenRowsFor(search) : [];
  const goRows = page === "root" ? goRowsFor(search) : [];
  const settingRows =
    page === "root"
      ? SETTING_ROWS.filter((row) => matchesSearch(row, search))
      : [];
  const actionRows =
    page === "root"
      ? ACTION_ROWS.filter((row) => matchesSearch(row, search))
      : [];
  const tierRows =
    page === "tier"
      ? TIER_ROWS.filter((row) => matchesSearch(row, search))
      : [];
  const rowCount =
    hidden.length +
    goRows.length +
    settingRows.length +
    actionRows.length +
    tierRows.length;

  useEffect(() => {
    isLive.current = true;
    return () => {
      isLive.current = false;
    };
  }, []);

  // The cmdk menu is drawn again for each page, which takes its input with
  // it; focus goes to the new one.
  useEffect(() => {
    inputRef.current?.focus();
  }, [page]);

  // cmdk 1.1.1 fills the input's aria-activedescendant one step late when it
  // picks the row itself, on open and as the search changes: its update queue
  // runs before the rows are drawn again, so a screen reader would name no
  // row, or the one before. Each row's aria-selected is right, so the input
  // follows the rows.
  useEffect(() => {
    const field = inputRef.current;
    const list = listRef.current;
    if (field === null || list === null) return;
    const sync = () => {
      const id = list.querySelector('[cmdk-item][aria-selected="true"]')?.id;
      if (id === undefined || id === "") {
        if (field.hasAttribute("aria-activedescendant")) {
          field.removeAttribute("aria-activedescendant");
        }
      } else if (field.getAttribute("aria-activedescendant") !== id) {
        field.setAttribute("aria-activedescendant", id);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(list, {
      subtree: true,
      childList: true,
      attributeFilter: ["aria-selected"],
    });
    observer.observe(field, { attributeFilter: ["aria-activedescendant"] });
    return () => observer.disconnect();
  }, [page]);

  useEffect(() => {
    if (copy !== "failed") return;
    addressRef.current?.focus();
    addressRef.current?.select();
  }, [copy]);

  // Sound settles after the press (the context resumes, the code loads), so
  // each setting's result is said when it comes (4.1.3).
  useEffect(() => {
    let before = soundStore.getSnapshot();
    return soundStore.subscribe(() => {
      const now = soundStore.getSnapshot();
      const was = before;
      before = now;
      if (now.status !== was.status) {
        if (now.status === "on") {
          announce(paletteCopy.announce.backgroundOn);
        } else if (now.status === "off") {
          announce(paletteCopy.announce.backgroundOff);
        } else if (now.status === "failed") {
          announce(paletteCopy.announce.soundFailed, true);
        }
      }
      if (now.ticks !== was.ticks) {
        if (now.ticks === "on") announce(paletteCopy.announce.ticksOn);
        else if (now.ticks === "off") announce(paletteCopy.announce.ticksOff);
        else announce(paletteCopy.announce.soundFailed, true);
      }
    });
  }, [announce]);

  // A forced tier the device cannot give is known only once the engine has
  // tried it, so the reason is said when it arrives.
  useEffect(() => {
    const read = () => {
      const next = tierChoiceStore.getSnapshot();
      const now = tierStore.getSnapshot();
      return fallbackFor(next, runningTier(next, now), now);
    };
    let before = read();
    const onChange = () => {
      const now = read();
      if (now === before) return;
      before = now;
      if (now !== null) announce(now);
    };
    const stopTier = tierStore.subscribe(onChange);
    const stopChoice = tierChoiceStore.subscribe(onChange);
    return () => {
      stopTier();
      stopChoice();
    };
  }, [announce]);

  function showRoot(activeRow: string) {
    setPage("root");
    setSearch("");
    setActive(activeRow);
  }

  // A row that closes the palette plays no select of its own: its close
  // tick is the press's one tick.
  function runGo(row: GoRow) {
    const { target } = row;
    if (target.kind === "page") {
      onCloseAfterRun();
      router.push(target.href);
      return;
    }
    // On the home page the chapter is reached by scrolling, which waits for
    // the palette to close (scroll-to-section.ts); elsewhere by its address.
    // Focus goes with the visitor to the chapter, without a scroll of its
    // own, so the next Tab goes on from there, not from the opener.
    if (pathname === "/" && scrollToSection(target.id)) {
      const chapter = document.getElementById(target.id);
      if (chapter !== null) {
        // Focusable for this one move only: a chapter that stayed focusable
        // would take focus from every click on its text, and a focus ends a
        // wheel glide (smooth-scroll-session.ts).
        if (!chapter.hasAttribute("tabindex")) {
          chapter.setAttribute("tabindex", "-1");
          chapter.addEventListener(
            "blur",
            () => chapter.removeAttribute("tabindex"),
            { once: true },
          );
        }
        overlayStore.setReturnFocus(chapter);
      }
      onCloseAfterRun();
      return;
    }
    onCloseAfterRun();
    router.push(`/#${target.id}`);
  }

  function runSetting(id: SettingId) {
    switch (id) {
      case "background":
      case "ticks":
        // Inside the press, which the browser needs to let sound start.
        // Both rows are sound controls, so while a returning visitor's
        // background waits, the store's window listener leaves this press
        // to the row. The tick after the change: turning the interface
        // sounds on is heard, turning them off is not.
        if (id === "background") soundStore.toggleBackground();
        else soundStore.toggleTicks();
        soundStore.tick("select");
        return;
      case "tier":
        soundStore.tick("select");
        setPage("tier");
        setSearch("");
        setActive(`tier:${choice}`);
        return;
      case "calm": {
        soundStore.tick("select");
        // Asks for the opposite of what the row shows; under the OS setting
        // that clears only the visitor's own choice, and calm stays on.
        calmStore.setChosen(!calm.calm);
        const next = calmStore.getSnapshot();
        announce(
          next.system
            ? paletteCopy.calmSystem
            : next.calm
              ? paletteCopy.announce.calmOn
              : paletteCopy.announce.calmOff,
        );
        return;
      }
    }
  }

  function chooseTier(next: TierChoice) {
    soundStore.tick("select");
    tierChoiceStore.set(next);
    showRoot("setting:tier");
    announce(paletteCopy.announce.tierSet(tierChoiceName(next)));
  }

  async function copyEmail() {
    const isCopied = await copyText(site.email);
    if (!isLive.current) return;
    setCopy(isCopied ? "copied" : "failed");
    if (isCopied) announce(paletteCopy.copied);
    else announce(paletteCopy.copyFailed, true);
  }

  function runAction(id: ActionId) {
    switch (id) {
      case "copy-email":
        soundStore.tick("select");
        void copyEmail();
        return;
      case "cv":
        onCloseAfterRun();
        openAddress(paletteCopy.cvHref);
        return;
    }
  }

  function runEgg(egg: EggId) {
    const outcome = requestEgg(egg);
    if (outcome.played) {
      // Closed, so the field behind the palette shows the egg.
      onCloseAfterRun();
      return;
    }
    soundStore.tick("select");
    announce(
      paletteCopy.eggRefusals[refusalFor(outcome, pathname, calm, choice)],
      true,
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    const fromInput =
      event.target instanceof HTMLElement &&
      event.target.hasAttribute("cmdk-input");
    if (
      event.key === "Backspace" &&
      page === "tier" &&
      search === "" &&
      fromInput
    ) {
      event.preventDefault();
      soundStore.tick("move");
      showRoot("setting:tier");
      return;
    }
    if (MOVE_KEYS.has(event.key) && rowCount > 1) soundStore.tick("move");
  }

  const settingDetail: Record<SettingId, Text> = {
    background: SOUND_VALUES[sound.status],
    ticks: TICKS_VALUES[sound.ticks],
    tier: tierValue(choice, running),
    calm: calm.calm ? paletteCopy.values.on : paletteCopy.values.off,
  };
  const settingNote: Record<SettingId, Text | null> = {
    background: null,
    ticks: null,
    tier: fallback,
    calm: calm.system ? paletteCopy.calmSystem : null,
  };
  // The waiting note is about the page, not the engine's last report: on a
  // field page the field is on its way, and a page with none (/work) has
  // none even after the home page drew one.
  const tierNote =
    fallback ??
    (pathname !== null && !isFieldRoute(pathname)
      ? paletteCopy.tierPage.waiting
      : null);

  return (
    <>
      {/* Drawn again for each page: cmdk keeps its own record of the rows
          it holds, and a fresh menu starts on the row asked for. */}
      <Command
        key={page}
        label={paletteCopy.inputName}
        shouldFilter={false}
        // Its default turns Ctrl K into "previous row", and Ctrl K closes
        // the palette (interface-keys.tsx).
        vimBindings={false}
        loop
        value={active}
        onValueChange={setActive}
        onKeyDown={onKeyDown}
        className="flex min-h-0 flex-col outline-hidden"
      >
        {/* Below 640 px the magnifier and the tier chip give their room to
            the words, which stay at 16 px so a phone does not zoom in. */}
        <div
          className={cx(
            "flex min-h-16 shrink-0 items-center gap-3 border-b ps-4 pe-2.5 sm:min-h-[4.375rem] sm:ps-5",
            PANEL_RULE,
          )}
        >
          {page === "tier" ? (
            <>
              <button
                type="button"
                aria-label={paletteCopy.tierPage.back}
                data-part="palette-back"
                onClick={() => showRoot("setting:tier")}
                onKeyDown={keepKeys}
                className="-ms-3 grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:text-paper focus-visible:text-paper"
              >
                <BackIcon className="size-4.5" />
              </button>
              <span className="shrink-0 rounded-[4px] bg-raised px-2 py-1 font-mono text-[0.6875rem] leading-none tracking-[0.04em] text-muted max-sm:hidden">
                {paletteCopy.settings.tier}
              </span>
            </>
          ) : (
            <SearchIcon className="size-4.5 text-muted max-sm:hidden" />
          )}
          <Command.Input
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder={
              page === "tier"
                ? paletteCopy.tierPage.placeholder
                : roomy
                  ? paletteCopy.placeholder
                  : paletteCopy.placeholderShort
            }
            // The caret marks the one text field, which holds focus all the
            // time the palette is open; the active row has its own fill.
            className="min-w-0 flex-1 bg-transparent py-3 text-base text-text caret-glow outline-hidden placeholder:text-muted sm:text-[1.0625rem]"
          />
          <Dialog.Close
            aria-label={paletteCopy.close.name}
            data-part="palette-close"
            onKeyDown={keepKeys}
            className="grid min-h-11 min-w-11 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:text-paper focus-visible:text-paper max-sm:-me-1.5"
          >
            {finePointer ? (
              <span className="rounded-[4px] bg-raised px-2 py-1 font-mono text-[0.6875rem] leading-none tracking-[0.04em]">
                {paletteCopy.close.key}
              </span>
            ) : (
              <CloseIcon className="size-4.5" />
            )}
          </Dialog.Close>
        </div>

        <Command.List
          ref={listRef}
          label={paletteCopy.listName}
          data-lenis-prevent
          className="min-h-0 scroll-py-2 overflow-y-auto overscroll-contain px-2.5 pt-1.5 pb-2.5"
        >
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
            {paletteCopy.empty}
          </Command.Empty>

          {hidden.length > 0 && (
            <Command.Group
              heading={<GroupHeading>{paletteCopy.groups.hidden}</GroupHeading>}
            >
              {hidden.map((row) => (
                <Row
                  key={row.value}
                  value={row.value}
                  label={row.label}
                  showEnter={finePointer}
                  onSelect={() => runEgg(row.egg)}
                />
              ))}
            </Command.Group>
          )}

          {goRows.length > 0 && (
            <Command.Group
              heading={<GroupHeading>{paletteCopy.groups.goTo}</GroupHeading>}
            >
              {goRows.map((row) => (
                <Row
                  key={row.value}
                  value={row.value}
                  label={row.label}
                  showEnter={finePointer}
                  onSelect={() => runGo(row)}
                />
              ))}
            </Command.Group>
          )}

          {settingRows.length > 0 && (
            <Command.Group
              heading={
                <GroupHeading>{paletteCopy.groups.settings}</GroupHeading>
              }
            >
              {settingRows.map((row) => (
                <Row
                  key={row.value}
                  value={row.value}
                  label={row.label}
                  detail={settingDetail[row.id]}
                  note={settingNote[row.id]}
                  showEnter={finePointer}
                  isSoundControl={row.id === "background" || row.id === "ticks"}
                  onSelect={() => runSetting(row.id)}
                />
              ))}
            </Command.Group>
          )}

          {actionRows.length > 0 && (
            <Command.Group
              heading={
                <GroupHeading>{paletteCopy.groups.actions}</GroupHeading>
              }
            >
              {actionRows.map((row) => (
                <Row
                  key={row.value}
                  value={row.value}
                  label={row.label}
                  detail={
                    row.id === "copy-email"
                      ? copy === "copied"
                        ? paletteCopy.copied
                        : site.email
                      : null
                  }
                  detailTone={
                    row.id === "copy-email" && copy === "copied"
                      ? "glow"
                      : "muted"
                  }
                  showEnter={finePointer}
                  onSelect={() => runAction(row.id)}
                />
              ))}
            </Command.Group>
          )}

          {tierRows.length > 0 && (
            <Command.Group
              heading={<GroupHeading>{paletteCopy.settings.tier}</GroupHeading>}
            >
              {tierRows.map((row) => (
                <Row
                  key={row.value}
                  value={row.value}
                  label={row.label}
                  detail={
                    row.choice === choice ? paletteCopy.tierPage.chosen : null
                  }
                  showEnter={finePointer}
                  onSelect={() => chooseTier(row.choice)}
                />
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>

      {page === "tier" && tierNote !== null && (
        <p
          data-part="palette-tier-note"
          className={cx(
            "shrink-0 border-t px-5 py-3 text-xs leading-normal text-muted",
            PANEL_RULE,
          )}
        >
          {tierNote}
        </p>
      )}

      {/* Outside the menu, which is drawn again for each page, so the region
          is in place before anything is said in it (4.1.3). */}
      <div role="status" data-part="palette-status" className="shrink-0">
        {notice !== null && (
          <p
            key={notice.id}
            className={
              notice.shown
                ? cx(
                    "border-t px-5 py-3 text-sm leading-normal text-text",
                    PANEL_RULE,
                  )
                : "sr-only"
            }
          >
            {notice.text}
          </p>
        )}
      </div>

      {copy === "failed" && (
        <div className="shrink-0 px-5 pb-3">
          <input
            ref={addressRef}
            readOnly
            value={site.email}
            aria-label={paletteCopy.addressName}
            data-part="palette-address"
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-glow bg-void px-3 py-2.5 font-mono text-sm text-text"
          />
        </div>
      )}

      <div
        className={cx(
          "flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t px-5 py-3 font-mono text-[0.6875rem] leading-snug tracking-[0.04em] text-muted",
          PANEL_RULE,
        )}
      >
        {/* Hints for a keyboard; on touch none of these keys exist. */}
        {finePointer && <p>{paletteCopy.keyHints}</p>}
        <p className="ms-auto">{paletteCopy.hiddenHint}</p>
      </div>
    </>
  );
}

// The reason a forced tier is not the one running, or null while it is (or
// while nothing runs yet).
function fallbackFor(
  choice: TierChoice,
  running: ReturnType<typeof runningTier>,
  reading: TierReading,
): Text | null {
  if (choice === "auto" || running === null || running === choice) return null;
  return tierFallback(choice, running, reading.reason);
}

// The menu's own keys (arrows, Enter) belong to the search; on the close
// and back buttons Enter presses the button.
function keepKeys(event: KeyboardEvent<HTMLElement>) {
  event.stopPropagation();
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <span className="block px-3 pt-3.5 pb-2.5 font-mono text-[0.6875rem] leading-none tracking-[0.16em] text-muted uppercase">
      {children}
    </span>
  );
}

type RowProps = {
  value: string;
  label: Text;
  /** The value at the row's end, in mono. */
  detail?: Text | null;
  detailTone?: "muted" | "glow";
  /** A second line under the row: why a setting is as it is. */
  note?: Text | null;
  /** The Enter hint on the active row, where a keyboard is likely. */
  showEnter: boolean;
  /** The two sound rows: each turns its setting over itself (sound-store.ts). */
  isSoundControl?: boolean;
  onSelect: () => void;
};

function Row({
  value,
  label,
  detail = null,
  detailTone = "muted",
  note = null,
  showEnter,
  isSoundControl = false,
  onSelect,
}: RowProps) {
  return (
    <Command.Item
      value={value}
      data-sound-control={isSoundControl ? "" : undefined}
      onSelect={onSelect}
      className="group flex min-h-11 cursor-pointer flex-wrap items-center gap-x-4 rounded-md px-3 py-2.5 text-[0.9375rem] leading-snug text-text data-[selected=true]:bg-raised data-[selected=true]:text-glow"
    >
      <span className="min-w-0 flex-1">{label}</span>
      {detail !== null && (
        <>
          {/* Keeps the name and the value apart when read aloud. */}
          <span className="sr-only">, </span>
          <span
            className={cx(
              "ms-auto text-end font-mono text-xs tracking-[0.04em]",
              detailTone === "glow" ? "text-glow" : "text-muted",
            )}
          >
            {detail}
          </span>
        </>
      )}
      {showEnter && (
        <span
          aria-hidden="true"
          className="hidden font-mono text-[0.6875rem] tracking-[0.04em] text-muted group-data-[selected=true]:inline"
        >
          {paletteCopy.enterKey}
        </span>
      )}
      {note !== null && (
        <>
          <span className="sr-only">. </span>
          <span className="basis-full pt-1 text-xs leading-normal text-muted">
            {note}
          </span>
        </>
      )}
    </Command.Item>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0 rtl:-scale-x-100", className)}
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}
