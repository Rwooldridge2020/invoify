import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NextRequest } from "next/server";

import { pdfGenerationLimit } from "./pdfRateLimit";

function request(ip: string) {
    return new NextRequest("http://localhost/api/invoice/generate", {
        method: "POST",
        headers: { "x-real-ip": ip },
    });
}

describe("pdf generation limit", () => {
    it("allows 30 requests and then returns 429", async () => {
        const req = request("203.0.113.50");
        for (let i = 0; i < 30; i++) {
            assert.equal(pdfGenerationLimit(req, "invoice-generate"), null);
        }
        const blocked = pdfGenerationLimit(req, "invoice-generate");
        assert.ok(blocked);
        assert.equal(blocked.status, 429);
        assert.equal(Number(blocked.headers.get("Retry-After")) >= 1, true);
        assert.equal((await blocked.json()).error, "Too many PDF requests");
    });

    it("counts each endpoint on its own", () => {
        const req = request("203.0.113.51");
        for (let i = 0; i < 30; i++) {
            assert.equal(pdfGenerationLimit(req, "estimate-pdf"), null);
        }
        assert.equal(pdfGenerationLimit(req, "estimate-pdf")?.status, 429);
        assert.equal(pdfGenerationLimit(req, "invoice-generate"), null);
    });
});
