import { router, usePage } from '@inertiajs/react';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type PasswordConfirmationInfo = {
    is_active?: boolean;
    timeout_seconds?: number;
    remaining_seconds?: number;
    expires_at?: string | null;
};

export function PasswordSessionFloating({ className }: { className?: string }) {
    const info =
        usePage<{
            auth?: { password_confirmation?: PasswordConfirmationInfo };
        }>().props.auth?.password_confirmation;

    const isActive = info?.is_active ?? false;
    const timeoutSeconds = info?.timeout_seconds ?? 900;
    const initialRemaining = info?.remaining_seconds ?? 0;
    const expiresAt = info?.expires_at ?? null;
    const redirectedRef = useRef(false);

    const [remainingSeconds, setRemainingSeconds] = useState(initialRemaining);

    useEffect(() => {
        if (!isActive) {
            return;
        }

        if (!expiresAt) {
            return;
        }

        const expiresAtEpoch = Date.parse(expiresAt);

        if (Number.isNaN(expiresAtEpoch)) {
            return;
        }

        const syncRemaining = () => {
            const seconds = Math.max(
                Math.ceil((expiresAtEpoch - Date.now()) / 1000),
                0,
            );

            setRemainingSeconds(seconds);

            if (seconds <= 0 && !redirectedRef.current) {
                redirectedRef.current = true;
                router.visit('/dashboard', {
                    replace: true,
                    preserveScroll: true,
                });
            }
        };

        syncRemaining();

        const interval = window.setInterval(syncRemaining, 1000);
        const onVisibilityChange = () => {
            syncRemaining();
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', onVisibilityChange);

        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', onVisibilityChange);
        };
    }, [expiresAt, initialRemaining, isActive]);

    useEffect(() => {
        redirectedRef.current = false;
    }, [expiresAt]);

    const countdownLabel = useMemo(() => {
        const minutes = Math.floor(remainingSeconds / 60)
            .toString()
            .padStart(2, '0');
        const seconds = (remainingSeconds % 60).toString().padStart(2, '0');

        return `${minutes}:${seconds}`;
    }, [remainingSeconds]);

    const progressPercent =
        timeoutSeconds > 0
            ? Math.max(Math.min((remainingSeconds / timeoutSeconds) * 100, 100), 0)
            : 0;

    if (!isActive) {
        return null;
    }

    return (
        <div
            className={cn(
                'pointer-events-none fixed top-22 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-cyan-500/30 bg-[#0f171f]/90 px-3 py-2 shadow-[0_0_18px_#22d3ee2a] backdrop-blur-sm',
                className,
            )}
        >
            <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                <p className="text-[10px] font-semibold tracking-wider text-cyan-200 uppercase">
                    Verifikasi Aktif
                </p>
                <span className="text-[10px] text-slate-500">|</span>
                <p className="text-sm font-bold tracking-wider text-white tabular-nums">
                    {countdownLabel}
                </p>
            </div>

            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-700/80">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-[width] duration-1000"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>
        </div>
    );
}
