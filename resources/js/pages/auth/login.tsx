import { Form, Head, usePage } from '@inertiajs/react';
import {
    Activity,
    Droplets,
    Eye,
    EyeOff,
    ShieldCheck,
    Thermometer,
} from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { DEFAULT_HEADER_LOGOS } from '@/components/scada/scada-helpers';
import type { HeaderLogos } from '@/components/scada/scada-helpers';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { store } from '@/routes/login';

type Props = {
    status?: string;
    liveReadings?: {
        avgTemperature: number | null;
        avgHumidity: number | null;
        onlineSensors: number;
        overallStatus: string;
        lastSyncLabel: string;
    };
};

export default function Login({ status, liveReadings }: Props) {
    const [showPassword, setShowPassword] = useState(false);
    const headerLogos =
        usePage<{ headerLogos?: HeaderLogos }>().props.headerLogos ??
        DEFAULT_HEADER_LOGOS;
    const temperatureDisplay =
        liveReadings?.avgTemperature !== null &&
        liveReadings?.avgTemperature !== undefined
            ? liveReadings.avgTemperature.toFixed(1)
            : '--';
    const humidityDisplay =
        liveReadings?.avgHumidity !== null &&
        liveReadings?.avgHumidity !== undefined
            ? liveReadings.avgHumidity.toFixed(1)
            : '--';
    const onlineSensors = liveReadings?.onlineSensors ?? 0;
    const overallStatus = liveReadings?.overallStatus ?? 'No Data';
    const statusClassName =
        overallStatus === 'Kritis'
            ? 'text-rose-300'
            : overallStatus === 'Waspada'
              ? 'text-amber-300'
              : overallStatus === 'Optimal'
                ? 'text-emerald-300'
                : 'text-slate-300';

    return (
        <div className="min-h-svh bg-[#151b1f] font-sans text-white">
            <Head title="Masuk" />

            <div className="grid min-h-svh lg:grid-cols-2">
                <section className="relative overflow-hidden border-b border-slate-700/60 bg-[#0f1316] lg:border-r lg:border-b-0">
                    <div
                        className="absolute inset-0 opacity-[0.05]"
                        style={{
                            backgroundImage:
                                'linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)',
                            backgroundSize: '42px 42px',
                        }}
                    />
                    <div className="absolute -top-28 left-16 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
                    <div className="absolute right-12 -bottom-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

                    <div className="relative z-10 mx-auto flex h-full w-full max-w-3xl flex-col justify-between gap-10 p-6 sm:p-10 lg:p-14">
                        <div className="flex items-center gap-4">
                            <img
                                src={headerLogos.left}
                                alt="InJourney Airports"
                                className="h-8 object-contain"
                            />
                            <div className="h-5 w-px bg-slate-700" />
                            <img
                                src={headerLogos.center}
                                alt="Westindo"
                                className="h-8 object-contain"
                            />
                            <div className="h-5 w-px bg-slate-700" />
                            <img
                                src={headerLogos.right}
                                alt="Edutic.id"
                                className="h-8 object-contain"
                            />
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-4">
                                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold tracking-wider text-emerald-300 uppercase backdrop-blur-sm">
                                    <span className="relative flex h-2 w-2">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                                    </span>
                                    Sistem Aktif
                                </div>

                                <div className="space-y-3">
                                    <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight text-white sm:text-5xl">
                                        SCADA{' '}
                                        <span className="bg-linear-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                                            Environment
                                        </span>
                                    </h1>
                                    <p className="max-w-xl text-base text-slate-300 sm:text-lg">
                                        Monitoring suhu dan kelembapan real-time
                                        pada fasilitas kritikal Server Room,
                                        CCTV & FIDS Bandara Soekarno-Hatta.
                                    </p>
                                </div>
                            </div>

                            {/* UI Dashboard Mockup */}
                            <div className="relative max-w-2xl rounded-2xl border border-slate-700/60 bg-[#0a0e11]/80 shadow-2xl backdrop-blur-xl">
                                <div className="absolute -top-px right-10 left-10 h-px bg-linear-to-r from-transparent via-cyan-500/50 to-transparent"></div>

                                <div className="flex items-center justify-between border-b border-slate-800/80 p-4 sm:px-6">
                                    <div className="flex items-center gap-2">
                                        <Activity className="h-5 w-5 text-cyan-400" />
                                        <span className="text-sm font-semibold tracking-wide text-slate-200">
                                            LIVE READINGS
                                        </span>
                                    </div>
                                    <div className="flex gap-1">
                                        <div className="h-2 w-2 rounded-full bg-rose-500/80"></div>
                                        <div className="h-2 w-2 rounded-full bg-amber-500/80"></div>
                                        <div className="h-2 w-2 rounded-full bg-emerald-500/80"></div>
                                    </div>
                                </div>

                                <div className="grid gap-px bg-slate-800/50 sm:grid-cols-3">
                                    {/* Card 1 */}
                                    <div className="bg-[#0f1316] p-4 text-center sm:p-6">
                                        <Thermometer className="mx-auto mb-3 h-6 w-6 text-cyan-400/80" />
                                        <div className="text-3xl font-bold text-slate-50">
                                            {temperatureDisplay}
                                            <span className="text-lg text-slate-400">
                                                °C
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] font-medium tracking-wider text-slate-500 uppercase">
                                            Temp Rata-rata
                                        </p>
                                    </div>

                                    {/* Card 2 */}
                                    <div className="bg-[#0f1316] p-4 text-center sm:p-6">
                                        <Droplets className="mx-auto mb-3 h-6 w-6 text-blue-400/80" />
                                        <div className="text-3xl font-bold text-slate-50">
                                            {humidityDisplay}
                                            <span className="text-lg text-slate-400">
                                                %
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] font-medium tracking-wider text-slate-500 uppercase">
                                            Hum Rata-rata
                                        </p>
                                    </div>

                                    {/* Card 3 - Status */}
                                    <div className="col-span-2 flex flex-col items-center justify-center bg-[#0f1316] p-4 sm:col-span-1 sm:p-6">
                                        <ShieldCheck className="mb-2 h-8 w-8 text-emerald-400" />
                                        <div
                                            className={`text-xl font-bold ${statusClassName}`}
                                        >
                                            {overallStatus}
                                        </div>
                                        <p className="mt-1 text-center text-[11px] tracking-widest text-slate-500 uppercase">
                                            {onlineSensors} Sensor Online
                                        </p>
                                    </div>
                                </div>
                                <div className="border-t border-slate-800/80 p-3 text-center text-xs text-slate-500">
                                    Last synchronized:{' '}
                                    {liveReadings?.lastSyncLabel ??
                                        'Belum ada data'}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="flex items-center justify-center bg-[#11171c] p-6 sm:p-10">
                    <div className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-[#0f1316]/95 p-6 shadow-[0_0_55px_rgba(34,211,238,0.07)] backdrop-blur-sm sm:p-8">
                        <div className="mb-6 flex items-center justify-center gap-4 lg:hidden">
                            <img
                                src={headerLogos.left}
                                alt="InJourney Airports"
                                className="h-7 object-contain"
                            />
                            <div className="h-4 w-px bg-slate-700" />
                            <img
                                src={headerLogos.center}
                                alt="Westindo"
                                className="h-7 object-contain"
                            />
                            <div className="h-4 w-px bg-slate-700" />
                            <img
                                src={headerLogos.right}
                                alt="Edutic.id"
                                className="h-7 object-contain"
                            />
                        </div>

                        <div className="mb-7 space-y-2">
                            <h2 className="text-2xl font-semibold tracking-tight text-white">
                                Masuk ke akun Anda
                            </h2>
                            <p className="text-sm text-slate-400">
                                Masukkan email dan kata sandi untuk melanjutkan.
                            </p>
                        </div>

                        <Form
                            {...store.form()}
                            resetOnSuccess={['password']}
                            className="flex flex-col gap-6"
                        >
                            {({ processing, errors }) => (
                                <>
                                    <div className="grid gap-5">
                                        <div className="grid gap-2">
                                            <Label
                                                htmlFor="email"
                                                className="text-slate-300"
                                            >
                                                Alamat Email
                                            </Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                name="email"
                                                required
                                                autoFocus
                                                tabIndex={1}
                                                autoComplete="email"
                                                placeholder="email@contoh.com"
                                                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-cyan-500/60 focus-visible:ring-cyan-500/40"
                                            />
                                            <InputError
                                                message={errors.email}
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label
                                                htmlFor="password"
                                                className="text-slate-300"
                                            >
                                                Kata Sandi
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    id="password"
                                                    type={
                                                        showPassword
                                                            ? 'text'
                                                            : 'password'
                                                    }
                                                    name="password"
                                                    required
                                                    tabIndex={2}
                                                    autoComplete="current-password"
                                                    placeholder="Kata sandi"
                                                    className="border-slate-700 bg-slate-800 pr-10 text-white placeholder:text-slate-500 focus-visible:border-cyan-500/60 focus-visible:ring-cyan-500/40"
                                                />
                                                <button
                                                    type="button"
                                                    tabIndex={-1}
                                                    onClick={() =>
                                                        setShowPassword(
                                                            (value) => !value,
                                                        )
                                                    }
                                                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-slate-200"
                                                    aria-label={
                                                        showPassword
                                                            ? 'Sembunyikan kata sandi'
                                                            : 'Tampilkan kata sandi'
                                                    }
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                            <InputError
                                                message={errors.password}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    id="remember"
                                                    name="remember"
                                                    tabIndex={3}
                                                />
                                                <Label
                                                    htmlFor="remember"
                                                    className="text-slate-300"
                                                >
                                                    Ingat saya
                                                </Label>
                                            </div>
                                            <Activity className="h-4 w-4 text-cyan-400/80" />
                                        </div>

                                        <Button
                                            type="submit"
                                            className="mt-1 w-full bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee40] hover:bg-cyan-400 hover:shadow-[0_0_16px_#22d3ee60]"
                                            tabIndex={4}
                                            disabled={processing}
                                            data-test="login-button"
                                        >
                                            {processing && <Spinner />}
                                            Masuk
                                        </Button>
                                    </div>
                                </>
                            )}
                        </Form>

                        {status && (
                            <div className="mt-4 text-center text-sm font-medium text-green-400">
                                {status}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
