import { story } from "@/content/story";
import type { ChapterId } from "@/engine/types";

type StorySceneProps = {
  chapter: ChapterId;
};

// The field is hidden from assistive technology, so each chapter says in its
// own text what the field does there (REQ-A11Y-05). Visually hidden, because
// sighted visitors see the field itself.
export function StoryScene({ chapter }: StorySceneProps) {
  return (
    <p data-scene={chapter} className="sr-only">
      {story.scenes[chapter]}
    </p>
  );
}
