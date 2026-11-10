"use client";

import { useEffect, useRef, useState } from "react";

import { editLine, createLine } from "@/lib/estimate/calculate";
import {
    DEFAULTS_KEY,
    DRAFT_KEY,
    LIBRARY_KEY,
    applyDefaults,
    copyAsNewDraft,
    createDocument,
    issueDocument,
    nextEstimateNumber,
    parseJobFile,
    parseLibrary,
    planImport,
    recalculate,
    resetQuoteLines,
    reviseDocument,
    toJobFile,
    upsertLibrary,
} from "@/lib/estimate/document";
import { customerEstimateHtml } from "@/lib/estimate/html";
import { formatMoney, formatPercent } from "@/lib/estimate/money";
import {
    SUGGESTED_CATALOG,
    SUGGESTED_EXCAVATOR_ID,
    catalogSchema,
    estimateSchema,
    type Category,
    type EstimateCatalog,
    type EstimateDocument,
    type EstimateLine,
} from "@/lib/estimate/schema";
import { toCustomerView } from "@/lib/estimate/view";
import { documentFileName } from "@/lib/downloadName";
import { readSecure, writeSecure } from "@/lib/secureStore";

const LOGO_SRC = "/assets/img/rw-grading-logo.png";

function localIsoDate(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function nowIso(): string {
    return new Date().toISOString();
}

function asNumber(value: string): number {
    if (value.trim() === "") return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function EstimateWorkspace() {
    const [ready, setReady] = useState(false);
    const [catalog, setCatalog] = useState<EstimateCatalog>(SUGGESTED_CATALOG);
    const [catalogDraft, setCatalogDraft] =
        useState<EstimateCatalog>(SUGGESTED_CATALOG);
    const [library, setLibrary] = useState<EstimateDocument[]>([]);
    const [doc, setDoc] = useState<EstimateDocument | null>(null);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [draftState, setDraftState] = useState("");
    const [confirmNew, setConfirmNew] = useState(false);
    const [importChoice, setImportChoice] = useState<EstimateDocument | null>(
        null
    );
    const [pdfBusy, setPdfBusy] = useState(false);
    const preserved = useRef<unknown[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    // A draft that fails validation stays in storage. Autosave must not
    // replace it with the blank estimate opened in its place.
    const blockDraftWrite = useRef(false);

    useEffect(() => {
        let active = true;
        void (async () => {
            const storedCatalog = await readSecure<unknown>(DEFAULTS_KEY);
            const parsedCatalog = catalogSchema.safeParse(storedCatalog);
            const nextCatalog = parsedCatalog.success
                ? parsedCatalog.data
                : SUGGESTED_CATALOG;
            const storedLibrary = await readSecure<unknown>(LIBRARY_KEY);
            const parsedLibrary = parseLibrary(storedLibrary);
            const storedDraft = await readSecure<unknown>(DRAFT_KEY);
            const draft = estimateSchema.safeParse(storedDraft);
            const unreadDraft = !draft.success && storedDraft != null;
            blockDraftWrite.current = unreadDraft;
            const current = draft.success
                ? recalculate(draft.data)
                : createDocument(
                      nextCatalog,
                      parsedLibrary.documents,
                      nowIso(),
                      localIsoDate()
                  );
            if (!active) return;
            if (unreadDraft) {
                setNotice(
                    "A saved draft could not be opened. It was left in storage."
                );
            }
            preserved.current = parsedLibrary.preserved;
            setCatalog(nextCatalog);
            setCatalogDraft(nextCatalog);
            setLibrary(parsedLibrary.documents);
            setDoc(current);
            setReady(true);
            if (parsedLibrary.rejected > 0) {
                setNotice(
                    `${parsedLibrary.rejected} saved estimate(s) could not be read and were left in storage.`
                );
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!ready || !doc || blockDraftWrite.current) return;
        setDraftState("Saving draft…");
        const timer = window.setTimeout(() => {
            void writeSecure(DRAFT_KEY, doc).then((ok) => {
                setDraftState(ok ? "Draft saved" : "Draft was not saved");
            });
        }, 600);
        return () => window.clearTimeout(timer);
    }, [doc, ready]);

    async function writeLibrary(rows: EstimateDocument[]): Promise<boolean> {
        return writeSecure(LIBRARY_KEY, [...rows, ...preserved.current]);
    }

    function update(patch: Partial<EstimateDocument>) {
        setDoc((current) => {
            if (!current || current.status === "issued") return current;
            return recalculate({
                ...current,
                ...patch,
                updatedAt: nowIso(),
            });
        });
    }

    function updateLine(id: string, patch: Partial<EstimateLine>) {
        setDoc((current) => {
            if (!current || current.status === "issued") return current;
            const lines = current.lines.map((line) => {
                if (line.id !== id) return line;
                let nextPatch = patch;
                if (
                    patch.pricingMode === "fixed" &&
                    line.pricingMode !== "fixed"
                ) {
                    nextPatch = { ...patch, rate: line.customerUnitPrice };
                }
                return editLine(line, nextPatch, current.ruleSnapshot);
            });
            return recalculate({ ...current, lines, updatedAt: nowIso() });
        });
    }

    function addLine(category: Category) {
        if (!doc || doc.status === "issued") return;
        const excavator = doc.ruleSnapshot.equipment.find(
            (item) => item.id === SUGGESTED_EXCAVATOR_ID
        );
        const line = createLine(
            category,
            doc.ruleSnapshot,
            category === "equipment"
                ? { catalogItemId: excavator?.id ?? null }
                : {}
        );
        update({ lines: [...doc.lines, line] });
    }

    async function save() {
        if (!doc) return;
        if (doc.status === "issued") {
            setError("This revision is issued. Revise to edit it.");
            return;
        }
        try {
            const next = recalculate({ ...doc, updatedAt: nowIso() });
            const rows = upsertLibrary(library, next);
            const ok =
                (await writeLibrary(rows)) &&
                (await writeSecure(DRAFT_KEY, next));
            setLibrary(rows);
            setDoc(next);
            setError("");
            setNotice(
                ok
                    ? "Estimate saved in this browser."
                    : "Could not save in this browser."
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save.");
        }
    }

    async function issue() {
        if (!doc || doc.status === "issued") return;
        const issued = issueDocument(doc, nowIso());
        try {
            const rows = upsertLibrary(library, issued);
            await writeLibrary(rows);
            await writeSecure(DRAFT_KEY, issued);
            setLibrary(rows);
            setDoc(issued);
            setError("");
            setNotice(
                "Issued. This revision stays as issued. Revise to change it."
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not issue.");
        }
    }

    async function revise() {
        if (!doc || doc.status !== "issued") return;
        const revision = reviseDocument(doc, nowIso());
        const rows = library.some((row) => row.id === doc.id)
            ? [...library, revision]
            : [...library, doc, revision];
        await writeLibrary(rows);
        await writeSecure(DRAFT_KEY, revision);
        setLibrary(rows);
        setDoc(revision);
        setNotice(
            `Revision ${revision.revision} is a new draft. Revision ${doc.revision} is unchanged.`
        );
    }

    async function duplicate() {
        if (!doc) return;
        const date = localIsoDate();
        const copy = copyAsNewDraft(
            doc,
            nowIso(),
            nextEstimateNumber([...library, doc], date)
        );
        const rows = [...library, copy];
        await writeLibrary(rows);
        await writeSecure(DRAFT_KEY, copy);
        setLibrary(rows);
        setDoc(copy);
        setNotice("Opened a copy as a new draft.");
    }

    function startNew() {
        blockDraftWrite.current = false;
        const created = createDocument(
            catalog,
            library,
            nowIso(),
            localIsoDate()
        );
        setDoc(created);
        setConfirmNew(false);
        setNotice("New estimate. The customer is blank.");
        void writeSecure(DRAFT_KEY, created);
    }

    async function exportFile() {
        if (!doc) return;
        const current = recalculate(doc);
        let logo = current.logoDataUrl;
        if (!logo) {
            const response = await fetch(LOGO_SRC);
            if (response.ok) {
                const blob = await response.blob();
                logo = await blobToDataUrl(blob);
            }
        }
        const file = toJobFile({ ...current, logoDataUrl: logo }, nowIso());
        const blob = new Blob([JSON.stringify(file, null, 2)], {
            type: "application/json",
        });
        downloadBlob(
            blob,
            documentFileName(
                "Estimate",
                current.customer.name,
                current.estimateNumber,
                "json"
            )
        );
    }

    async function onImport(file: File) {
        const text = await file.text();
        const parsed = parseJobFile(text);
        if (!parsed.ok) {
            setError(parsed.error);
            return;
        }
        const plan = planImport(library, parsed.file.estimate, nowIso());
        if (plan.type === "needs-choice") {
            setImportChoice(parsed.file.estimate);
            setError("");
            return;
        }
        if (plan.type === "reject") {
            setError(plan.reason);
            return;
        }
        await storeImported(plan.document, plan.type === "replace");
    }

    async function chooseImport(choice: "copy" | "replace-draft") {
        if (!importChoice) return;
        const plan = planImport(library, importChoice, nowIso(), choice);
        if (plan.type === "reject" || plan.type === "needs-choice") {
            setError(
                plan.type === "reject" ? plan.reason : "Choose how to import."
            );
            return;
        }
        await storeImported(plan.document, plan.type === "replace");
    }

    async function storeImported(
        document: EstimateDocument,
        replaced: boolean
    ) {
        blockDraftWrite.current = false;
        try {
            const rows = library.some((row) => row.id === document.id)
                ? upsertLibrary(library, document)
                : [...library, document];
            await writeLibrary(rows);
            await writeSecure(DRAFT_KEY, document);
            setLibrary(rows);
            setDoc(recalculate(document));
            setImportChoice(null);
            setError("");
            setNotice(
                replaced
                    ? "Replaced the matching draft."
                    : "Estimate stored. An issued revision was not overwritten."
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not import.");
        }
    }

    async function downloadPdf() {
        if (!doc) return;
        setPdfBusy(true);
        setError("");
        try {
            const response = await fetch("/api/estimate/pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(recalculate(doc)),
            });
            if (!response.ok) throw new Error("PDF failed");
            const blob = await response.blob();
            downloadBlob(
                blob,
                documentFileName(
                    "Estimate",
                    doc.customer.name,
                    doc.estimateNumber,
                    "pdf"
                )
            );
        } catch {
            setError("Could not generate the PDF.");
        } finally {
            setPdfBusy(false);
        }
    }

    async function saveDefaults() {
        const parsed = catalogSchema.safeParse(catalogDraft);
        if (!parsed.success) {
            setError("Defaults are not valid.");
            return;
        }
        const ok = await writeSecure(DEFAULTS_KEY, parsed.data);
        setCatalog(parsed.data);
        setError("");
        setNotice(
            ok
                ? "Defaults saved. Quotes already opened were not changed."
                : "Could not save defaults in this browser."
        );
    }

    async function applyToThisQuote() {
        if (!doc || doc.status === "issued") return;
        const parsed = catalogSchema.safeParse(catalogDraft);
        if (!parsed.success) {
            setError("Defaults are not valid.");
            return;
        }
        await writeSecure(DEFAULTS_KEY, parsed.data);
        setCatalog(parsed.data);
        setDoc(applyDefaults({ ...doc, updatedAt: nowIso() }, parsed.data));
        setError("");
        setNotice("Defaults applied to this quote only.");
    }

    function openSaved(row: EstimateDocument) {
        blockDraftWrite.current = false;
        const copy = recalculate(structuredClone(row));
        setDoc(copy);
        void writeSecure(DRAFT_KEY, copy);
        setNotice(
            copy.status === "issued"
                ? "Opened the issued revision. It is read-only."
                : "Opened the saved draft."
        );
    }

    if (!ready || !doc) {
        return (
            <p className="text-sm text-muted-foreground">Loading estimate…</p>
        );
    }

    const locked = doc.status === "issued";
    const preview = customerEstimateHtml(
        toCustomerView(doc, doc.logoDataUrl || LOGO_SRC)
    );

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="mr-auto text-xl font-semibold">
                        RW Grading Estimates
                    </h1>
                    <span data-testid="status" className="text-sm uppercase">
                        {doc.status}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        {draftState}
                    </span>
                </div>
                {notice && <p className="text-sm">{notice}</p>}
                {error && (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={btn}
                        onClick={() => setConfirmNew(true)}
                    >
                        New estimate
                    </button>
                    <button
                        type="button"
                        className={btn}
                        onClick={() => void save()}
                        disabled={locked}
                    >
                        Save estimate
                    </button>
                    <button
                        type="button"
                        className={btn}
                        onClick={() => void issue()}
                        disabled={locked}
                    >
                        Issue estimate
                    </button>
                    <button
                        type="button"
                        className={btn}
                        onClick={() => void revise()}
                        disabled={!locked}
                    >
                        Revise
                    </button>
                    <button
                        type="button"
                        className={btn}
                        onClick={() => void duplicate()}
                    >
                        Duplicate
                    </button>
                    <button
                        type="button"
                        className={btn}
                        onClick={() => void exportFile()}
                    >
                        Export job file
                    </button>
                    <button
                        type="button"
                        className={btn}
                        onClick={() => fileRef.current?.click()}
                    >
                        Import job file
                    </button>
                    <button
                        type="button"
                        className={btn}
                        onClick={() => void downloadPdf()}
                        disabled={pdfBusy}
                    >
                        Download PDF
                    </button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        aria-label="Import job file"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void onImport(file);
                            event.target.value = "";
                        }}
                    />
                </div>
                {confirmNew && (
                    <div className="flex flex-wrap gap-2 rounded-md border p-3 text-sm">
                        <span>
                            Start a new estimate? Save first if this draft
                            should stay in the list.
                        </span>
                        <button
                            type="button"
                            className={btn}
                            onClick={startNew}
                        >
                            Start new
                        </button>
                        <button
                            type="button"
                            className={btn}
                            onClick={() => setConfirmNew(false)}
                        >
                            Keep editing
                        </button>
                    </div>
                )}
                {importChoice && (
                    <div className="space-y-2 rounded-md border p-3 text-sm">
                        <p>
                            This file matches a saved {importChoice.status}{" "}
                            revision. Issued revisions are not replaced.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={btn}
                                onClick={() => void chooseImport("copy")}
                            >
                                Open as a new copy
                            </button>
                            <button
                                type="button"
                                className={btn}
                                disabled={importChoice.status === "issued"}
                                onClick={() =>
                                    void chooseImport("replace-draft")
                                }
                            >
                                Replace this draft
                            </button>
                            <button
                                type="button"
                                className={btn}
                                onClick={() => setImportChoice(null)}
                            >
                                Cancel import
                            </button>
                        </div>
                    </div>
                )}

                <section className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                        Estimate number
                        <input
                            className={field}
                            value={doc.estimateNumber}
                            disabled={locked}
                            onChange={(event) =>
                                update({ estimateNumber: event.target.value })
                            }
                        />
                    </label>
                    <label className="text-sm">
                        Estimate date
                        <input
                            className={field}
                            type="date"
                            value={doc.estimateDate}
                            disabled={locked}
                            onChange={(event) =>
                                update({ estimateDate: event.target.value })
                            }
                        />
                    </label>
                    <label className="text-sm">
                        Validity days
                        <input
                            className={field}
                            type="number"
                            value={doc.validityDays}
                            disabled={locked}
                            onChange={(event) =>
                                update({
                                    validityDays: Math.max(
                                        0,
                                        Math.round(asNumber(event.target.value))
                                    ),
                                    validityDaysOverridden: true,
                                    expirationOverridden: false,
                                })
                            }
                        />
                    </label>
                    <label className="text-sm">
                        Expiration date
                        <input
                            className={field}
                            type="date"
                            value={doc.validThrough}
                            disabled={locked}
                            onChange={(event) =>
                                update({
                                    validThrough: event.target.value,
                                    expirationOverridden: true,
                                })
                            }
                        />
                    </label>
                </section>

                <section className="rounded-md border p-3">
                    <h2 className="font-semibold">Deposit</h2>
                    <p className="text-sm text-muted-foreground">
                        Default is COD and 30% to schedule. Change it on this
                        quote only.
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm">
                            Deposit percent
                            <input
                                className={field}
                                type="number"
                                value={doc.depositPercent}
                                disabled={locked}
                                onChange={(event) =>
                                    update({
                                        depositPercent: asNumber(
                                            event.target.value
                                        ),
                                        depositPercentOverridden: true,
                                    })
                                }
                            />
                        </label>
                        <p
                            className="self-end text-sm"
                            data-testid="deposit-amount"
                        >
                            Deposit to schedule:{" "}
                            {doc.depositAmount === null
                                ? "—"
                                : formatMoney(doc.depositAmount)}
                        </p>
                    </div>
                    <label className="mt-2 block text-sm">
                        Deposit terms
                        <textarea
                            className={field}
                            rows={2}
                            value={doc.depositTerms}
                            disabled={locked}
                            onChange={(event) =>
                                update({
                                    depositTerms: event.target.value,
                                    depositTermsOverridden: true,
                                })
                            }
                        />
                    </label>
                </section>

                <PartyFields
                    title="Your company"
                    party={doc.sender}
                    website={doc.sender.website}
                    locked={locked}
                    onChange={(party) =>
                        update({
                            sender: {
                                name: party.name,
                                address: party.address,
                                city: party.city,
                                region: party.region,
                                postalCode: party.postalCode,
                                phone: party.phone,
                                email: party.email,
                                website: party.website ?? "",
                            },
                            headerOverridden: true,
                        })
                    }
                />
                <PartyFields
                    title="Customer"
                    party={doc.customer}
                    jobSite={doc.customer.jobSite}
                    locked={locked}
                    onChange={(party) =>
                        update({
                            customer: {
                                name: party.name,
                                address: party.address,
                                city: party.city,
                                region: party.region,
                                postalCode: party.postalCode,
                                phone: party.phone,
                                email: party.email,
                                jobSite: party.jobSite ?? "",
                            },
                        })
                    }
                />

                <label className="block text-sm">
                    Scope
                    <textarea
                        className={field}
                        rows={2}
                        value={doc.scope}
                        disabled={locked}
                        onChange={(event) =>
                            update({ scope: event.target.value })
                        }
                    />
                </label>

                <div className="flex flex-wrap gap-2">
                    {(
                        [
                            ["vendor", "Add vendor line"],
                            ["rental", "Add rental line"],
                            ["fuel", "Add fuel line"],
                            ["labor", "Add labor line"],
                            ["equipment", "Add excavator"],
                            ["mobilization", "Add mobilization line"],
                        ] as const
                    ).map(([category, label]) => (
                        <button
                            key={category}
                            type="button"
                            className={btn}
                            disabled={locked}
                            onClick={() => addLine(category)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {doc.lines.map((line, index) => (
                    <LineEditor
                        key={line.id}
                        index={index}
                        line={line}
                        locked={locked}
                        onChange={(patch) => updateLine(line.id, patch)}
                        onRemove={() =>
                            update({
                                lines: doc.lines.filter(
                                    (row) => row.id !== line.id
                                ),
                            })
                        }
                    />
                ))}

                <label className="block text-sm">
                    Notes
                    <textarea
                        className={field}
                        rows={3}
                        value={doc.customerNotes}
                        disabled={locked}
                        onChange={(event) =>
                            update({ customerNotes: event.target.value })
                        }
                    />
                </label>
                <label className="block text-sm">
                    Exclusions
                    <textarea
                        className={field}
                        rows={3}
                        value={doc.exclusions}
                        disabled={locked}
                        placeholder="One exclusion per line"
                        onChange={(event) =>
                            update({ exclusions: event.target.value })
                        }
                    />
                </label>
                <label className="block text-sm">
                    Internal notes
                    <textarea
                        id="internal-notes"
                        className={field}
                        rows={2}
                        value={doc.internalNotes}
                        disabled={locked}
                        onChange={(event) =>
                            update({ internalNotes: event.target.value })
                        }
                    />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                        Accepted by
                        <input
                            className={field}
                            value={doc.acceptedBy}
                            disabled={locked}
                            onChange={(event) =>
                                update({ acceptedBy: event.target.value })
                            }
                        />
                    </label>
                    <label className="text-sm">
                        Accepted date
                        <input
                            className={field}
                            type="date"
                            value={doc.acceptedDate}
                            disabled={locked}
                            onChange={(event) =>
                                update({ acceptedDate: event.target.value })
                            }
                        />
                    </label>
                </div>

                <section
                    className="rounded-md border border-amber-500/60 p-3"
                    data-testid="internal-panel"
                >
                    <h2 className="font-semibold">
                        Internal — not on the customer PDF
                    </h2>
                    <p data-testid="customer-total">
                        Customer total {formatMoney(doc.customerTotal)}
                    </p>
                    <p data-testid="internal-total">
                        Internal cost{" "}
                        {doc.profitKnown
                            ? formatMoney(doc.internalTotal)
                            : "incomplete"}
                    </p>
                    <p>
                        Profit{" "}
                        {doc.profitKnown
                            ? formatMoney(doc.profit)
                            : "— (a line has no cost basis)"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        This quote&apos;s snapshot: vendor markup{" "}
                        {doc.ruleSnapshot.vendorMarkup}, labor{" "}
                        {formatMoney(doc.ruleSnapshot.laborRatePerHour)}/hr,
                        fuel adder{" "}
                        {formatMoney(doc.ruleSnapshot.fuelAdderPerGallon)},
                        mobilization{" "}
                        {formatPercent(
                            doc.ruleSnapshot.mobilizationPercent * 100
                        )}
                        %, validity {doc.ruleSnapshot.validityDays} days,
                        deposit {doc.ruleSnapshot.depositPercent}
                        %, excavator{" "}
                        {formatMoney(
                            doc.ruleSnapshot.equipment.find(
                                (item) => item.id === SUGGESTED_EXCAVATOR_ID
                            )?.rate ?? 0
                        )}
                        /hr. Saving new defaults does not change this snapshot.
                    </p>
                </section>

                <details className="rounded-md border p-3">
                    <summary className="cursor-pointer font-semibold">
                        Reusable defaults
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Num
                            label="Vendor markup factor"
                            value={catalogDraft.rules.vendorMarkup}
                            onChange={(vendorMarkup) =>
                                setCatalogDraft({
                                    ...catalogDraft,
                                    rules: {
                                        ...catalogDraft.rules,
                                        vendorMarkup,
                                    },
                                })
                            }
                        />
                        <Num
                            label="Diesel price per gallon"
                            value={catalogDraft.rules.dieselPricePerGallon}
                            onChange={(dieselPricePerGallon) =>
                                setCatalogDraft({
                                    ...catalogDraft,
                                    rules: {
                                        ...catalogDraft.rules,
                                        dieselPricePerGallon,
                                    },
                                })
                            }
                        />
                        <Num
                            label="Fuel adder per gallon"
                            value={catalogDraft.rules.fuelAdderPerGallon}
                            onChange={(fuelAdderPerGallon) =>
                                setCatalogDraft({
                                    ...catalogDraft,
                                    rules: {
                                        ...catalogDraft.rules,
                                        fuelAdderPerGallon,
                                    },
                                })
                            }
                        />
                        <Num
                            label="Labor rate per hour"
                            value={catalogDraft.rules.laborRatePerHour}
                            onChange={(laborRatePerHour) =>
                                setCatalogDraft({
                                    ...catalogDraft,
                                    rules: {
                                        ...catalogDraft.rules,
                                        laborRatePerHour,
                                    },
                                })
                            }
                        />
                        <Num
                            label="Mobilization percent"
                            value={catalogDraft.rules.mobilizationPercent * 100}
                            onChange={(percent) =>
                                setCatalogDraft({
                                    ...catalogDraft,
                                    rules: {
                                        ...catalogDraft.rules,
                                        mobilizationPercent: percent / 100,
                                    },
                                })
                            }
                        />
                        <Num
                            label="Validity days"
                            value={catalogDraft.rules.validityDays}
                            onChange={(validityDays) =>
                                setCatalogDraft({
                                    ...catalogDraft,
                                    rules: {
                                        ...catalogDraft.rules,
                                        validityDays: Math.round(validityDays),
                                    },
                                })
                            }
                        />
                        <Num
                            label="Deposit percent"
                            value={catalogDraft.rules.depositPercent}
                            onChange={(depositPercent) =>
                                setCatalogDraft({
                                    ...catalogDraft,
                                    rules: {
                                        ...catalogDraft.rules,
                                        depositPercent,
                                    },
                                })
                            }
                        />
                        {catalogDraft.rules.equipment.map((item, index) => (
                            <Num
                                key={item.id}
                                label={`${item.name} rate`}
                                value={item.rate}
                                onChange={(rate) => {
                                    const equipment =
                                        catalogDraft.rules.equipment.slice();
                                    equipment[index] = { ...item, rate };
                                    setCatalogDraft({
                                        ...catalogDraft,
                                        rules: {
                                            ...catalogDraft.rules,
                                            equipment,
                                        },
                                    });
                                }}
                            />
                        ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={btn}
                            onClick={() => void saveDefaults()}
                        >
                            Save defaults
                        </button>
                        <button
                            type="button"
                            className={btn}
                            disabled={locked}
                            onClick={() => void applyToThisQuote()}
                        >
                            Apply defaults to this quote
                        </button>
                        <button
                            type="button"
                            className={btn}
                            disabled={locked}
                            onClick={() => setDoc(resetQuoteLines(doc))}
                        >
                            Reset quote overrides
                        </button>
                    </div>
                </details>

                <section>
                    <h2 className="font-semibold">Saved estimates</h2>
                    <ul className="mt-2 space-y-2">
                        {library.map((row) => (
                            <li
                                key={row.id}
                                className="flex flex-wrap items-center gap-2 text-sm"
                            >
                                <span>
                                    {row.estimateNumber} r{row.revision}{" "}
                                    {row.status}{" "}
                                    {row.customer.name || "No customer"}{" "}
                                    {formatMoney(row.customerTotal)}
                                </span>
                                <button
                                    type="button"
                                    className={btn}
                                    onClick={() => openSaved(row)}
                                >
                                    Open {row.estimateNumber} r{row.revision}
                                </button>
                            </li>
                        ))}
                        {library.length === 0 && (
                            <li className="text-sm text-muted-foreground">
                                None saved yet.
                            </li>
                        )}
                    </ul>
                </section>
            </div>

            <div className="min-w-0 overflow-x-auto" data-allow-x-overflow>
                <h2 className="mb-2 text-sm font-medium">
                    Customer PDF preview
                </h2>
                <iframe
                    title="Customer PDF preview"
                    data-testid="customer-preview"
                    className="h-[1100px] w-[816px] max-w-none border bg-white"
                    srcDoc={preview}
                />
            </div>
        </div>
    );
}

const btn =
    "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";
const field =
    "mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";

function PartyFields(props: {
    title: string;
    party: {
        name: string;
        address: string;
        city: string;
        region: string;
        postalCode: string;
        phone: string;
        email: string;
    };
    website?: string;
    jobSite?: string;
    locked: boolean;
    onChange: (party: {
        name: string;
        address: string;
        city: string;
        region: string;
        postalCode: string;
        phone: string;
        email: string;
        website?: string;
        jobSite?: string;
    }) => void;
}) {
    const set = (key: string, value: string) =>
        props.onChange({
            ...props.party,
            website: props.website,
            jobSite: props.jobSite,
            [key]: value,
        });
    const prefix = props.title === "Customer" ? "customer" : "sender";
    return (
        <section className="grid gap-3 sm:grid-cols-2">
            <h2 className="sm:col-span-2 font-semibold">{props.title}</h2>
            {(
                [
                    [
                        "name",
                        props.title === "Customer"
                            ? "Customer name"
                            : "Company name",
                    ],
                    ["address", "Street"],
                    ["city", "City"],
                    ["region", "State"],
                    ["postalCode", "ZIP"],
                    ["phone", "Phone"],
                    ["email", "Email"],
                ] as const
            ).map(([key, label]) => (
                <label
                    key={key}
                    className="text-sm"
                    htmlFor={`${prefix}-${key}`}
                >
                    {label}
                    <input
                        id={`${prefix}-${key}`}
                        className={field}
                        value={props.party[key]}
                        disabled={props.locked}
                        onChange={(event) => set(key, event.target.value)}
                    />
                </label>
            ))}
            {props.website !== undefined && (
                <label className="text-sm" htmlFor="sender-website">
                    Website
                    <input
                        id="sender-website"
                        className={field}
                        value={props.website}
                        disabled={props.locked}
                        onChange={(event) => set("website", event.target.value)}
                    />
                </label>
            )}
            {props.jobSite !== undefined && (
                <label className="text-sm sm:col-span-2" htmlFor="customer-job">
                    Job address, if different
                    <input
                        id="customer-job"
                        className={field}
                        value={props.jobSite}
                        disabled={props.locked}
                        onChange={(event) => set("jobSite", event.target.value)}
                    />
                </label>
            )}
        </section>
    );
}

function LineEditor(props: {
    index: number;
    line: EstimateLine;
    locked: boolean;
    onChange: (patch: Partial<EstimateLine>) => void;
    onRemove: () => void;
}) {
    const { line, locked, onChange } = props;
    const formula = line.pricingMode === "formula";
    return (
        <fieldset className="space-y-2 rounded-md border p-3" disabled={locked}>
            <legend className="px-1 text-sm font-semibold">
                Line {props.index + 1} · {line.category}
                {line.pricingMode === "fixed" ? " · fixed price" : ""}
                {line.markupWaived ? " · markup waived" : ""}
                {line.overriddenFields.length > 0
                    ? ` · overridden ${line.overriddenFields.join(", ")}`
                    : ""}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm">
                    Activity
                    <input
                        aria-label="Activity"
                        className={field}
                        value={line.name}
                        onChange={(event) =>
                            onChange({ name: event.target.value })
                        }
                    />
                </label>
                <label className="text-sm">
                    Service date
                    <input
                        aria-label="Service date"
                        className={field}
                        type="date"
                        value={line.serviceDate}
                        onChange={(event) =>
                            onChange({ serviceDate: event.target.value })
                        }
                    />
                </label>
            </div>
            <label className="block text-sm">
                Description
                <textarea
                    aria-label="Description"
                    className={field}
                    rows={2}
                    value={line.description}
                    onChange={(event) =>
                        onChange({ description: event.target.value })
                    }
                />
            </label>
            <div className="flex flex-wrap gap-3 text-sm">
                <label>
                    <input
                        type="radio"
                        name={`mode-${line.id}`}
                        checked={formula}
                        onChange={() => onChange({ pricingMode: "formula" })}
                    />{" "}
                    Formula
                </label>
                <label>
                    <input
                        type="radio"
                        name={`mode-${line.id}`}
                        checked={!formula}
                        onChange={() => onChange({ pricingMode: "fixed" })}
                    />{" "}
                    Fixed price
                </label>
                {(line.category === "vendor" ||
                    line.category === "mobilization") &&
                    formula && (
                        <label>
                            <input
                                type="checkbox"
                                checked={line.markupWaived}
                                onChange={(event) =>
                                    onChange({
                                        markupWaived: event.target.checked,
                                    })
                                }
                            />{" "}
                            Waive markup
                        </label>
                    )}
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
                {!(formula && line.category === "mobilization") && (
                    <>
                        <NumLabel
                            label={
                                formula && line.category === "fuel"
                                    ? "Gallons"
                                    : "Quantity"
                            }
                            value={line.quantity}
                            onChange={(quantity) => onChange({ quantity })}
                        />
                        <label className="text-sm">
                            Unit
                            <input
                                aria-label="Unit"
                                className={field}
                                value={line.unit}
                                onChange={(event) =>
                                    onChange({ unit: event.target.value })
                                }
                            />
                        </label>
                    </>
                )}
                {formula && line.category === "vendor" && (
                    <>
                        <NumLabel
                            label="Cost"
                            value={line.cost}
                            onChange={(cost) => onChange({ cost })}
                        />
                        <label className="text-sm">
                            Tax type
                            <select
                                aria-label="Tax type"
                                className={field}
                                value={line.taxMode}
                                onChange={(event) =>
                                    onChange({
                                        taxMode:
                                            event.target.value === "percent"
                                                ? "percent"
                                                : "amount",
                                    })
                                }
                            >
                                <option value="percent">Percent</option>
                                <option value="amount">Dollars</option>
                            </select>
                        </label>
                        <NumLabel
                            label={
                                line.taxMode === "percent"
                                    ? "Vendor tax percent"
                                    : "Vendor tax"
                            }
                            value={line.tax}
                            onChange={(tax) => onChange({ tax })}
                        />
                        <NumLabel
                            label="Markup factor"
                            value={line.markup}
                            onChange={(markup) => onChange({ markup })}
                        />
                    </>
                )}
                {formula &&
                    (line.category === "rental" ||
                        line.category === "labor" ||
                        line.category === "equipment") && (
                        <NumLabel
                            label="Rate"
                            value={line.rate}
                            onChange={(rate) => onChange({ rate })}
                        />
                    )}
                {formula && line.category === "fuel" && (
                    <>
                        <NumLabel
                            label="Diesel price"
                            value={line.dieselPrice}
                            onChange={(dieselPrice) =>
                                onChange({ dieselPrice })
                            }
                        />
                        <NumLabel
                            label="Fuel adder"
                            value={line.fuelAdder}
                            onChange={(fuelAdder) => onChange({ fuelAdder })}
                        />
                    </>
                )}
                {formula && line.category === "mobilization" && (
                    <>
                        <NumLabel
                            label="Move-in"
                            value={line.moveIn}
                            onChange={(moveIn) => onChange({ moveIn })}
                        />
                        <NumLabel
                            label="Move-out"
                            value={line.moveOut}
                            onChange={(moveOut) => onChange({ moveOut })}
                        />
                        <NumLabel
                            label="Mobilization percent"
                            value={line.mobilizationPercent * 100}
                            onChange={(percent) =>
                                onChange({ mobilizationPercent: percent / 100 })
                            }
                        />
                    </>
                )}
                {!formula && (
                    <NumLabel
                        label="Rate"
                        value={line.rate}
                        onChange={(rate) => onChange({ rate })}
                    />
                )}
            </div>
            <p className="text-sm">
                {line.formula}. Customer {formatMoney(line.customerUnitPrice)} ×{" "}
                {line.quantity} = {formatMoney(line.customerTotal)}.
                {line.internalKnown
                    ? ` Internal ${formatMoney(line.internalTotal)}.`
                    : " Internal cost not entered."}
            </p>
            <button type="button" className={btn} onClick={props.onRemove}>
                Remove line
            </button>
        </fieldset>
    );
}

function Num(props: {
    label: string;
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="text-sm">
            {props.label}
            <input
                className={field}
                type="number"
                value={props.value}
                onChange={(event) =>
                    props.onChange(asNumber(event.target.value))
                }
            />
        </label>
    );
}

function NumLabel(props: {
    label: string;
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="text-sm">
            {props.label}
            <input
                aria-label={props.label}
                className={field}
                type="number"
                value={props.value}
                onChange={(event) =>
                    props.onChange(asNumber(event.target.value))
                }
            />
        </label>
    );
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
