import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLine } from "./estimate/calculate";
import { createDocument, recalculate } from "./estimate/document";
import { estimateToInvoice } from "./estimate/toInvoice";
import { SUGGESTED_CATALOG } from "./estimate/schema";
import { InvoiceSchema } from "./schemas";

const EMAIL_32 = "abcdefghijklmnopqrst@example.com";
const ADDRESS_71 = "A".repeat(71);

function invoice(patch: {
    sender?: Record<string, unknown>;
    receiver?: Record<string, unknown>;
}) {
    return {
        sender: {
            name: "RW Grading LLC",
            address: "260 Thompson Rd",
            zipCode: "29687",
            city: "Taylors",
            country: "SC",
            email: "RWGradingSeptic@gmail.com",
            phone: "864-660-3419",
            customInputs: [],
            ...patch.sender,
        },
        receiver: {
            name: "SYNTHETIC Customer",
            address: "100 Test Street",
            zipCode: "29601",
            city: "Sampletown",
            country: "SC",
            email: "synthetic@example.com",
            phone: "864-555-0100",
            customInputs: [],
            ...patch.receiver,
        },
        details: {
            invoiceLogo: "",
            invoiceNumber: "INV0001",
            invoiceDate: "2026-11-10T17:00:00.000Z",
            dueDate: "2026-11-10T17:00:00.000Z",
            items: [
                {
                    name: "SYNTHETIC labor",
                    description: "A wrapped synthetic description",
                    quantity: 1,
                    unitPrice: 25,
                    total: 25,
                },
            ],
            currency: "USD",
            language: "English",
            taxDetails: { amount: 0, amountType: "amount", taxID: "" },
            discountDetails: { amount: 0, amountType: "amount" },
            shippingDetails: { cost: 0, costType: "amount" },
            paymentInformation: {
                bankName: "",
                accountName: "",
                accountNumber: "",
            },
            additionalNotes: "",
            paymentTerms: "Due on receipt",
            subTotal: 25,
            totalAmount: 25,
            totalAmountInWords: "",
            pdfTemplate: 1,
        },
    };
}

describe("invoice party limits", () => {
    it("accepts a 32 character email", () => {
        assert.equal(EMAIL_32.length, 32);
        const parsed = InvoiceSchema.safeParse(
            invoice({ sender: { email: EMAIL_32 } })
        );
        assert.equal(parsed.success, true);
    });

    it("accepts a 71 character address", () => {
        assert.equal(ADDRESS_71.length, 71);
        const parsed = InvoiceSchema.safeParse(
            invoice({ receiver: { address: ADDRESS_71 } })
        );
        assert.equal(parsed.success, true);
    });

    it("accepts a blank email and rejects a bad one", () => {
        const blank = InvoiceSchema.safeParse(
            invoice({ sender: { email: "" }, receiver: { email: "" } })
        );
        assert.equal(blank.success, true);
        const bad = InvoiceSchema.safeParse(
            invoice({ receiver: { email: "not-an-email" } })
        );
        assert.equal(bad.success, false);
    });

    it("accepts an estimate converted with long party fields", () => {
        const catalog = SUGGESTED_CATALOG;
        const doc = recalculate({
            ...createDocument(
                catalog,
                [],
                "2026-11-10T15:00:00.000Z",
                "2026-11-10"
            ),
            sender: {
                ...catalog.sender,
                name: "S".repeat(200),
                address: "A".repeat(300),
                email: EMAIL_32,
            },
            customer: {
                name: "C".repeat(200),
                address: ADDRESS_71,
                city: "Y".repeat(120),
                region: "R".repeat(120),
                postalCode: "29601",
                phone: "",
                email: "",
                jobSite: "",
            },
            lines: [
                createLine("labor", catalog.rules, {
                    name: "SYNTHETIC labor",
                    quantity: 1,
                }),
            ],
        });
        const converted = estimateToInvoice(doc, {
            invoiceNumber: "INV0009",
            invoiceDate: "2026-11-10T17:00:00.000Z",
        });
        const parsed = InvoiceSchema.safeParse(converted);
        assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    });
});
