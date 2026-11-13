import { sumMoney } from "./money";
import type { EstimateDocument } from "./schema";
import {
    changeOrderDisplayNumber,
    isChangeOrder,
    printedNotes,
} from "./view";

/**
 * Invoice draft shape the invoice page already restores.
 * Dates are ISO strings; the invoice form turns them into Date objects.
 */
export type InvoiceDraft = {
    sender: {
        name: string;
        address: string;
        zipCode: string;
        city: string;
        country: string;
        email: string;
        phone: string;
        customInputs: { key: string; value: string }[];
    };
    receiver: InvoiceDraft["sender"];
    details: {
        invoiceLogo: string;
        invoiceNumber: string;
        invoiceDate: string;
        dueDate: string;
        items: {
            name: string;
            description: string;
            quantity: number;
            unitPrice: number;
            total: number;
        }[];
        currency: string;
        language: string;
        taxDetails: { amount: number; amountType: string; taxID: string };
        discountDetails: { amount: number; amountType: string };
        shippingDetails: { cost: number; costType: string };
        paymentInformation: {
            bankName: string;
            accountName: string;
            accountNumber: string;
        };
        additionalNotes: string;
        paymentTerms: string;
        subTotal: number;
        totalAmount: number;
        totalAmountInWords: string;
        pdfTemplate: number;
    };
};

function party(source: {
    name: string;
    address: string;
    city: string;
    region: string;
    postalCode: string;
    email: string;
    phone: string;
    website?: string;
    jobSite?: string;
}): InvoiceDraft["sender"] {
    const customInputs = [
        ...(source.website?.trim()
            ? [{ key: "Website", value: source.website.trim() }]
            : []),
        ...(source.jobSite?.trim()
            ? [{ key: "Job Site", value: source.jobSite.trim() }]
            : []),
    ];
    return {
        name: source.name,
        address: source.address,
        zipCode: source.postalCode,
        city: source.city,
        country: source.region,
        email: source.email,
        phone: source.phone,
        customInputs,
    };
}

function lineDescription(description: string, unit: string): string {
    const text = description.trim();
    const unitText = unit.trim();
    if (!unitText) return text;
    return text ? `${text}\nUnit: ${unitText}` : `Unit: ${unitText}`;
}

function asInvoiceDate(value: string, fallback: string): string {
    const text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T12:00:00.000Z`;
    if (text) return text;
    return fallback;
}

/**
 * Estimate data in the shape the invoice templates already render.
 * Template 1 is not this path: that PDF stays the letter layout.
 * Internal notes are not copied.
 */
export function estimateAsInvoice(
    doc: EstimateDocument,
    templateId: number,
    logo: string
): InvoiceDraft {
    const number = isChangeOrder(doc)
        ? changeOrderDisplayNumber(doc) || "Change order"
        : doc.estimateNumber.trim() || "Estimate";
    const draft = estimateToInvoice(doc, {
        invoiceNumber: number,
        invoiceDate: asInvoiceDate(doc.estimateDate, doc.createdAt),
    });
    const originalRef = doc.originalEstimateNumber.trim();
    const paymentTerms =
        isChangeOrder(doc) && originalRef
            ? `References original estimate #${originalRef}.\n\n${draft.details.paymentTerms}`
            : draft.details.paymentTerms;
    const due = doc.validThrough.trim()
        ? asInvoiceDate(doc.validThrough, draft.details.invoiceDate)
        : draft.details.invoiceDate;
    return {
        ...draft,
        details: {
            ...draft.details,
            dueDate: due,
            paymentTerms,
            invoiceLogo: logo.startsWith("data:image/") || logo.startsWith("/")
                ? logo
                : draft.details.invoiceLogo,
            pdfTemplate: templateId,
        },
    };
}

/**
 * Copy the customer-facing estimate into an invoice draft.
 * Does not change the estimate. Internal notes are not copied.
 */
export function estimateToInvoice(
    doc: EstimateDocument,
    options: { invoiceNumber: string; invoiceDate: string }
): InvoiceDraft {
    const items = doc.lines.map((line) => ({
        name: line.name.trim() || "Item",
        description: lineDescription(line.description, line.unit),
        quantity: line.quantity,
        unitPrice: line.customerUnitPrice,
        total: line.customerTotal,
    }));
    const total =
        items.length > 0
            ? sumMoney(items.map((item) => item.total))
            : 0;
    const notes = printedNotes(doc).trim();
    return {
        sender: party(doc.sender),
        receiver: party(doc.customer),
        details: {
            invoiceLogo: doc.logoDataUrl.startsWith("data:image/")
                ? doc.logoDataUrl
                : "",
            invoiceNumber: options.invoiceNumber,
            invoiceDate: options.invoiceDate,
            dueDate: options.invoiceDate,
            items:
                items.length > 0
                    ? items
                    : [
                          {
                              name: "Item",
                              description: "",
                              quantity: 0,
                              unitPrice: 0,
                              total: 0,
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
            additionalNotes: doc.exclusions,
            paymentTerms: notes || "—",
            subTotal: total,
            totalAmount: total,
            totalAmountInWords: "",
            pdfTemplate: 1,
        },
    };
}
