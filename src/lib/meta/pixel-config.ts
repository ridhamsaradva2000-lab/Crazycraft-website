export function isValidMetaPixelId(id: string | undefined): id is string {
  return typeof id === "string" && /^\d{9,20}$/.test(id);
}
