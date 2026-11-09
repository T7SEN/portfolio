// A study that has not shipped says so wherever it is listed, so it never
// reads as a running product (REQ-CNT-04, A14).
export function InProgressLabel() {
  return (
    <span className="inline-flex items-center rounded-full border border-edge px-2.5 py-0.5 font-mono text-label text-text">
      In progress
    </span>
  );
}
