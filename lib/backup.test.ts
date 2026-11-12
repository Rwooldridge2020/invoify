import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildBackup,
    mergeBackup,
    parseBackup,
    type JobBackup,
} from "./backup";
import { createDocument } from "./estimate/document";
import { SUGGESTED_CATALOG } from "./estimate/schema";

function estimate(name: string) {
    const doc = createDocument(
        SUGGESTED_CATALOG,
        [],
        "2026-11-10T15:00:00.000Z",
        "2026-11-10"
    );
    return { ...doc, customer: { ...doc.customer, name } };
}

function invoice(number: string, total: number) {
    return {
        receiver: { name: "SYNTHETIC Customer" },
        details: { invoiceNumber: number, totalAmount: total },
    };
}

function party(id: string, name: string) {
    return { id, name, address: "100 Synthetic Rd", customInputs: [] };
}

function empty(): JobBackup {
    return buildBackup({
        estimates: [],
        invoices: [],
        senders: [],
        clients: [],
    });
}

describe("job backup", () => {
    it("round-trips and does not duplicate a second import", () => {
        const first = estimate("SYNTHETIC One");
        const original = buildBackup({
            estimates: [first, { unreadable: true }],
            invoices: [invoice("INV0001", 25)],
            senders: [party("sender-1", "RW Grading LLC")],
            clients: [party("client-1", "SYNTHETIC Customer")],
        });
        const parsed = parseBackup(JSON.parse(JSON.stringify(original)));
        assert.ok(parsed);
        const once = mergeBackup(empty(), parsed);
        const twice = mergeBackup(once, parsed);
        assert.equal(twice.estimates.length, 2);
        assert.equal(twice.invoices.length, 1);
        assert.equal(twice.senders.length, 1);
        assert.equal(twice.clients.length, 1);
        assert.deepEqual(twice, once);
    });

    it("replaces the same id and appends a new one", () => {
        const saved = estimate("SYNTHETIC One");
        const current = buildBackup({
            estimates: [saved],
            invoices: [invoice("INV0001", 25)],
            senders: [party("sender-1", "RW Grading LLC")],
            clients: [party("client-1", "SYNTHETIC Customer")],
        });
        const updated = {
            ...saved,
            customer: { ...saved.customer, name: "SYNTHETIC Updated" },
        };
        const added = estimate("SYNTHETIC Two");
        const incoming = buildBackup({
            estimates: [updated, added],
            invoices: [
                invoice("INV0001", 40),
                invoice("INV0002", 10),
            ],
            senders: [party("sender-1", "RW Grading LLC Updated")],
            clients: [party("client-2", "SYNTHETIC Other")],
        });
        const merged = mergeBackup(current, incoming);
        assert.equal(merged.estimates.length, 2);
        assert.equal(
            (merged.estimates[0] as { customer: { name: string } }).customer
                .name,
            "SYNTHETIC Updated"
        );
        assert.equal(
            (merged.estimates[1] as { id: string }).id,
            added.id
        );
        assert.equal(merged.invoices.length, 2);
        assert.equal(
            (merged.invoices[0] as { details: { totalAmount: number } }).details
                .totalAmount,
            40
        );
        assert.equal(merged.senders.length, 1);
        assert.equal(
            (merged.senders[0] as { name: string }).name,
            "RW Grading LLC Updated"
        );
        assert.equal(merged.clients.length, 2);
        assert.equal(parseBackup({ kind: "rwg-estimate" }), null);
    });
});
