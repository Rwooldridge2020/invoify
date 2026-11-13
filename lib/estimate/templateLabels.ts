import {
    DEFAULT_INVOICE_LABELS,
    type InvoiceLabels,
} from "@/app/components/templates/invoice-pdf/invoiceLabels";

import type { EstimateDocument } from "./schema";
import { isChangeOrder } from "./view";

/** Override invoice layout labels when the job is a change order. */
export function estimateTemplateLabels(
    doc: EstimateDocument
): InvoiceLabels | undefined {
    if (!isChangeOrder(doc)) return undefined;
    return {
        ...DEFAULT_INVOICE_LABELS,
        invoiceNumber: "Change order #",
        total: "Net change",
    };
}
