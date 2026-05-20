export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>"'`]/g, "");
}
