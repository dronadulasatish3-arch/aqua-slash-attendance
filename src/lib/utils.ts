// Small formatting & validation helpers

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/** "14:32:05" → "2:32 PM" */
export function prettyTime(hms?: string): string {
  if (!hms) return "—";
  const m = hms.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return hms;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${min} ${ampm}`;
}

export function todayDisplay(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
