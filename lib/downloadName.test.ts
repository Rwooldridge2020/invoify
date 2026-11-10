import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { documentFileName, safePdfAttachmentName } from "./downloadName";

describe("document file names", () => {
    it("builds the RW Grading invoice and estimate names", () => {
        assert.equal(
            documentFileName("Invoice", "Smith Co", "1001", "pdf"),
            "RWG_Invoice_Smith-Co_1001.pdf"
        );
        assert.equal(
            documentFileName("Estimate", "Smith Co", "2026-001", "pdf"),
            "RWG_Estimate_Smith-Co_2026-001.pdf"
        );
    });

    it("turns spaces into hyphens and strips illegal characters", () => {
        assert.equal(
            documentFileName("Invoice", "Smith/Co: North", "10 01", "pdf"),
            "RWG_Invoice_SmithCo-North_10-01.pdf"
        );
        assert.equal(
            documentFileName("Estimate", "  Ada   Lovelace ", "E-2", "json"),
            "RWG_Estimate_Ada-Lovelace_E-2.json"
        );
    });

    it("falls back when the customer or number is blank", () => {
        assert.equal(
            documentFileName("Invoice", "   ", "1001", "pdf"),
            "RWG_Invoice_Customer_1001.pdf"
        );
        assert.equal(
            documentFileName("Estimate", "Smith Co", "", "pdf"),
            "RWG_Estimate_Smith-Co_Number.pdf"
        );
        assert.equal(
            documentFileName("Invoice", "", "///", "pdf"),
            "RWG_Invoice_Customer_Number.pdf"
        );
    });

    it("keeps only helper-shaped pdf attachment names", () => {
        assert.equal(
            safePdfAttachmentName("RWG_Invoice_Smith-Co_1001.pdf"),
            "RWG_Invoice_Smith-Co_1001.pdf"
        );
        assert.equal(safePdfAttachmentName("../invoice.pdf"), "invoice.pdf");
        assert.equal(safePdfAttachmentName("invoice.pdf"), "invoice.pdf");
    });
});
