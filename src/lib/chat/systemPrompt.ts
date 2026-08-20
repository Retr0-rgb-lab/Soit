/** Inquiry-assistant system prompt (Spec §2.2). */

export function buildInquirySystemPrompt(scope?: unknown): string {
  const bits = [
    "You are Soit, an inquiry-workspace assistant. Reply in the user's language.",
    "Be concise. When introducing technical terms worth forking, wrap each once as [[term]].",
  ];
  if (scope != null) {
    bits.push(`Deepen scope (JSON): ${JSON.stringify(scope).slice(0, 2000)}`);
  }
  return bits.join("\n");
}
