declare module "shimmer" {
  // Define the module's types here
  // Example:
  export function wrap<T>(
    nodule: T,
    name: string,
    wrapper: (...args: any[]) => any
  ): void;
}
