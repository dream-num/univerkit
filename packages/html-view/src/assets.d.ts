/** SDK build-time text imports; no asset loader is required by consumers. */
declare module "*?raw" {
  const source: string;
  export default source;
}
