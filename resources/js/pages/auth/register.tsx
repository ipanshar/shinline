import { Head, useForm } from '@inertiajs/react';
import { LoaderCircle } from 'lucide-react';
import { FormEventHandler } from 'react';

import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/auth-layout';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '@/components/LanguageSwitcher';


type RegisterForm = {
    name: string;
    email: string;
    company: string;
    phone: string;
    login: string;
    password: string;
    password_confirmation: string;
};

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm<Required<RegisterForm>>({
        name: '',
        email: '',
        login: '',
        phone: '',
        company: '',
        password: '',
        password_confirmation: '',
    });
    const { t } = useTranslation();

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('register'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <AuthLayout title={t('register_account')} description={t('enter_info')}>
            <Head title="Регистрация" />
            <LanguageSwitcher />
            <form className="flex flex-col gap-6" onSubmit={submit}>
                
                <div className="grid gap-6">
                    <div className="grid gap-2">
                        <Label htmlFor="name">{t('full_name')}</Label>
                        <Input
                            id="name"
                            type="text"
                            required
                            autoFocus
                            tabIndex={1}
                            autoComplete="name"
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            disabled={processing}
                            placeholder="Иванов Иван Иванович"
                        />
                        <InputError message={errors.name} className="mt-2" />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="company">{t('company')}</Label>
                        <Input
                            id="company"
                            type="text"
                            required
                            autoFocus
                            tabIndex={1}
                            autoComplete="company"
                            value={data.company}
                            onChange={(e) => setData('company', e.target.value)}
                            disabled={processing}
                            placeholder="ТОО «EH Cargo» или ИП «Иванов И.И.»"
                        />
                        <InputError message={errors.name} className="mt-2" />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="phone">{t('phone')}</Label>
                        <Input
                            id="phone"
                            type="text"
                            required
                            autoFocus
                            tabIndex={1}
                            autoComplete="phone"
                            value={data.phone}
                            onChange={(e) => setData('phone', e.target.value)}
                            disabled={processing}
                            placeholder="+7 (777) 123-45-67"
                        />
                        <InputError message={errors.name} className="mt-2" />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="Login">{t('username')}</Label>
                        <Input
                            id="login"
                            type="text"
                            required
                            autoFocus
                            tabIndex={1}
                            autoComplete="login"
                            value={data.login}
                            onChange={(e) => setData('login', e.target.value)}
                            disabled={processing}
                            placeholder="Логин"
                        />
                        <InputError message={errors.login} className="mt-2" />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email">{t('email')}</Label>
                        <Input
                            id="email"
                            type="email"
                            required
                            tabIndex={2}
                            autoComplete="email"
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            disabled={processing}
                            placeholder="email@example.com"
                        />
                        <InputError message={errors.email} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="password">{t('password')}</Label>
                        <Input
                            id="password"
                            type="password"
                            required
                            tabIndex={3}
                            autoComplete="new-password"
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            disabled={processing}
                            placeholder="Password"
                        />
                        <InputError message={errors.password} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="password_confirmation">{t('confirm_password')}</Label>
                        <Input
                            id="password_confirmation"
                            type="password"
                            required
                            tabIndex={4}
                            autoComplete="new-password"
                            value={data.password_confirmation}
                            onChange={(e) => setData('password_confirmation', e.target.value)}
                            disabled={processing}
                            placeholder="Confirm password"
                        />
                        <InputError message={errors.password_confirmation} />
                    </div>

                    <Button type="submit" className="mt-2 w-full" tabIndex={5} disabled={processing}>
                        {processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {t('create_account')}
                    </Button>
                </div>

                <div className="text-muted-foreground text-center text-sm">
                    {t('already_have_account')}{' '}
                    <TextLink href={route('login')} tabIndex={6}>
                        {t('login')}
                    </TextLink>
                </div>
            </form>
        </AuthLayout>
    );
}
