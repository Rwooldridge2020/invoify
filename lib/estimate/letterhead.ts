/**
 * Shared RW Grading letterhead. The estimate HTML and the default invoice
 * template both read these values so the header, logo, and type stay one look.
 */

export const RW_LETTERHEAD = {
    // Arial first, then the faces the invoice PDF already embeds, so a missing
    // glyph (Hebrew, Arabic, Azerbaijani schwa) still has a shipped font.
    fontFamily:
        "Arial, Helvetica, 'IBM Plex Sans', 'Noto Sans Hebrew', 'Noto Sans Arabic', sans-serif",
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
