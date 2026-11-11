import type { ShapeId } from "../../story";
import {
  arc,
  circle,
  clip,
  gap,
  round,
  roundedRect,
  stroke,
  turn,
} from "./draw";
import type { Ring } from "./draw";

/** This site: a screen with the field blooming out of one dot inside it. */
function screen(): Ring[] {
  const rings = stroke(roundedRect(0, 0, 176, 110, 10), 9, true);
  rings.push(circle(88, 55, 10));
  for (let index = 0; index < 6; index += 1) {
    const angle = ((index * 60 + 30) * Math.PI) / 180;
    rings.push(circle(88 + 35 * Math.cos(angle), 55 + 23 * Math.sin(angle), 6));
  }
  for (let index = 0; index < 10; index += 1) {
    const angle = (index * 36 * Math.PI) / 180;
    rings.push(
      circle(88 + 62 * Math.cos(angle), 55 + 37 * Math.sin(angle), 4.5),
    );
  }
  return rings;
}

/** A card game: two fanned cards, the front one with a diamond cut out. */
function cards(): Ring[] {
  const card = roundedRect(-30, -84, 60, 84, 7);
  const front = turn(card, 10, 0, 40);
  const back = turn(roundedRect(-40, -88, 60, 84, 7), -12, 0, 40);
  const diamond = turn([0, -64, 13, -42, 0, -20, -13, -42], 10, 0, 40);
  // The back card shows only to the left of the front card's left side,
  // moved out by a gap so the two read as separate cards.
  const [ax = 0, ay = 0, bx = 0, by = 0] = turn([-30, 0, -30, -84], 10, 0, 40);
  const length = Math.hypot(bx - ax, by - ay);
  const nx = ((by - ay) / length) * 6;
  const ny = (-(bx - ax) / length) * 6;
  return [front, diamond, clip(back, ax + nx, ay + ny, bx + nx, by + ny)];
}

/** A tools lab: a flask with liquid in it and bubbles rising. */
function flask(): Ring[] {
  const rings = stroke(
    round(
      [-25, 4, -13, 4, -13, 40, -52, 114, 52, 114, 13, 40, 13, 4, 25, 4],
      8,
      false,
    ),
    9,
  );
  const liquid = round([-19, 72, 19, 72, 35, 104, -35, 104], 5);
  rings.push(liquid, circle(-8, 92, 5), circle(12, 84, 3.5));
  rings.push(circle(-3, 56, 4), circle(0, 26, 2.5));
  return rings;
}

/** A link hub: two chain links, each passing over the other once. */
function chain(): Ring[] {
  const link = (cx: number) => {
    const path = arc(cx + 22, 0, 26, -90, 90);
    return arc(cx - 22, 0, 26, 90, 270, path);
  };
  // The end arcs overlap so that they cross at right angles, at (0, 18.4)
  // and (0, -18.4), with room for both strokes between the crossings.
  const first = gap(link(-40.4), 0, 18.4, 10.5);
  const second = gap(link(40.4), 0, -18.4, 10.5);
  return [...stroke(first, 9), ...stroke(second, 9)].map((ring) =>
    turn(ring, -45),
  );
}

/** A Discord bot: a terminal window with a prompt. */
function terminal(): Ring[] {
  const rings = [
    roundedRect(0, 0, 176, 124, 14),
    roundedRect(9, 32, 158, 83, 6),
  ];
  for (const x of [22, 38, 54]) rings.push(circle(x, 16, 5));
  rings.push(...stroke([34, 54, 56, 72, 34, 90], 10));
  rings.push(roundedRect(66, 85, 38, 10, 2));
  return rings;
}

/**
 * The outline of every shape the field forms, one entry per id. An entry is
 * a list of rings in any units with y down, filled by the even-odd rule, so a
 * ring inside another cuts a hole. To change a mark, replace its entry, for
 * example with the points of an SVG polygon: the sampler fits any size to
 * the frame and needs no change.
 *
 * TODO(REQ-SCR-01): the five work marks are placeholders until T7SEN
 * supplies the final ones.
 */
export const MARKS: Record<ShapeId, Ring[]> = {
  // The single polygon of public/brand/t7sen-purple.svg, as written there.
  logo: [
    [
      464.22, 0, 464.22, 7.43, 411.18, 73.13, 186.22, 351.77, 113.09, 442.36,
      113.09, 325.94, 186.22, 235.35, 317.19, 73.13, 186.22, 73.13, 186.22,
      164.38, 113.09, 254.97, 113.09, 73.13, 0, 73.13, 0, 0, 464.22, 0,
    ],
  ],
  "making-of": screen(),
  "coup-online": cards(),
  archelab: flask(),
  "t7sen-url": chain(),
  systemseven: terminal(),
};
