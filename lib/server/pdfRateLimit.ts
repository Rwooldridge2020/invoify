import { NextRequest, NextResponse } from "next/server";

import { getClientKey, rateLimit } from "./rateLimit";

/** Per client, per endpoint, per hour. Stays under the mail limit's 5/hour. */
const PDF_LIMIT = 30;
const PDF_WINDOW_MS = 60 * 60 * 1000;

/**
 * Stop a PDF POST before Puppeteer starts. Null means the request may continue.
 */
export function pdfGenerationLimit(
    req: NextRequest,
    endpoint: string
): NextResponse | null {
    const limit = rateLimit(
        `pdf:${endpoint}:${getClientKey(req)}`,
        PDF_LIMIT,
        PDF_WINDOW_MS
    );
    if (limit.allowed) return null;
    return NextResponse.json(
        { error: "Too many PDF requests" },
        {
            status: 429,
            headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }
    );
}
