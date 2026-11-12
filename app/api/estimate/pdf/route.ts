import { NextRequest, NextResponse } from "next/server";

import { defaultLogoDataUrl } from "@/lib/estimate/defaultLogo";
import { customerEstimateHtml } from "@/lib/estimate/html";
import { estimateSchema, type EstimateDocument } from "@/lib/estimate/schema";
import { toCustomerView } from "@/lib/estimate/view";
import { parseJsonBody } from "@/lib/server/validateRequest";
import { documentFileName } from "@/lib/downloadName";
import { withPdfPage } from "@/services/invoice/server/pdfPage";

export const runtime = "nodejs";

const LETTER = { width: 816, height: 1056, deviceScaleFactor: 1 };

export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, estimateSchema);
    if (!parsed.ok) return parsed.response;

    const doc = parsed.data as EstimateDocument;
    try {
        const logo = doc.logoDataUrl || (await defaultLogoDataUrl());
        const html = customerEstimateHtml(toCustomerView(doc, logo));
        const pdf = await withPdfPage(async (page) => {
            const previous = page.viewport();
            await page.setViewport(LETTER);
            try {
                await page.setContent(html, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
                return await page.pdf({
                    format: "letter",
                    printBackground: true,
                    preferCSSPageSize: true,
                    margin: {
                        top: "0.55in",
                        right: "0.6in",
                        bottom: "0.55in",
                        left: "0.6in",
                    },
                });
            } finally {
                if (previous) await page.setViewport(previous);
            }
        });

        const filename = documentFileName(
            "Estimate",
            doc.customer.name,
            doc.estimateNumber,
            "pdf"
        );
        return new NextResponse(Buffer.from(pdf), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("Estimate PDF error:", error);
        return NextResponse.json(
            { error: "Failed to generate estimate PDF" },
            { status: 500 }
        );
    }
}
