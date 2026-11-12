import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const FOOTER = "© 2026 RW Grading LLC · Taylors, SC · Licensed & insured";

describe("public branding", () => {
    it("uses the RW Grading footer and a local site fallback", () => {
        const footer = readFileSync(
            "app/components/layout/BaseFooter.tsx",
            "utf8"
        );
        const variables = readFileSync("lib/variables.ts", "utf8");
        const readme = readFileSync("README.md", "utf8");
        const license = readFileSync("LICENSE", "utf8");

        assert.equal(footer.includes(FOOTER), true);
        assert.equal(footer.includes("Fork of"), false);
        assert.equal(variables.includes("https://invoify.vercel.app"), false);
        assert.equal(variables.includes("http://localhost:3000"), true);
        assert.match(readme, /Invoify/);
        assert.match(license, /MIT License/);
    });
});
