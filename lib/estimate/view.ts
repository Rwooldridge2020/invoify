import { formatQuantity } from "./money";
import type { EstimateDocument } from "./schema";

/** Customer PDF fields only. Internal cost, markup, and notes are not copied. */

export type CustomerLineView = {
    serviceDate: string;
    activity: string;
    description: string;
    quantityLabel: string;
    unit: string;
    rate: number;
    amount: number;
};

export type CustomerEstimateView = {
    logoSrc: string;
    sender: EstimateDocument["sender"];
    customer: EstimateDocument["customer"];
    estimateNumber: string;
    estimateDate: string;
    validThrough: string;
    lines: CustomerLineView[];
    notes: string;
    exclusions: string;
    total: number;
    acceptedBy: string;
    acceptedDate: string;
};

function cityLine(party: {
    city: string;
    region: string;
    postalCode: string;
}): string {
    const city = [party.city, party.region].filter(Boolean).join(", ");
    return [city, party.postalCode].filter(Boolean).join(" ");
}

export function senderLines(sender: EstimateDocument["sender"]): string[] {
    return [
        sender.name,
        sender.address,
        cityLine(sender),
        sender.email,
        sender.phone,
        sender.website,
    ].filter((line) => line.trim() !== "");
}

export function customerLines(
    customer: EstimateDocument["customer"]
): string[] {
    return [
        customer.name,
        customer.address,
        cityLine(customer),
        customer.phone,
        customer.email,
    ].filter((line) => line.trim() !== "");
}

function notesText(doc: EstimateDocument): string {
    // Printed notes are only text the user can edit. The calculated deposit
    // amount stays on the estimate record and in the form; it is not inserted
    // here, or a second deposit paragraph appears on the PDF.
    const parts: string[] = [];
    if (doc.depositTerms.trim()) parts.push(doc.depositTerms.trim());
    if (doc.scope.trim()) parts.push(doc.scope.trim());
    if (doc.customerNotes.trim()) parts.push(doc.customerNotes.trim());
    return parts.join("\n\n");
}

export function toCustomerView(
    doc: EstimateDocument,
    logoSrc: string
): CustomerEstimateView {
    return {
        logoSrc,
        sender: doc.sender,
        customer: doc.customer,
        estimateNumber: doc.estimateNumber,
        estimateDate: doc.estimateDate,
        validThrough: doc.validThrough,
        lines: doc.lines.map((line) => ({
            serviceDate: line.serviceDate,
            activity: line.name,
            description: line.description,
            quantityLabel: formatQuantity(line.quantity),
            unit: line.unit,
            rate: line.customerUnitPrice,
            amount: line.customerTotal,
        })),
        notes: notesText(doc),
        exclusions: doc.exclusions,
        total: doc.customerTotal,
        acceptedBy: doc.acceptedBy,
        acceptedDate: doc.acceptedDate,
    };
}
