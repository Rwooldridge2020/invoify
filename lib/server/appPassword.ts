export type AppPasswordDecision = "allow" | "deny";

/**
 * Gate for every page and /api route.
 * A set APP_PASSWORD requires HTTP Basic auth. The username is ignored.
 * Unset: open in development, closed in production.
 * Edge-safe: middleware bundles this file.
 */
export function appPasswordDecision(input: {
    nodeEnv: string | undefined;
    password: string | undefined;
    authorization: string | null;
}): AppPasswordDecision {
    const password = input.password ?? "";
    if (!password) {
        return input.nodeEnv === "production" ? "deny" : "allow";
    }

    const supplied = basicPassword(input.authorization);
    if (supplied === null) return "deny";
    return safeEqual(supplied, password) ? "allow" : "deny";
}

function basicPassword(authorization: string | null): string | null {
    const match = /^Basic\s+(\S+)$/i.exec(authorization ?? "");
    if (!match) return null;
    try {
        const binary = atob(match[1]);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder().decode(bytes).split(":").slice(1).join(":");
    } catch {
        return null;
    }
}

function safeEqual(given: string, expected: string): boolean {
    const left = new TextEncoder().encode(given);
    const right = new TextEncoder().encode(expected);
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
    return diff === 0;
}
