/** Calendar-date helpers. ISO `YYYY-MM-DD` is the stored form, in UTC so a day cannot shift. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
    if (!ISO_DATE.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

export function addDays(isoDate: string, days: number): string {
    if (!isIsoDate(isoDate)) {
        throw new Error("Date must be YYYY-MM-DD");
    }
    if (!Number.isInteger(days)) {
        throw new Error("Days must be a whole number");
    }
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function formatUsDate(isoDate: string): string {
    if (!isIsoDate(isoDate)) return "";
    const [year, month, day] = isoDate.split("-").map(Number);
    return `${month}/${day}/${year}`;
}

export function todayIsoDate(now: Date = new Date()): string {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
