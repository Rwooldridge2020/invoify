import { readFile } from "fs/promises";
import path from "path";

import { RW_GRADING_LOGO_PATH } from "@/lib/rwGradingLogo";

/** The repo logo, embedded so a PDF can show it without a network fetch. */
export async function defaultLogoDataUrl(): Promise<string> {
    const file = path.join(
        process.cwd(),
        "public",
        RW_GRADING_LOGO_PATH.replace(/^\//, "")
    );
    const bytes = await readFile(file);
    return `data:image/png;base64,${bytes.toString("base64")}`;
}
