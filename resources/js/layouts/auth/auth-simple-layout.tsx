import { Link, usePage } from '@inertiajs/react';
import {
    DEFAULT_HEADER_LOGOS,
    type HeaderLogos,
} from '@/components/scada/scada-helpers';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    const headerLogos =
        usePage<{ headerLogos?: HeaderLogos }>().props.headerLogos ??
        DEFAULT_HEADER_LOGOS;

    return (
        <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-[#10161b] p-6 md:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_38%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.12),transparent_40%)]" />

            <div className="relative w-full max-w-md rounded-2xl border border-slate-700/70 bg-[#151d23]/95 p-6 shadow-[0_0_45px_#0b12201f] backdrop-blur-sm md:p-8">
                <div className="flex flex-col gap-7">
                    <div className="flex items-center justify-between gap-3">
                        <img
                            src={headerLogos.left}
                            alt="InJourney Airports"
                            className="h-7 object-contain"
                        />
                        <img
                            src={headerLogos.center}
                            alt="Westindo"
                            className="h-7 object-contain"
                        />
                        <img
                            src={headerLogos.right}
                            alt="Edutic.id"
                            className="h-7 object-contain"
                        />
                    </div>

                    <div className="flex flex-col items-center gap-3 text-center">
                        <Link
                            href={home()}
                            className="inline-flex rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold tracking-widest text-cyan-300 uppercase hover:bg-cyan-500/20"
                        >
                            SCADA Monitoring
                        </Link>

                        <div className="space-y-1.5">
                            <h1 className="text-xl font-semibold tracking-wide text-white">
                                {title}
                            </h1>
                            <p className="text-sm text-slate-300">
                                {description}
                            </p>
                        </div>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}
