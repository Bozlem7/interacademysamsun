/** Strips the internal "[seed]" marker appended to demo/test student records so it never reaches the UI. */
export function stripSeedTag(fullName: string): string {
  return fullName.replace(/\s*\[seed\]\s*$/i, "").trim();
}
