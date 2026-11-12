import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { appPasswordDecision } from "@/lib/server/appPassword";

const handleI18n = createMiddleware(routing);

export default function middleware(request: NextRequest) {
    const decision = appPasswordDecision({
        nodeEnv: process.env.NODE_ENV,
        password: process.env.APP_PASSWORD,
        authorization: request.headers.get("authorization"),
    });
    if (decision === "deny") {
        return new NextResponse("Authentication required", {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Basic realm="RW Grading"',
            },
        });
    }
    if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.next();
    }
    return handleI18n(request);
}

export const config = {
    // Pages and /api. Skip Next internals and files with an extension.
    matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
