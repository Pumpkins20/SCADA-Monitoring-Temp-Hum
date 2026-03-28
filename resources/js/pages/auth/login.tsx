import { Form, Head, usePage } from '@inertiajs/react';
import { Droplets, Eye, EyeOff, Thermometer } from 'lucide-react';
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
};

export default function Login({ status }: Props) {
    const [showPassword, setShowPassword] = useState(false);
    const headerLogos =
        usePage<{ headerLogos?: HeaderLogos }>().props.headerLogos ??
        DEFAULT_HEADER_LOGOS;

    return (
        <div className="flex min-h-svh flex-col items-center justify-center bg-[#151b1f] p-4 font-sans sm:p-6 md:p-10">
            <Head title="Masuk" />

            <div className="w-full max-w-sm md:max-w-3xl">
                <div className="overflow-hidden rounded-xl border border-slate-700/60 shadow-[0_0_60px_rgba(34,211,238,0.06)]">
                    <div className="grid md:grid-cols-2">
                        {/* ── Kiri: Form ─────────────────────────────── */}
                        <div className="flex flex-col justify-center bg-[#0f1316] p-6 sm:p-8 md:p-10">
                            {/* Logos di mobile (kolom kanan tersembunyi) */}
                            <div className="mb-6 flex items-center justify-center gap-4 md:hidden">
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

                            <div className="mb-6">
                                <h1 className="text-xl font-bold tracking-wide text-white">
                                    Masuk ke akun Anda
                                </h1>
                                <p className="mt-1 text-sm text-slate-400">
                                    Masukkan email dan kata sandi untuk
                                    melanjutkan
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
                                                <div className="flex items-center">
                                                    <Label
                                                        htmlFor="password"
                                                        className="text-slate-300"
                                                    >
                                                        Kata Sandi
                                                    </Label>
                                                </div>
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
                                                                (v) => !v,
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

                                            <div className="flex items-center space-x-3">
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

                                            <Button
                                                type="submit"
                                                className="mt-2 w-full bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee40] hover:bg-cyan-400 hover:shadow-[0_0_16px_#22d3ee60]"
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

                        {/* ── Kanan: Panel dekoratif (hanya desktop) ──── */}
                        <div className="relative hidden flex-col items-center justify-center overflow-hidden border-l border-slate-700/60 bg-slate-900 p-10 md:flex">
                            {/* Subtle grid background */}
                            <div
                                className="absolute inset-0 opacity-[0.04]"
                                style={{
                                    backgroundImage: `linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)`,
                                    backgroundSize: '40px 40px',
                                }}
                            />
                            {/* Ambient glow */}
                            <div className="absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/5 blur-3xl" />

                            <div className="relative z-10 flex flex-col items-center text-center">
                                <div className="mb-5 flex items-center gap-3">
                                    <Thermometer
                                        className="h-9 w-9 text-cyan-400"
                                        style={{
                                            filter: 'drop-shadow(0 0 8px #22d3ee)',
                                        }}
                                    />
                                    <Droplets
                                        className="h-9 w-9 text-blue-400"
                                        style={{
                                            filter: 'drop-shadow(0 0 8px #60a5fa)',
                                        }}
                                    />
                                </div>

                                <h2 className="text-xl font-bold tracking-widest text-white uppercase">
                                    SCADA Monitoring
                                </h2>
                                <p className="mt-2 text-[11px] tracking-wider text-slate-400 uppercase">
                                    AC Presisi · Ruang Server CCTV & FIDS
                                </p>
                                <p className="mt-1 text-[10px] tracking-wider text-slate-500 uppercase">
                                    Bandara Soekarno‑Hatta
                                </p>

                                <div className="mt-8 flex items-center gap-4 opacity-40">
                                    <img
                                        src={headerLogos.left}
                                        alt="InJourney"
                                        className="h-6 object-contain"
                                    />
                                    <div className="h-4 w-px bg-slate-700" />
                                    <img
                                        src={headerLogos.center}
                                        alt="Westindo"
                                        className="h-6 object-contain"
                                    />
                                    <div className="h-4 w-px bg-slate-700" />
                                    <img
                                        src={headerLogos.right}
                                        alt="Edutic.id"
                                        className="h-6 object-contain"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
