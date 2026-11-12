import { calculateLine, resetLine } from "./calculate";
import { addDays, isIsoDate } from "./dates";
import { formatPercent, roundHalfUp, sumMoney } from "./money";
import {
    ESTIMATE_SCHEMA_VERSION,
    JOB_FILE_KIND,
    MAX_JOB_FILE_BYTES,
    emptyCustomer,
    estimateSchema,
    jobFileSchema,
    type EstimateCatalog,
    type EstimateDocument,
    type EstimateLine,
    type JobFile,
} from "./schema";

export const DEFAULTS_KEY = "rwg:estimateDefaults";
export const LIBRARY_KEY = "rwg:estimateLibrary";
export const DRAFT_KEY = "rwg:estimateDraft";

export function termsForPercent(percent: number): string {
    if (percent > 0) {
        return `COD. ${formatPercent(percent)}% deposit to schedule.`;
    }
    return "COD.";
}

export function nextEstimateNumber(
    existing: { estimateNumber: string }[],
    isoDate: string
): string {
    const year = isoDate.slice(0, 4);
    const pattern = new RegExp(`^${year}-(\\d+)$`);
    let max = 0;
    for (const doc of existing) {
        const match = doc.estimateNumber.trim().match(pattern);
        if (match) max = Math.max(max, Number(match[1]));
    }
    return `${year}-${String(max + 1).padStart(3, "0")}`;
}

export function recalculate(doc: EstimateDocument): EstimateDocument {
    const lines = doc.lines.map(calculateLine);
    const customerTotal = sumMoney(lines.map((line) => line.customerTotal));
    const profitKnown = lines.every((line) => line.internalKnown);
    const internalTotal = sumMoney(
        lines
            .filter((line) => line.internalKnown)
            .map((line) => line.internalTotal)
    );
    const profit = profitKnown ? roundHalfUp(customerTotal - internalTotal) : 0;
    const depositAmount = doc.depositAmountOverridden
        ? doc.depositAmount
        : doc.depositPercent > 0
          ? roundHalfUp((customerTotal * doc.depositPercent) / 100)
          : null;
    const depositTerms = doc.depositTermsOverridden
        ? doc.depositTerms
        : termsForPercent(doc.depositPercent);
    const validThrough = doc.expirationOverridden
        ? doc.validThrough
        : isIsoDate(doc.estimateDate)
          ? addDays(doc.estimateDate, doc.validityDays)
          : "";
    return {
        ...doc,
        lines,
        customerTotal,
        internalTotal,
        profit,
        profitKnown,
        depositAmount,
        depositTerms,
        validThrough,
    };
}

export function createDocument(
    catalog: EstimateCatalog,
    existing: { estimateNumber: string }[],
    nowIso: string,
    estimateDate: string
): EstimateDocument {
    const rules = structuredClone(catalog.rules);
    return recalculate({
        schemaVersion: ESTIMATE_SCHEMA_VERSION,
        id: crypto.randomUUID(),
        quoteId: crypto.randomUUID(),
        revision: 1,
        status: "draft",
        issuedAt: null,
        basedOn: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        estimateNumber: nextEstimateNumber(existing, estimateDate),
        estimateDate,
        validityDays: rules.validityDays,
        validThrough: estimateDate,
        validityDaysOverridden: false,
        expirationOverridden: false,
        headerOverridden: false,
        sender: structuredClone(catalog.sender),
        customer: emptyCustomer(),
        scope: "",
        lines: [],
        depositPercent: rules.depositPercent,
        depositPercentOverridden: false,
        depositTerms: "",
        depositTermsOverridden: false,
        depositAmount: null,
        depositAmountOverridden: false,
        customerNotes: "",
        exclusions: "",
        internalNotes: "",
        acceptedBy: "",
        acceptedDate: "",
        signatureDataUrl: "",
        logoDataUrl: "",
        pdfTemplate: 1,
        ruleSnapshot: rules,
        customerTotal: 0,
        internalTotal: 0,
        profit: 0,
        profitKnown: true,
    });
}

export function applyDefaults(
    doc: EstimateDocument,
    catalog: EstimateCatalog
): EstimateDocument {
    const rules = structuredClone(catalog.rules);
    const lines = doc.lines.map((line) => {
        if (line.pricingMode === "fixed") return line;
        const next: EstimateLine = { ...line };
        const overridden = new Set(line.overriddenFields);
        if (
            line.category === "vendor" &&
            !line.markupWaived &&
            !overridden.has("markup")
        ) {
            next.markup = rules.vendorMarkup;
        }
        if (line.category === "fuel") {
            if (!overridden.has("dieselPrice")) {
                next.dieselPrice = rules.dieselPricePerGallon;
            }
            if (!overridden.has("fuelAdder")) {
                next.fuelAdder = rules.fuelAdderPerGallon;
            }
        }
        if (line.category === "labor" && !overridden.has("rate")) {
            next.rate = rules.laborRatePerHour;
        }
        if (
            line.category === "equipment" &&
            !overridden.has("rate") &&
            line.catalogItemId
        ) {
            const item = rules.equipment.find(
                (entry) => entry.id === line.catalogItemId
            );
            if (item) {
                next.rate = item.rate;
                next.unit = item.unit;
            }
        }
        if (
            line.category === "mobilization" &&
            !line.markupWaived &&
            !overridden.has("mobilizationPercent")
        ) {
            next.mobilizationPercent = rules.mobilizationPercent;
        }
        return next;
    });
    return recalculate({
        ...doc,
        lines,
        ruleSnapshot: rules,
        validityDays: doc.validityDaysOverridden
            ? doc.validityDays
            : rules.validityDays,
        depositPercent: doc.depositPercentOverridden
            ? doc.depositPercent
            : rules.depositPercent,
        sender: doc.headerOverridden
            ? doc.sender
            : structuredClone(catalog.sender),
    });
}

export function resetQuoteLines(doc: EstimateDocument): EstimateDocument {
    return recalculate({
        ...doc,
        lines: doc.lines.map((line) => resetLine(line, doc.ruleSnapshot)),
    });
}

export function issueDocument(
    doc: EstimateDocument,
    nowIso: string
): EstimateDocument {
    if (doc.status === "issued") return doc;
    return {
        ...recalculate(doc),
        status: "issued",
        issuedAt: nowIso,
        updatedAt: nowIso,
    };
}

export function reviseDocument(
    issued: EstimateDocument,
    nowIso: string
): EstimateDocument {
    if (issued.status !== "issued") {
        throw new Error("Revise an issued estimate.");
    }
    const copy = structuredClone(issued);
    return {
        ...copy,
        id: crypto.randomUUID(),
        revision: issued.revision + 1,
        status: "draft",
        issuedAt: null,
        basedOn: { id: issued.id, revision: issued.revision },
        createdAt: nowIso,
        updatedAt: nowIso,
    };
}

export function copyAsNewDraft(
    source: EstimateDocument,
    nowIso: string,
    estimateNumber: string
): EstimateDocument {
    const copy = structuredClone(source);
    return recalculate({
        ...copy,
        id: crypto.randomUUID(),
        quoteId: crypto.randomUUID(),
        revision: 1,
        status: "draft",
        issuedAt: null,
        basedOn: { id: source.id, revision: source.revision },
        createdAt: nowIso,
        updatedAt: nowIso,
        estimateNumber,
        lines: copy.lines.map((line) => ({
            ...line,
            id: crypto.randomUUID(),
        })),
    });
}

export function upsertLibrary(
    library: EstimateDocument[],
    doc: EstimateDocument
): EstimateDocument[] {
    const index = library.findIndex((row) => row.id === doc.id);
    if (index === -1) return [...library, doc];
    if (library[index].status === "issued") {
        throw new Error(
            "Issued estimates stay issued. Revise to make a new draft."
        );
    }
    const next = library.slice();
    next[index] = doc;
    return next;
}

export type ImportChoice = "copy" | "replace-draft";

export type ImportPlan =
    | { type: "insert"; document: EstimateDocument }
    | { type: "replace"; document: EstimateDocument }
    | { type: "needs-choice"; reason: "draft" | "issued" | "revision" }
    | { type: "reject"; reason: string };

export function planImport(
    library: EstimateDocument[],
    incoming: EstimateDocument,
    nowIso: string,
    choice?: ImportChoice
): ImportPlan {
    const sameId = library.find((row) => row.id === incoming.id);
    const revisionClash = library.find(
        (row) =>
            row.quoteId === incoming.quoteId &&
            row.revision === incoming.revision &&
            row.id !== incoming.id
    );
    const clash = sameId ?? revisionClash;
    if (!clash) {
        if (choice === "copy") {
            return {
                type: "insert",
                document: copyAsNewDraft(
                    incoming,
                    nowIso,
                    incoming.estimateNumber
                ),
            };
        }
        return { type: "insert", document: incoming };
    }

    const blocked = clash.status === "issued" || !sameId;
    if (choice === "replace-draft") {
        if (blocked) {
            return {
                type: "reject",
                reason: "Issued revisions stay as they were issued. Open a copy instead.",
            };
        }
        return {
            type: "replace",
            document: { ...incoming, status: "draft", issuedAt: null },
        };
    }
    if (choice === "copy") {
        return {
            type: "insert",
            document: copyAsNewDraft(incoming, nowIso, incoming.estimateNumber),
        };
    }
    return {
        type: "needs-choice",
        reason:
            clash.status === "issued"
                ? "issued"
                : sameId
                  ? "draft"
                  : "revision",
    };
}

export function toJobFile(doc: EstimateDocument, exportedAt: string): JobFile {
    return {
        kind: JOB_FILE_KIND,
        schemaVersion: ESTIMATE_SCHEMA_VERSION,
        exportedAt,
        estimate: recalculate(doc),
    };
}

export function parseJobFile(
    text: string
): { ok: true; file: JobFile } | { ok: false; error: string } {
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > MAX_JOB_FILE_BYTES) {
        return { ok: false, error: "File is too large." };
    }
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return { ok: false, error: "File is not valid JSON." };
    }
    if (!json || typeof json !== "object") {
        return { ok: false, error: "Unsupported file." };
    }
    const record = json as { kind?: unknown; schemaVersion?: unknown };
    if (record.kind !== JOB_FILE_KIND) {
        return {
            ok: false,
            error: "Unsupported file. Use an RW Grading estimate job file.",
        };
    }
    if (record.schemaVersion !== ESTIMATE_SCHEMA_VERSION) {
        return {
            ok: false,
            error: `Unsupported schema version.`,
        };
    }
    const parsed = jobFileSchema.safeParse(json);
    if (!parsed.success) {
        return { ok: false, error: "Estimate file failed validation." };
    }
    return { ok: true, file: parsed.data };
}

export function parseLibrary(raw: unknown): {
    documents: EstimateDocument[];
    preserved: unknown[];
    rejected: number;
} {
    if (!Array.isArray(raw)) {
        return { documents: [], preserved: [], rejected: 0 };
    }
    const documents: EstimateDocument[] = [];
    const preserved: unknown[] = [];
    let rejected = 0;
    for (const row of raw) {
        const parsed = estimateSchema.safeParse(row);
        if (parsed.success) documents.push(parsed.data);
        else {
            rejected += 1;
            preserved.push(row);
        }
    }
    return { documents, preserved, rejected };
}

export function safeFileStem(estimateNumber: string, revision: number): string {
    const stem = estimateNumber
        .trim()
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-|-$/g, "");
    return `${stem || "estimate"}-r${revision}`;
}
