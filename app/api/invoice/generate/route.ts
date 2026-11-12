export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest } from "next/server";

import { pdfGenerationLimit } from "@/lib/server/pdfRateLimit";
// Services
import { generatePdfService } from "@/services/invoice/server/generatePdfService";

export async function POST(req: NextRequest) {
    const limited = pdfGenerationLimit(req, "invoice-generate");
    if (limited) return limited;
    const result = await generatePdfService(req);
    return result;
}
