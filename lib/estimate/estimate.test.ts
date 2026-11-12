import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLine, resetLine } from "./calculate";
import { addDays } from "./dates";
import {
    applyDefaults,
    copyAsNewDraft,
    createDocument,
    issueDocument,
    parseJobFile,
    planImport,
    recalculate,
    reviseDocument,
    termsForPercent,
    toJobFile,
    upsertLibrary,
} from "./document";
import { customerEstimateHtml } from "./html";
import { estimateToInvoice } from "./toInvoice";
import { roundHalfUp, sumMoney } from "./money";
import {
    MAX_JOB_FILE_BYTES,
    SUGGESTED_CATALOG,
    SUGGESTED_EXCAVATOR_ID,
    estimateSchema,
    type EstimateDocument,
} from "./schema";
import { toCustomerView } from "./view";

const NOW = "2026-11-05T15:00:00.000Z";
const DAY = "2026-11-05";

function quote(catalog = SUGGESTED_CATALOG, date = DAY): EstimateDocument {
    return createDocument(catalog, [], NOW, date);
}

describe("cents", () => {
    it("rounds half up away from the binary toFixed trap", () => {
        assert.equal(roundHalfUp(1.005), 1.01);
        assert.equal(roundHalfUp(1.004), 1);
        assert.equal(roundHalfUp(0.015), 0.02);
        assert.equal(roundHalfUp(0.014), 0.01);
        assert.equal(roundHalfUp(-1.005), -1.01);
        assert.equal(roundHalfUp(10.1 * 3), 30.3);
    });

    it("sums already rounded amounts by cents", () => {
        assert.equal(sumMoney([1073.38, 300, 101.73, 400, 400, 230]), 2505.11);
    });
});

describe("formulas", () => {
    const rules = SUGGESTED_CATALOG.rules;

    it("marks vendor price up after sales tax and does not tax again", () => {
        const line = createLine("vendor", rules, {
            cost: 100,
            taxMode: "amount",
            tax: 8,
            quantity: 1,
        });
        assert.equal(line.customerUnitPrice, 118.8);
        assert.equal(line.customerTotal, 118.8);
        assert.equal(line.internalTotal, 108);
        assert.equal(line.formula.includes("markup"), true);
    });

    it("rounds a percent tax once at the sell amount", () => {
        const waived = createLine("vendor", rules, {
            cost: 1012.62,
            taxMode: "percent",
            tax: 6,
            quantity: 1,
            markupWaived: true,
        });
        assert.equal(waived.customerTotal, 1073.38);
        assert.equal(waived.internalTotal, 1073.38);
        const marked = createLine("vendor", rules, {
            cost: 1012.62,
            taxMode: "percent",
            tax: 6,
            quantity: 1,
        });
        assert.equal(marked.customerTotal, roundHalfUp(1012.62 * 1.06 * 1.1));
        assert.notEqual(
            marked.customerTotal,
            roundHalfUp(1073.38 * 1.1 + 1073.38 * 0.06)
        );
    });

    it("does not mark up rental, equipment, or labor", () => {
        const rental = createLine("rental", rules, {
            rate: 80,
            quantity: 2,
            markup: 1.1,
        });
        assert.equal(rental.customerTotal, 160);
        const labor = createLine("labor", rules, { quantity: 1.5 });
        assert.equal(labor.rate, 25);
        assert.equal(labor.customerTotal, 37.5);
        const machine = createLine("equipment", rules, {
            catalogItemId: SUGGESTED_EXCAVATOR_ID,
            quantity: 4,
            markup: 1.1,
        });
        assert.equal(machine.rate, 100);
        assert.equal(machine.unit, "hr");
        assert.equal(machine.customerTotal, 400);
    });

    it("bills fuel as gallons times diesel plus the adder", () => {
        const fuel = createLine("fuel", rules, {
            quantity: 10,
            dieselPrice: 4.259,
            fuelAdder: 2,
            markup: 1.1,
            mobilizationPercent: 0.2,
        });
        assert.equal(fuel.customerUnitPrice, 6.26);
        assert.equal(fuel.customerTotal, 62.6);
        assert.equal(fuel.internalTotal, 42.6);
        assert.equal(fuel.formula, "gallons × (diesel + adder)");
    });

    it("bills mobilization once for move-in plus move-out", () => {
        const mob = createLine("mobilization", rules, {
            moveIn: 200,
            moveOut: 200,
            quantity: 5,
        });
        assert.equal(mob.quantity, 1);
        assert.equal(mob.customerTotal, 480);
        assert.equal(mob.internalTotal, 400);
        const waived = createLine("mobilization", rules, {
            moveIn: 200,
            moveOut: 200,
            markupWaived: true,
            quantity: 2,
        });
        assert.equal(waived.customerTotal, 400);
    });

    it("keeps a fixed price from also taking a percent", () => {
        const mob = createLine("mobilization", rules, {
            pricingMode: "fixed",
            rate: 200,
            quantity: 2,
            unit: "ea",
            mobilizationPercent: 0.2,
            moveIn: 200,
            moveOut: 200,
        });
        assert.equal(mob.quantity, 2);
        assert.equal(mob.unit, "ea");
        assert.equal(mob.customerUnitPrice, 200);
        assert.equal(mob.customerTotal, 400);
        assert.equal(mob.formula, "fixed price");
        const fuel = createLine("fuel", rules, {
            pricingMode: "fixed",
            rate: 115,
            quantity: 2,
            unit: "day",
            dieselPrice: 4,
            fuelAdder: 2,
        });
        assert.equal(fuel.customerTotal, 230);
    });

    it("honors a manual rate without dropping the cost basis", () => {
        const line = createLine("vendor", rules, {
            cost: 100,
            taxMode: "amount",
            tax: 0,
            quantity: 2,
            customerUnitOverridden: true,
            customerUnitPrice: 50,
        });
        assert.equal(line.customerTotal, 100);
        assert.equal(line.internalTotal, 200);
        assert.equal(line.formula, "manual rate");
    });
});

describe("snapshots", () => {
    it("leaves a saved quote alone when the catalog changes", () => {
        const doc = quote();
        const machine = createLine("equipment", doc.ruleSnapshot, {
            catalogItemId: SUGGESTED_EXCAVATOR_ID,
            quantity: 3,
        });
        const labor = createLine("labor", doc.ruleSnapshot, { quantity: 2 });
        const saved = recalculate({ ...doc, lines: [machine, labor] });
        assert.equal(saved.lines[0].customerTotal, 300);
        assert.equal(saved.lines[1].customerTotal, 50);

        const later = structuredClone(SUGGESTED_CATALOG);
        later.rules.equipment[0].rate = 175;
        later.rules.laborRatePerHour = 40;
        later.rules.vendorMarkup = 1.25;
        later.rules.depositPercent = 50;
        const again = recalculate(saved);
        assert.equal(again.lines[0].rate, 100);
        assert.equal(again.lines[0].customerTotal, 300);
        assert.equal(again.lines[1].customerTotal, 50);
        assert.equal(again.depositPercent, 30);
        assert.equal(later.rules.equipment[0].rate, 175);

        const applied = applyDefaults(saved, later);
        assert.equal(applied.lines[0].rate, 175);
        assert.equal(applied.lines[0].customerTotal, 525);
        assert.equal(applied.lines[1].rate, 40);
        assert.equal(applied.depositPercent, 50);
        assert.equal(recalculate(saved).lines[0].customerTotal, 300);
    });

    it("does not apply new defaults over a fixed price or a waived markup", () => {
        const doc = quote();
        const fixed = createLine("equipment", doc.ruleSnapshot, {
            pricingMode: "fixed",
            rate: 150,
            quantity: 2,
            unit: "day",
            catalogItemId: SUGGESTED_EXCAVATOR_ID,
        });
        const waived = createLine("vendor", doc.ruleSnapshot, {
            cost: 1012.62,
            taxMode: "percent",
            tax: 6,
            markupWaived: true,
        });
        const saved = recalculate({ ...doc, lines: [fixed, waived] });
        const later = structuredClone(SUGGESTED_CATALOG);
        later.rules.equipment[0].rate = 80;
        later.rules.vendorMarkup = 1.3;
        const applied = applyDefaults(saved, later);
        assert.equal(applied.lines[0].customerTotal, 300);
        assert.equal(applied.lines[1].customerTotal, 1073.38);
        assert.equal(applied.lines[1].markupWaived, true);
    });

    it("resets overrides back to the quote snapshot, not a newer catalog", () => {
        const doc = quote();
        const seeded = createLine("labor", doc.ruleSnapshot, {
            quantity: 8,
            rate: 40,
            overriddenFields: ["rate"],
        });
        const saved = recalculate({ ...doc, lines: [seeded] });
        assert.equal(saved.lines[0].customerTotal, 320);
        const reset = resetQuoteToSnapshot(saved);
        assert.equal(reset.lines[0].rate, 25);
        assert.equal(reset.lines[0].customerTotal, 200);
    });

    it("uses 30 percent deposit and 30 day validity unless the quote overrides them", () => {
        assert.equal(termsForPercent(30), "COD. 30% deposit to schedule.");
        const doc = quote(SUGGESTED_CATALOG, "2026-10-22");
        assert.equal(doc.depositPercent, 30);
        assert.equal(doc.depositTerms, "COD. 30% deposit to schedule.");
        assert.equal(doc.validThrough, "2026-11-21");
        const cleared = recalculate({
            ...doc,
            customer: { ...doc.customer, name: "SYNTHETIC Customer" },
            estimateDate: "",
        });
        assert.equal(cleared.estimateDate, "");
        assert.equal(cleared.validThrough, "");
        assert.equal(cleared.customer.name, "SYNTHETIC Customer");
        assert.equal(estimateSchema.safeParse(cleared).success, true);
        assert.equal(addDays("2026-10-22", 30), "2026-11-21");
        const custom = recalculate({
            ...doc,
            depositPercent: 50,
            depositPercentOverridden: true,
            lines: [
                createLine("labor", doc.ruleSnapshot, {
                    quantity: 1,
                    rate: 2505.11,
                }),
            ],
        });
        assert.equal(custom.depositAmount, 1252.56);
        assert.equal(custom.depositTerms, "COD. 50% deposit to schedule.");
        assert.equal(SUGGESTED_CATALOG.rules.depositPercent, 30);
        const worded = recalculate({
            ...custom,
            depositTerms: "SYNTHETIC custom terms",
            depositTermsOverridden: true,
            depositPercent: 30,
        });
        assert.equal(worded.depositTerms, "SYNTHETIC custom terms");
    });
});

function resetQuoteToSnapshot(doc: EstimateDocument): EstimateDocument {
    return recalculate({
        ...doc,
        lines: doc.lines.map((line) => resetLine(line, doc.ruleSnapshot)),
    });
}

describe("synthetic fixed-price total", () => {
    it("reproduces the cent total from explicit overrides, with no customer identity", () => {
        const doc = quote();
        const lines = [
            createLine("vendor", doc.ruleSnapshot, {
                name: "SYNTHETIC material",
                cost: 1012.62,
                taxMode: "percent",
                tax: 6,
                quantity: 1,
                unit: "ea",
                markupWaived: true,
            }),
            createLine("equipment", doc.ruleSnapshot, {
                name: "SYNTHETIC machine day",
                pricingMode: "fixed",
                rate: 150,
                quantity: 2,
                unit: "day",
            }),
            createLine("vendor", doc.ruleSnapshot, {
                name: "SYNTHETIC pipe",
                cost: 33.91,
                taxMode: "amount",
                tax: 0,
                quantity: 3,
                unit: "ea",
                markupWaived: true,
            }),
            createLine("labor", doc.ruleSnapshot, {
                name: "SYNTHETIC labor",
                quantity: 16,
                rate: 25,
                unit: "hr",
            }),
            createLine("mobilization", doc.ruleSnapshot, {
                name: "SYNTHETIC mobilization",
                pricingMode: "fixed",
                rate: 200,
                quantity: 2,
                unit: "ea",
            }),
            createLine("fuel", doc.ruleSnapshot, {
                name: "SYNTHETIC fuel",
                pricingMode: "fixed",
                rate: 115,
                quantity: 2,
                unit: "day",
            }),
        ];
        const saved = recalculate({ ...doc, lines });
        assert.equal(saved.customerTotal, 2505.11);
        assert.equal(saved.customer.name, "");
        assert.equal(SUGGESTED_CATALOG.rules.equipment[0].rate, 100);
        assert.equal(saved.lines[1].formula, "fixed price");
        const freshMachine = createLine("equipment", SUGGESTED_CATALOG.rules, {
            catalogItemId: SUGGESTED_EXCAVATOR_ID,
            quantity: 1,
        });
        assert.equal(freshMachine.rate, 100);
        assert.equal(freshMachine.unit, "hr");
    });
});

describe("job file", () => {
    it("round-trips inputs, overrides, snapshot, terms, and ids", () => {
        const doc = quote();
        const withLine = recalculate({
            ...doc,
            customer: { ...doc.customer, name: "SYNTHETIC Customer" },
            internalNotes: "INTERNAL-SECRET-NOTE",
            lines: [
                createLine("vendor", doc.ruleSnapshot, {
                    name: "SYNTHETIC material",
                    description: "SYNTHETIC-LONG-END",
                    cost: 40,
                    taxMode: "amount",
                    tax: 0,
                    markup: 1.25,
                    overriddenFields: ["markup"],
                }),
            ],
        });
        const file = toJobFile(withLine, NOW);
        const raw = JSON.stringify(file);
        const parsed = parseJobFile(raw);
        assert.equal(parsed.ok, true);
        if (!parsed.ok) return;
        assert.equal(parsed.file.estimate.id, withLine.id);
        assert.equal(parsed.file.estimate.revision, 1);
        assert.equal(
            parsed.file.estimate.internalNotes,
            "INTERNAL-SECRET-NOTE"
        );
        assert.equal(parsed.file.estimate.lines[0].cost, 40);
        assert.equal(parsed.file.estimate.lines[0].markup, 1.25);
        assert.equal(parsed.file.estimate.ruleSnapshot.vendorMarkup, 1.1);
        assert.equal(
            parsed.file.estimate.lines[0].description,
            "SYNTHETIC-LONG-END"
        );
        assert.equal(parsed.file.kind, "rwg-estimate");
    });

    it("rejects bad, unsupported, and oversized files", () => {
        assert.equal(parseJobFile("nope").ok, false);
        const wrongKind = parseJobFile('{"kind":"invoice"}');
        assert.equal(wrongKind.ok, false);
        if (!wrongKind.ok) assert.match(wrongKind.error, /Unsupported/);
        const version = parseJobFile(
            JSON.stringify({
                kind: "rwg-estimate",
                schemaVersion: 2,
                estimate: {},
            })
        );
        assert.equal(version.ok, false);
        if (!version.ok) assert.match(version.error, /schema/);
        const huge = " ".repeat(MAX_JOB_FILE_BYTES + 1);
        const over = parseJobFile(huge);
        assert.equal(over.ok, false);
        if (!over.ok) assert.match(over.error, /too large/i);
    });

    it("will not replace an issued revision and keeps it when a copy is opened", () => {
        const doc = quote();
        const issued = issueDocument(doc, NOW);
        const library = [issued];
        const again = planImport(library, issued, NOW);
        assert.equal(again.type, "needs-choice");
        const replaced = planImport(library, issued, NOW, "replace-draft");
        assert.equal(replaced.type, "reject");
        const copied = planImport(library, issued, NOW, "copy");
        assert.equal(copied.type, "insert");
        if (copied.type !== "insert") return;
        assert.notEqual(copied.document.id, issued.id);
        assert.equal(copied.document.status, "draft");
        assert.equal(copied.document.basedOn?.id, issued.id);
        assert.equal(library[0].status, "issued");
        assert.equal(library[0].customerTotal, issued.customerTotal);
    });

    it("replaces a draft only when asked and refuses to overwrite an issued id", () => {
        const draft = quote();
        const library = [draft];
        const edited = {
            ...draft,
            customer: { ...draft.customer, name: "SYNTHETIC" },
        };
        const planned = planImport(library, edited, NOW, "replace-draft");
        assert.equal(planned.type, "replace");
        const saved = upsertLibrary(library, issueDocument(draft, NOW));
        assert.throws(() =>
            upsertLibrary(saved, { ...draft, scope: "changed" })
        );
    });

    it("revising leaves the issued document byte-for-byte on its totals", () => {
        const draft = recalculate({
            ...quote(),
            lines: [
                createLine("labor", SUGGESTED_CATALOG.rules, { quantity: 4 }),
            ],
        });
        const issued = issueDocument(draft, NOW);
        const revision = reviseDocument(issued, NOW);
        revision.lines[0].quantity = 10;
        const edited = recalculate(revision);
        assert.equal(issued.lines[0].quantity, 4);
        assert.equal(issued.customerTotal, 100);
        assert.equal(issued.status, "issued");
        assert.equal(edited.customerTotal, 250);
        assert.equal(edited.revision, 2);
        assert.equal(edited.quoteId, issued.quoteId);
        assert.equal(edited.basedOn?.revision, 1);
        const dup = copyAsNewDraft(issued, NOW, "2026-009");
        assert.notEqual(dup.quoteId, issued.quoteId);
        assert.equal(dup.estimateNumber, "2026-009");
        assert.equal(issued.customerTotal, 100);
    });
});

describe("customer pdf html", () => {
    it("matches the letter structure and omits internal fields", () => {
        const doc = recalculate({
            ...quote(),
            customer: {
                ...quote().customer,
                name: "SYNTHETIC Customer",
                address: "100 Test Street",
                city: "Sampletown",
                region: "SC",
                postalCode: "29601",
            },
            internalNotes: "INTERNAL-SECRET-NOTE",
            exclusions: "SYNTHETIC permit fees\nSYNTHETIC gravel",
            lines: [
                createLine("vendor", SUGGESTED_CATALOG.rules, {
                    name: "SYNTHETIC material",
                    description: "A wrapped synthetic description",
                    cost: 100,
                    taxMode: "amount",
                    tax: 0,
                    quantity: 1,
                }),
            ],
        });
        const view = toCustomerView(doc, "/assets/img/rw-grading-logo.png");
        const html = customerEstimateHtml(view);
        assert.equal(
            JSON.stringify(view).includes("INTERNAL-SECRET-NOTE"),
            false
        );
        assert.equal(JSON.stringify(view).includes("markup"), false);
        assert.equal(html.includes("INTERNAL-SECRET-NOTE"), false);
        assert.equal(html.includes("markup"), false);
        assert.equal(html.includes("$100.00"), false);
        assert.equal(html.includes("$110.00"), true);
        assert.equal(html.includes("Deposit to schedule: $"), false);
        assert.equal(html.includes("COD. 30% deposit to schedule."), true);
        assert.equal(doc.depositAmount, 33);
        for (const label of [
            "Estimate",
            "ADDRESS",
            "ESTIMATE #",
            "DATE",
            "EXPIRATION DATE",
            "DATE",
            "ACTIVITY",
            "DESCRIPTION",
            "QTY",
            "UNIT",
            "RATE",
            "AMOUNT",
            "NOTES / TERMS",
            "EXCLUSIONS",
            "TOTAL",
            "Accepted By",
            "Accepted Date",
            "RW Grading LLC",
            "260 Thompson Rd",
            "SYNTHETIC Customer",
        ]) {
            assert.equal(html.includes(label), true, label);
        }
        assert.match(html, /page-break-inside:\s*avoid/);
        assert.match(html, /table-header-group/);
        assert.match(html, /size:\s*letter/);
        assert.match(html, /<th>ACTIVITY<\/th>/);
        const long = "SYNTHETIC-LONG-END";
        const padded = recalculate({
            ...doc,
            lines: [
                {
                    ...doc.lines[0],
                    description: `${"line\n".repeat(80)}${long}`,
                },
            ],
        });
        const longHtml = customerEstimateHtml(toCustomerView(padded, ""));
        assert.equal(longHtml.includes(long), true);
        assert.equal(longHtml.includes("INTERNAL-SECRET-NOTE"), false);
    });
});

describe("convert to invoice", () => {
    it("copies the customer total and does not change the estimate", () => {
        const doc = recalculate({
            ...quote(),
            customer: { ...quote().customer, name: "SYNTHETIC Customer" },
            customerNotes: "SYNTHETIC terms",
            exclusions: "SYNTHETIC exclusion",
            internalNotes: "INTERNAL-SECRET-NOTE",
            lines: [
                createLine("labor", SUGGESTED_CATALOG.rules, {
                    name: "SYNTHETIC labor",
                    description: "A wrapped synthetic description",
                    quantity: 4,
                    unit: "hr",
                }),
                createLine("equipment", SUGGESTED_CATALOG.rules, {
                    name: "SYNTHETIC machine",
                    description: "Two days",
                    pricingMode: "fixed",
                    rate: 150,
                    quantity: 2,
                    unit: "day",
                }),
            ],
        });
        const before = doc.customerTotal;
        const invoice = estimateToInvoice(doc, {
            invoiceNumber: "INV0008",
            invoiceDate: "2026-11-10T17:00:00.000Z",
        });
        assert.equal(before, 400);
        assert.equal(invoice.details.totalAmount, before);
        assert.equal(invoice.details.subTotal, before);
        assert.equal(doc.customerTotal, before);
        assert.equal(doc.internalNotes, "INTERNAL-SECRET-NOTE");
        assert.equal(invoice.details.invoiceNumber, "INV0008");
        assert.equal(invoice.details.invoiceDate, "2026-11-10T17:00:00.000Z");
        assert.equal(invoice.details.items[0].quantity, 4);
        assert.equal(invoice.details.items[0].unitPrice, 25);
        assert.equal(invoice.details.items[0].total, 100);
        assert.match(invoice.details.items[0].description, /Unit: hr/);
        assert.equal(invoice.details.items[1].unitPrice, 150);
        assert.equal(invoice.details.items[1].total, 300);
        assert.match(invoice.details.items[1].description, /Unit: day/);
        assert.equal(invoice.details.paymentTerms.includes("SYNTHETIC terms"), true);
        assert.equal(invoice.details.additionalNotes, "SYNTHETIC exclusion");
        assert.equal(JSON.stringify(invoice).includes("INTERNAL-SECRET-NOTE"), false);
        assert.equal(invoice.sender.name, "RW Grading LLC");
        assert.equal(invoice.receiver.name, "SYNTHETIC Customer");
    });

    it("copies a non-blank job site onto the receiver", () => {
        const doc = recalculate({
            ...quote(),
            customer: {
                ...quote().customer,
                name: "SYNTHETIC Customer",
                jobSite: "  100 Synthetic Site Rd  ",
            },
        });
        const invoice = estimateToInvoice(doc, {
            invoiceNumber: "INV0010",
            invoiceDate: "2026-11-10T17:00:00.000Z",
        });
        assert.deepEqual(
            invoice.receiver.customInputs.find((row) => row.key === "Job Site"),
            { key: "Job Site", value: "100 Synthetic Site Rd" }
        );

        const blank = estimateToInvoice(
            recalculate({
                ...quote(),
                customer: { ...quote().customer, jobSite: "   " },
            }),
            {
                invoiceNumber: "INV0011",
                invoiceDate: "2026-11-10T17:00:00.000Z",
            }
        );
        assert.equal(
            blank.receiver.customInputs.some((row) => row.key === "Job Site"),
            false
        );
    });
});
