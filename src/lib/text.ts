export function trimTerminalPunctuation(value: string): string {
  return value.replace(/[.!?…]+$/u, '').trimEnd();
}
