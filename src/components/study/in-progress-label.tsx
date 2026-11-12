import { Badge } from "@/components/site/badge";
import { studyPage } from "@/content/pages";

// A study that has not shipped says so wherever it is listed, so it never
// reads as a running product (REQ-CNT-04, A14). Violet with an open circle,
// so the state shows in shape as well as colour.
export function InProgressLabel() {
  return <Badge tone="progress">{studyPage.inProgress}</Badge>;
}
