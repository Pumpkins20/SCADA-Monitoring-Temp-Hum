import { usePage } from '@inertiajs/react';
import {
    DEFAULT_HEADER_TITLE,
    type HeaderTitle,
} from '@/components/scada/scada-helpers';

interface ScadaHeaderTitleProps {
    title?: HeaderTitle;
    wrapperClassName?: string;
    line1ClassName?: string;
    line2ClassName?: string;
}

export function ScadaHeaderTitle({
    title,
    wrapperClassName = 'flex flex-1 flex-col items-center',
    line1ClassName = 'text-base font-bold tracking-widest text-white uppercase',
    line2ClassName = 'text-[11px] tracking-wider text-slate-400 uppercase',
}: ScadaHeaderTitleProps) {
    const sharedTitle = usePage<{ headerTitle?: HeaderTitle }>().props
        .headerTitle;
    const resolvedTitle = title ?? sharedTitle ?? DEFAULT_HEADER_TITLE;

    return (
        <div className={wrapperClassName}>
            <p className={line1ClassName}>{resolvedTitle.line1}</p>
            <p className={line2ClassName}>{resolvedTitle.line2}</p>
        </div>
    );
}
