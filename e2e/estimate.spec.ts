import { mkdir, readFile } from "fs/promises";

import { expect, test } from "@playwright/test";

import { createLine } from "../lib/estimate/calculate";
import { createDocument, recalculate } from "../lib/estimate/document";
import { SUGGESTED_CATALOG } from "../lib/estimate/schema";

function pdfPages(body: Buffer): { count: number; boxes: string[] } {
    const text = body.toString("latin1");
    const boxes = [...text.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map(
        (match) => match[1].trim()
    );
    const count = text.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
    return { count, boxes };
}

test("create, save, reload, export, import, revise, and PDF", async ({
    page,
}) => {
    test.setTimeout(120_000);
    await page.goto("/en/estimate");
    await expect(page.getByLabel("Customer name")).toBeVisible();
    await expect(page.getByLabel("Company name")).toHaveValue("RW Grading LLC");
    await expect(page.getByLabel("Customer name")).toHaveValue("");

    await page.getByLabel("Customer name").fill("SYNTHETIC Customer");
    await page.getByLabel("Street").nth(1).fill("100 Test Street");
    await page.getByRole("button", { name: "Add vendor line" }).click();
    await page.getByLabel("Activity").fill("SYNTHETIC material");
    await page
        .getByLabel("Description")
        .fill("A wrapped synthetic description");
    await page.getByLabel("Cost").fill("100");
    await page.getByLabel("Vendor tax percent").fill("0");
    await page.getByLabel("Internal notes").fill("INTERNAL-SECRET-NOTE");

    await expect(page.getByTestId("customer-total")).toHaveText(/\$110\.00/);
    await expect(page.getByTestId("internal-total")).toHaveText(/\$100\.00/);
    await expect(page.getByTestId("customer-preview")).toBeVisible();
    const preview = () =>
        page
            .getByTestId("customer-preview")
            .evaluate((frame: HTMLIFrameElement) => {
                return frame.contentDocument?.body?.innerText ?? "";
            });
    await expect.poll(preview).toContain("SYNTHETIC Customer");
    await expect.poll(preview).toContain("$110.00");
    await expect.poll(preview).toContain("ACTIVITY");
    await expect.poll(preview).not.toContain("INTERNAL-SECRET-NOTE");
    await expect.poll(preview).not.toContain("markup");
    await expect.poll(preview).not.toContain("$100.00");
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await page.screenshot({
        path: "/opt/cursor/artifacts/synthetic-estimate-editor.png",
        fullPage: true,
    });
    await page.getByTestId("customer-preview").screenshot({
        path: "/opt/cursor/artifacts/synthetic-estimate-preview.png",
    });

    await page.getByRole("button", { name: "Save estimate" }).click();
    await expect(
        page.getByText("Estimate saved in this browser.")
    ).toBeVisible();
    await expect(page.getByText("Draft saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Customer name")).toHaveValue(
        "SYNTHETIC Customer"
    );
    await expect(page.getByTestId("customer-total")).toHaveText(/\$110\.00/);
    await expect(page.getByLabel("Internal notes")).toHaveValue(
        "INTERNAL-SECRET-NOTE"
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export job file" }).click();
    const download = await downloadPromise;
    const jobPath = await download.path();
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    expect(jobPath).toBeTruthy();

    await page.getByRole("button", { name: "New estimate" }).click();
    await page.getByRole("button", { name: "Start new" }).click();
    await expect(page.getByLabel("Customer name")).toHaveValue("");

    await page.getByLabel("Import job file").setInputFiles(jobPath!);
    await page.getByRole("button", { name: "Open as a new copy" }).click();
    await expect(page.getByLabel("Customer name")).toHaveValue(
        "SYNTHETIC Customer"
    );
    await expect(page.getByTestId("status")).toHaveText("draft");

    await page.getByRole("button", { name: "Issue estimate" }).click();
    await expect(page.getByTestId("status")).toHaveText("issued");
    await expect(page.getByTestId("customer-total")).toHaveText(/\$110\.00/);

    await page.getByRole("button", { name: "Revise" }).click();
    await expect(page.getByTestId("status")).toHaveText("draft");
    await page.getByLabel("Cost").fill("200");
    await expect(page.getByTestId("customer-total")).toHaveText(/\$220\.00/);

    await page.locator("li", { hasText: "issued" }).getByRole("button").click();
    await expect(page.getByTestId("status")).toHaveText("issued");
    await expect(page.getByTestId("customer-total")).toHaveText(/\$110\.00/);

    const pdfPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const pdf = await pdfPromise;
    const pdfFile = await pdf.path();
    const bytes = await readFile(pdfFile!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const info = pdfPages(bytes);
    expect(info.boxes.length).toBeGreaterThan(0);
    expect(info.boxes[0]).toContain("612");
    expect(info.boxes[0]).toContain("792");
    expect(bytes.toString("latin1")).not.toContain("INTERNAL-SECRET-NOTE");
});

test("estimate PDF is US Letter and a long description runs past one page", async ({
    request,
}) => {
    test.setTimeout(120_000);
    const doc = createDocument(
        SUGGESTED_CATALOG,
        [],
        "2026-11-05T15:00:00.000Z",
        "2026-11-05"
    );
    const short = recalculate({
        ...doc,
        customer: { ...doc.customer, name: "SYNTHETIC Customer" },
        internalNotes: "INTERNAL-SECRET-NOTE",
        lines: [
            createLine("labor", doc.ruleSnapshot, {
                name: "SYNTHETIC labor",
                quantity: 2,
            }),
        ],
    });
    const one = await request.post("/api/estimate/pdf", { data: short });
    expect(one.status()).toBe(200);
    const oneBody = await one.body();
    const oneInfo = pdfPages(oneBody);
    expect(oneInfo.count).toBe(1);
    expect(oneInfo.boxes[0]).toContain("612");
    expect(oneInfo.boxes[0]).toContain("792");
    expect(oneBody.toString("latin1")).not.toContain("INTERNAL-SECRET-NOTE");

    const long = recalculate({
        ...short,
        id: crypto.randomUUID(),
        lines: [
            createLine("labor", doc.ruleSnapshot, {
                name: "SYNTHETIC long",
                description: `${"SYNTHETIC description line.\n".repeat(120)}SYNTHETIC-LONG-END`,
                quantity: 1,
            }),
            ...Array.from({ length: 18 }, (_, index) =>
                createLine("labor", doc.ruleSnapshot, {
                    name: `SYNTHETIC row ${index + 1}`,
                    description:
                        "Extra synthetic scope so the table continues.",
                    quantity: 1,
                })
            ),
        ],
    });
    const many = await request.post("/api/estimate/pdf", { data: long });
    expect(many.status()).toBe(200);
    const manyBody = await many.body();
    const manyInfo = pdfPages(manyBody);
    expect(manyInfo.count).toBeGreaterThan(1);
    for (const box of manyInfo.boxes) {
        expect(box).toContain("612");
        expect(box).toContain("792");
    }
    expect(manyBody.toString("latin1")).not.toContain("INTERNAL-SECRET-NOTE");
});

test("each estimate template renders a PDF and the letter stays the default", async ({
    page,
    request,
}, testInfo) => {
    test.setTimeout(180_000);
    const doc = createDocument(
        SUGGESTED_CATALOG,
        [],
        "2026-11-05T15:00:00.000Z",
        "2026-11-05"
    );
    const job = recalculate({
        ...doc,
        customer: { ...doc.customer, name: "SYNTHETIC Customer" },
        internalNotes: "INTERNAL-SECRET-NOTE",
        lines: [
            createLine("labor", doc.ruleSnapshot, {
                name: "SYNTHETIC labor",
                quantity: 2,
            }),
        ],
    });
    // Once per run. The PDF route is limited per IP, and mobile repeats the suite.
    if (testInfo.project.name === "desktop") {
        for (let id = 1; id <= 13; id++) {
            const response = await request.post("/api/estimate/pdf", {
                data: { ...job, pdfTemplate: id },
            });
            expect(response.status(), `template ${id}`).toBe(200);
            const body = await response.body();
            expect(body.subarray(0, 5).toString()).toBe("%PDF-");
            expect(body.toString("latin1")).not.toContain("INTERNAL-SECRET-NOTE");
            if (id === 1) {
                const info = pdfPages(body);
                expect(info.count).toBeGreaterThan(0);
                expect(info.boxes[0]).toContain("612");
                expect(info.boxes[0]).toContain("792");
            }
        }
    }

    await page.goto("/en/estimate");
    const picker = page.getByLabel("PDF template");
    await expect(picker).toHaveValue("1");
    await expect(picker.locator("option")).toHaveCount(13);
    await expect(page.getByTestId("customer-preview")).toBeVisible();
    await picker.selectOption("2");
    await expect(page.getByTestId("template-preview")).toBeVisible();
});

test("fixed mobilization quantity stays editable and survives reload", async ({
    page,
}) => {
    test.setTimeout(120_000);
    await page.goto("/en/estimate");
    await page.getByRole("button", { name: "Add mobilization line" }).click();
    await page.getByLabel("Move-in").fill("200");
    await page.getByLabel("Move-out").fill("200");
    await page.getByLabel("Waive markup").check();
    await expect(page.getByTestId("customer-total")).toHaveText(/\$400\.00/);

    await page.getByLabel("Fixed price").check();
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Unit").fill("ea");
    await page.getByRole("spinbutton", { name: "Rate", exact: true }).fill("200");
    await expect(page.getByTestId("customer-total")).toHaveText(/\$400\.00/);

    const preview = () =>
        page
            .getByTestId("customer-preview")
            .evaluate(
                (frame: HTMLIFrameElement) =>
                    frame.contentDocument?.body?.innerText ?? ""
            );
    await expect.poll(preview).toContain("$400.00");
    await expect.poll(preview).not.toContain("Deposit to schedule: $");

    await page.getByRole("button", { name: "Save estimate" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Quantity")).toHaveValue("2");
    await expect(page.getByLabel("Unit")).toHaveValue("ea");
    await expect(
        page.getByRole("spinbutton", { name: "Rate", exact: true })
    ).toHaveValue("200");
    await expect(page.getByTestId("customer-total")).toHaveText(/\$400\.00/);
});

test("clearing the estimate date does not drop the draft", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/en/estimate");
    await page.getByLabel("Customer name").fill("SYNTHETIC Customer");
    await page.getByLabel("Street").nth(1).fill("100 Test Street");
    await expect(page.getByText("Draft saved")).toBeVisible();

    await page.getByLabel("Estimate date").fill("");
    await expect(page.getByText("Saving draft…")).toBeVisible();
    await expect(page.getByText("Draft saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Customer name")).toHaveValue(
        "SYNTHETIC Customer"
    );
    await expect(page.getByLabel("Street").nth(1)).toHaveValue("100 Test Street");
    await expect(page.getByLabel("Estimate date")).toHaveValue("");
    await expect(page.getByText("RW Grading Estimates").first()).toBeVisible();
});

test("convert to invoice copies the total and leaves the estimate", async ({
    page,
}) => {
    test.setTimeout(120_000);
    await page.goto("/en/estimate");
    await page.getByLabel("Customer name").fill("SYNTHETIC Customer");
    await page.getByRole("button", { name: "Add labor line" }).click();
    await page.getByLabel("Quantity").fill("4");
    await expect(page.getByTestId("customer-total")).toHaveText(/\$100\.00/);
    const estimateNumber = await page.getByLabel("Estimate number").inputValue();

    await page.getByRole("button", { name: "Convert to Invoice" }).click();
    await expect(page).toHaveURL(/\/en\/?$/);
    await expect(page.locator('input[name="receiver.name"]')).toHaveValue(
        "SYNTHETIC Customer"
    );
    await expect(page.locator('input[name="sender.name"]')).toHaveValue(
        "RW Grading LLC"
    );
    await page.locator("nav[aria-label] ol button").nth(1).click();
    await expect(page.locator('input[name="details.invoiceNumber"]')).toHaveValue(
        "INV0001"
    );
    await expect(
        page.locator('input[name="details.invoiceNumber"]')
    ).not.toHaveValue(estimateNumber);
    await page.locator("nav[aria-label] ol button").nth(4).click();
    await expect(page.getByText("100.00").first()).toBeVisible();

    await page.goto("/en/estimate");
    await expect(page.getByLabel("Customer name")).toHaveValue(
        "SYNTHETIC Customer"
    );
    await expect(page.getByTestId("customer-total")).toHaveText(/\$100\.00/);
    await expect(page.getByLabel("Estimate number")).toHaveValue(estimateNumber);
});
