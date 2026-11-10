"use client";

import { useMemo, useState } from "react";

// Next
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import Image from "next/image";

import { cn } from "@/lib/utils";

// ShadCn
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

// Components
import {
    BaseButton,
    DevDebug,
    LanguageSelector,
    ThemeSwitcher,
} from "@/app/components";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

// Icons
import { Settings2 } from "lucide-react";

function SectionLinks({
    locale,
    pathname,
    stacked = false,
    onNavigate,
}: {
    locale: string;
    pathname: string;
    stacked?: boolean;
    onNavigate?: () => void;
}) {
    const invoicesHref = `/${locale}`;
    const estimatesHref = `/${locale}/estimate`;
    const onInvoices = pathname === invoicesHref || pathname === `${invoicesHref}/`;
    const onEstimates =
        pathname === estimatesHref || pathname.startsWith(`${estimatesHref}/`);

    const item = (href: string, label: string, active: boolean) => (
        <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
                "whitespace-nowrap text-sm font-medium",
                active
                    ? "text-foreground underline decoration-2 underline-offset-4"
                    : "text-muted-foreground hover:text-foreground",
                stacked && "py-1"
            )}
        >
            {label}
        </Link>
    );

    return (
        <div className={cn("flex gap-3", stacked && "flex-col gap-2")}>
            {item(invoicesHref, "Invoices", onInvoices)}
            {item(estimatesHref, "Estimates", onEstimates)}
        </div>
    );
}

const BaseNavbar = () => {
    const devEnv = useMemo(() => {
        return process.env.NODE_ENV === "development";
    }, []);

    const [menuOpen, setMenuOpen] = useState(false);

    const { _t } = useTranslationContext();
    const locale = useLocale();
    const pathname = usePathname() || `/${locale}`;

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <nav className="container flex h-16 items-center justify-between gap-4">
                <Link
                    href={`/${locale}`}
                    className="flex min-w-0 items-center gap-2"
                >
                    <Image
                        src="/assets/img/rw-grading-logo.png"
                        alt=""
                        width={2045}
                        height={870}
                        loading="eager"
                        priority
                        className="hidden h-8 w-auto shrink-0 sm:block"
                    />
                    <span className="truncate text-sm font-semibold tracking-tight">
                        RW Grading Estimates
                    </span>
                </Link>

                {/* ? DEV Only */}
                {devEnv && (
                    <div className="hidden lg:block">
                        <DevDebug />
                    </div>
                )}

                {/* Desktop controls */}
                <div className="hidden items-center gap-3 sm:flex">
                    <SectionLinks locale={locale} pathname={pathname} />
                    <LanguageSelector />
                    <ThemeSwitcher />
                </div>

                {/*
                 * Below sm the language select alone is wider than the space
                 * left beside the logo, so both controls move into a sheet.
                 */}
                <div className="flex items-center gap-3 sm:hidden">
                    <SectionLinks locale={locale} pathname={pathname} />
                    <ThemeSwitcher />
                    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                        <SheetTrigger asChild>
                            <BaseButton
                                variant="ghost"
                                size="icon"
                                aria-label={_t("navbar.openSettings")}
                            >
                                <Settings2 className="h-5 w-5" />
                            </BaseButton>
                        </SheetTrigger>
                        <SheetContent
                            side="right"
                            className="w-[85vw] max-w-sm"
                        >
                            <SheetHeader className="mb-6">
                                <SheetTitle>{_t("navbar.settings")}</SheetTitle>
                            </SheetHeader>

                            <div className="flex flex-col gap-4">
                                <SectionLinks
                                    locale={locale}
                                    pathname={pathname}
                                    stacked
                                    onNavigate={() => setMenuOpen(false)}
                                />
                                <div className="flex flex-col gap-2">
                                    <span className="text-sm text-muted-foreground">
                                        {_t("navbar.language")}
                                    </span>
                                    <LanguageSelector variant="block" />
                                </div>

                                {devEnv && <DevDebug />}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </nav>
        </header>
    );
};

export default BaseNavbar;
