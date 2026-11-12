/**
 * Shared RW Grading letterhead. The estimate HTML and the default invoice
 * template both read these values so the header, logo, and type stay one look.
 */

export const RW_LETTERHEAD = {
    // Only faces the PDF build embeds. Leading with Arial/Helvetica made Linux
    // CI pick Liberation (an Arial alias) and embed that instead of Noto for
    // Hebrew, Arabic, and latin-ext text.
    fontFamily:
        "'IBM Plex Sans', 'Noto Sans Hebrew', 'Noto Sans Arabic', sans-serif",
    text: "#222",
    title: "#6d6d6d",
    titleSize: "26pt",
    titleWeight: 500,
    rule: "#222",
    tableHeader: "#efefef",
    logoWidth: "220px",
} as const;

export function letterheadLines(party: {
    name: string;
    address: string;
    city: string;
    region: string;
    postalCode: string;
    email: string;
    phone: string;
    website?: string;
}): string[] {
    const city = [party.city, party.region].filter(Boolean).join(", ");
    const cityLine = [city, party.postalCode].filter(Boolean).join(" ");
    return [
        party.name,
        party.address,
        cityLine,
        party.email,
        party.phone,
        party.website ?? "",
    ].filter((line) => line.trim() !== "");
}
