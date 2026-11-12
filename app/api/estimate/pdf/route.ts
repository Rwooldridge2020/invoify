import React from "react";

import { NextRequest, NextResponse } from "next/server";

import { buildInvoiceLabels } from "@/app/components/templates/invoice-pdf/invoiceLabels";
import { defaultLogoDataUrl } from "@/lib/estimate/defaultLogo";
import { customerEstimateHtml } from "@/lib/estimate/html";
import { estimateSchema, type EstimateDocument } from "@/lib/estimate/schema";
import { estimateAsInvoice } from "@/lib/estimate/toInvoice";
import { toCustomerView } from "@/lib/estimate/view";
import { getInvoiceTemplate } from "@/lib/helpers";
import { getMessages } from "@/i18n/messages";
import { PDF_TAILWIND_CSS } from "@/lib/pdfStyles.generated";
import { parseJsonBody } from "@/lib/server/validateRequest";
import { documentFileName } from "@/lib/downloadName";
import { pdfGenerationLimit } from "@/lib/server/pdfRateLimit";
import { withPdfPage } from "@/services/invoice/server/pdfPage";

export const runtime = "nodejs";

const LETTER = { width: 816, height: 1056, deviceScaleFactor: 1 };

export async function POST(req: NextRequest) {
    const limited = pdfGenerationLimit(req, "estimate-pdf");
    if (limited) return limited;

    const parsed = await parseJsonBody(req, estimateSchema);
    if (!parsed.ok) return parsed.response;

    const doc = parsed.data as EstimateDocument;
    try {
        const logo = doc.logoDataUrl || (await defaultLogoDataUrl());
        if (doc.pdfTemplate !== 1) {
            const pdf = await invoiceLayoutPdf(doc, doc.pdfTemplate, logo);
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
        }
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

/** Invoice layouts 2–13, filled with this estimate. Template 1 does not use this. */
async function invoiceLayoutPdf(
    doc: EstimateDocument,
    templateId: number,
    logo: string
) {
    const InvoiceTemplate = await getInvoiceTemplate(templateId);
    if (!InvoiceTemplate) throw new Error("Unknown estimate template");
    const messages = await getMessages("en");
    const html = (await import("react-dom/server")).default.renderToStaticMarkup(
        React.createElement(InvoiceTemplate, {
            ...estimateAsInvoice(doc, templateId, logo),
            labels: buildInvoiceLabels(messages),
            locale: "en",
        })
    );
    return withPdfPage(async (page) => {
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });
        await page.addStyleTag({ content: PDF_TAILWIND_CSS });
        await page
            .evaluate(() => document.fonts.ready.then(() => undefined))
            .catch(() => undefined);
        return page.pdf({
            format: "a4",
            printBackground: true,
            margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
    });
}
