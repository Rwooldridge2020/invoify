/**
 * Download names for RW Grading documents.
 *
 * `RWG_Invoice_Smith-Co_1001.pdf` and `RWG_Estimate_Smith-Co_2026-001.pdf`.
 * Spaces become hyphens. Characters that are illegal in a filename are dropped.
 * A blank customer or number falls back so the name still has both parts.
 */

const ILLEGAL = /[^A-Za-z0-9._-]+/g;

function slug(value: string, fallback: string): string {
    const cleaned = value
        .trim()
        .replace(/\s+/g, "-")
        .replace(ILLEGAL, "")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");
    return cleaned || fallback;
}

export function documentFileName(
    kind: "Invoice" | "Estimate",
    customer: string,
    number: string,
    extension: string
): string {
    const who = slug(customer, "Customer");
    const num = slug(number, "Number");
    const ext = slug(extension.replace(/^\./, ""), "pdf");
    return `RWG_${kind}_${who}_${num}.${ext}`;
}

/** Accept only names this helper produces, so an upload cannot set the attachment path. */
export function safePdfAttachmentName(name: string): string {
    return /^RWG_(Invoice|Estimate)_[A-Za-z0-9][A-Za-z0-9._-]*_[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/.test(
        name
    )
        ? name
        : "invoice.pdf";
}
