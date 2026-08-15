const secret = /password|비밀번호|secret|otp|mfa|인증/i;
export const isSensitive = (
  role: string,
  name: string,
  autocomplete?: string,
): boolean =>
  role === "password" ||
  secret.test(name) ||
  /one-time-code/i.test(autocomplete ?? "");
export const redactName = (name: string): string =>
  [
    ...name
      .split("")
      .map((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127 ? " " : character;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .slice(0, 160)
    .join("");
