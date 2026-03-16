import { Form, Head } from '@inertiajs/react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { store } from '@/routes/password/confirm';

export default function ConfirmPassword() {
    return (
        <AuthLayout
            title="Verifikasi Password"
            description="Area Device Management dilindungi. Konfirmasi password diperlukan sebelum melanjutkan."
        >
            <Head title="Verifikasi Password" />

            <Form {...store.form()} resetOnSuccess={['password']}>
                {({ processing, errors }) => (
                    <div className="space-y-5">
                        <div className="grid gap-2">
                            <Label
                                htmlFor="password"
                                className="text-xs font-semibold tracking-wider text-slate-200 uppercase"
                            >
                                Password
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                name="password"
                                placeholder="Masukkan password akun"
                                autoComplete="current-password"
                                autoFocus
                                className="border-slate-600 bg-slate-900/70 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                            />

                            <InputError message={errors.password} />
                        </div>

                        <div className="flex items-center">
                            <Button
                                className="w-full bg-cyan-600 text-white hover:bg-cyan-500"
                                disabled={processing}
                                data-test="confirm-password-button"
                            >
                                {processing && <Spinner />}
                                Verifikasi & Lanjutkan
                            </Button>
                        </div>
                    </div>
                )}
            </Form>
        </AuthLayout>
    );
}
