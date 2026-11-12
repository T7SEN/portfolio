import { about } from "./about";
import { heroCopy, STATIC_TIER } from "./hero";
import { studyHref } from "./index";
import { site } from "./site";
import type { Href, Link, Marker, MonoLabel, Text } from "./types";

/** Every route's name (its metadata title) and the first paragraph under its heading. */
export type PageCopy = { title: Text; intro: Text };

/** A page with a mono label over its h1, whose h1 may differ from its title. */
export type RouteCopy = PageCopy & { label: MonoLabel; heading: Text };

/** A framed panel: a short title and one line. */
export type Panel = { title: Text; text: Text };

export type WorkTable = {
  headers: {
    number: Text;
    project: Text;
    what: Text;
    builtWith: Text;
    study: Text;
  };
  /** The last row, after the five studies. */
  v1: {
    number: Text;
    title: Text;
    what: Text;
    builtWith: Text;
    link: Link & { href: "/v1" };
  };
};

export type Pages = {
  home: PageCopy & {
    work: {
      title: Text;
      intro: Text;
      /** The boxed link to /work, with its muted note under it. */
      index: Link & { href: "/work"; note: MonoLabel };
      /** The study link's words on a full study's row and on a short card. */
      readFull: Text;
      readShort: Text;
      archive: { lead: Text; link: Link & { href: "/v1" } };
    };
    makingOf: {
      title: Text;
      intro: Text;
      link: { label: Text; href: ReturnType<typeof studyHref> };
    };
    contact: {
      title: Text;
      /** The mono label over the services. */
      servicesLabel: Text;
      /** Until the form arrives (P6), the panel leads to /contact. */
      panel: { text: Text; action: Link & { href: "/contact" } };
    };
  };
  work: RouteCopy & {
    table: WorkTable;
    closing: { text: Text; action: Link & { href: "/contact" } };
  };
  about: RouteCopy & {
    action: Link & { href: "/contact" };
    sections: { offers: Text; skills: Text; elsewhere: Text };
    /** The mono label on each offer card. */
    offerLabel: Text;
  };
  contact: RouteCopy & {
    address: {
      email: Text;
      href: Href;
      copy: {
        label: Text;
        /** The button's name: its visible word alone does not say what it copies. */
        name: Text;
        copied: Text;
        failed: Text;
      };
    };
    hiring: Panel;
    form: Marker;
  };
  v1: PageCopy & { archive: Marker };
};

const message = { label: "Send a message", href: "/contact" } as const;

// /v1 holds its marker until P8 builds the archive, so the /work table's v1
// row says only what the page itself says today.
const v1Intro = "The first version of t7sen.com, kept as an archive.";

export const pages = {
  home: {
    title: site.name,
    intro: heroCopy(STATIC_TIER).subLine,
    work: {
      title: "Selected work",
      intro:
        "Each study follows the same line: the problem, the build, the hard part, the result.",
      index: {
        label: "Open the full index",
        href: "/work",
        note: ["No 3D", "Static HTML"],
      },
      readFull: "Read the case study",
      readShort: "Read the short study",
      archive: {
        lead: "Looking for the old site?",
        link: { label: "t7sen.com v1 lives in the archive", href: "/v1" },
      },
    },
    // The pass viewer comes with P4, so nothing here asks the visitor to
    // choose a pass yet.
    makingOf: {
      title: "How one frame is built",
      intro:
        "The render passes that draw this field, and what each device tier shows.",
      link: { label: "Read the making-of", href: studyHref("making-of") },
    },
    contact: {
      title: "Send a message.",
      servicesLabel: "What I take on",
      panel: {
        text: "Tell me what you are building, and I will reply by email.",
        action: { label: "Open the contact page", href: "/contact" },
      },
    },
  },
  work: {
    title: "Work",
    label: ["All work", "No 3D"],
    heading: "Work",
    intro:
      "Every project on one fast page. Full studies come first; short studies follow.",
    table: {
      headers: {
        number: "No.",
        project: "Project",
        what: "What it is",
        builtWith: "Built with",
        study: "Study",
      },
      v1: {
        number: "v1",
        title: "t7sen.com v1",
        what: v1Intro,
        builtWith: "Archive",
        link: { label: "Open the archive", href: "/v1" },
      },
    },
    closing: { text: "Want something like this built?", action: message },
  },
  about: {
    title: "About",
    label: ["About"],
    heading: about.heading,
    intro: about.paragraphs[0],
    action: message,
    sections: {
      offers: "What I build",
      skills: "Tools I use",
      elsewhere: "Elsewhere",
    },
    offerLabel: "Headline offer",
  },
  contact: {
    title: "Contact",
    label: ["Contact"],
    heading: "Tell me what you are building.",
    // The form arrives with P6; until then the intro promises only a reply.
    intro: "Tell me what you are building, and I will reply by email.",
    address: {
      email: site.email,
      href: `mailto:${site.email}`,
      copy: {
        label: "Copy",
        name: "Copy the email address",
        copied: "Address copied.",
        failed: "Could not copy. Select the address to copy it.",
      },
    },
    hiring: {
      title: "Hiring?",
      text: "My CV is sent on request. Say which role it is for and I will email it.",
    },
    form: "[FILL: the message form, built at P6]",
  },
  v1: {
    title: "v1 archive",
    intro: v1Intro,
    archive: "[FILL: v1 screenshots and a short before and after, built at P8]",
  },
} satisfies Pages;
