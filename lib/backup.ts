export const BACKUP_KIND = "rwg-backup";

export type JobBackup = {
    kind: typeof BACKUP_KIND;
    estimates: unknown[];
    invoices: unknown[];
    senders: unknown[];
    clients: unknown[];
};

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export function buildBackup(parts: {
    estimates: unknown;
    invoices: unknown;
    senders: unknown;
    clients: unknown;
}): JobBackup {
    return {
        kind: BACKUP_KIND,
        estimates: asArray(parts.estimates),
        invoices: asArray(parts.invoices),
        senders: asArray(parts.senders),
        clients: asArray(parts.clients),
    };
}

export function parseBackup(raw: unknown): JobBackup | null {
    if (!raw || typeof raw !== "object") return null;
    if ((raw as { kind?: unknown }).kind !== BACKUP_KIND) return null;
    const file = raw as Partial<JobBackup>;
    return buildBackup({
        estimates: file.estimates,
        invoices: file.invoices,
        senders: file.senders,
        clients: file.clients,
    });
}

function recordId(row: unknown): string | null {
    if (!row || typeof row !== "object") return null;
    const id = (row as { id?: unknown }).id;
    return typeof id === "string" && id.trim() ? id : null;
}

function invoiceNumber(row: unknown): string | null {
    if (!row || typeof row !== "object") return null;
    const details = (row as { details?: unknown }).details;
    if (!details || typeof details !== "object") return null;
    const number = (details as { invoiceNumber?: unknown }).invoiceNumber;
    return typeof number === "string" && number.trim() ? number : null;
}

function sameRow(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Replace a matching id in place. Append a new id. Keep an id-less row once. */
export function mergeById(current: unknown[], incoming: unknown[]): unknown[] {
    const next = [...current];
    for (const row of incoming) {
        const id = recordId(row);
        if (id) {
            const index = next.findIndex((item) => recordId(item) === id);
            if (index === -1) next.push(row);
            else next[index] = row;
            continue;
        }
        if (!next.some((item) => recordId(item) === null && sameRow(item, row))) {
            next.push(row);
        }
    }
    return next;
}

/** Invoices have no id. The invoice number is the match key. */
export function mergeInvoices(
    current: unknown[],
    incoming: unknown[]
): unknown[] {
    const next = [...current];
    for (const row of incoming) {
        const number = invoiceNumber(row);
        if (number) {
            const index = next.findIndex((item) => invoiceNumber(item) === number);
            if (index === -1) next.push(row);
            else next[index] = row;
            continue;
        }
        if (
            !next.some(
                (item) => invoiceNumber(item) === null && sameRow(item, row)
            )
        ) {
            next.push(row);
        }
    }
    return next;
}

export function mergeBackup(current: JobBackup, incoming: JobBackup): JobBackup {
    return {
        kind: BACKUP_KIND,
        estimates: mergeById(current.estimates, incoming.estimates),
        invoices: mergeInvoices(current.invoices, incoming.invoices),
        senders: mergeById(current.senders, incoming.senders),
        clients: mergeById(current.clients, incoming.clients),
    };
}
