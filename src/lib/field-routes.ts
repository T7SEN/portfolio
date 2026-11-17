// The routes that show the field. Every other route hides the field's
// wrapper, so the engine pauses by itself and a route that never had the
// field loads no 3D code (REQ-CNT-02). The engine host and the easter eggs
// both read this one list.
export const FIELD_ROUTES: readonly string[] = ["/"];

export function isFieldRoute(pathname: string): boolean {
  return FIELD_ROUTES.includes(pathname);
}
