import { heroCopy, STATIC_TIER } from "./hero";
import type { Marker, Text } from "./types";

export type PageCopy = { title: Text; intro: Text };

export type Pages = {
  home: PageCopy;
  work: PageCopy;
  about: PageCopy;
  contact: PageCopy & { form: Marker };
  v1: PageCopy & { archive: Marker };
};

export const pages = {
  home: {
    title: "T7SEN",
    intro: heroCopy(STATIC_TIER).subLine,
  },
  work: {
    title: "Work",
    intro: "Three full studies, then two short ones.",
  },
  about: {
    title: "About",
    intro: "T7SEN is a WebGPU developer.",
  },
  contact: {
    title: "Send a message",
    intro: "Tell me what you are building, and I will reply by email.",
    form: "[FILL: the message form, built at P6]",
  },
  v1: {
    title: "v1 archive",
    intro: "The first version of t7sen.com, kept as an archive.",
    archive: "[FILL: v1 screenshots and a short before and after, built at P8]",
  },
} satisfies Pages;
