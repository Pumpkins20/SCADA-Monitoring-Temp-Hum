import { usePage } from '@inertiajs/react';
import {
    DEFAULT_HEADER_LOGOS
    
} from '@/components/scada/scada-helpers';
import type {HeaderLogos} from '@/components/scada/scada-helpers';

interface ScadaHeaderLogosProps {
    logos?: HeaderLogos;
    logoClassName?: string;
}

export function ScadaHeaderLogos({
    logos,
    logoClassName = 'h-8 object-contain',
}: ScadaHeaderLogosProps) {
    const sharedLogos = usePage<{ headerLogos?: HeaderLogos }>().props
        .headerLogos;
    const resolvedLogos = logos ?? sharedLogos ?? DEFAULT_HEADER_LOGOS;

    return (
        <div className="flex items-center justify-between px-5 pt-2 pb-1">
            <img
                src={resolvedLogos.left}
                alt="Logo kiri"
                className={logoClassName}
            />
            <img
                src={resolvedLogos.center}
                alt="Logo tengah"
                className={logoClassName}
            />
            <img
                src={resolvedLogos.right}
                alt="Edutic.id"
                className={logoClassName}
            />
        </div>
    );
}
