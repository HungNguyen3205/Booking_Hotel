'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Leaf, LogIn } from 'lucide-react';
import { post, setCsrf } from '@/lib/api';
import { Notice } from '@/components/ui';
import { errorText } from '@/lib/format';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const res = await post<{ csrf: string }>('/login', data);
      setCsrf(res.csrf);
      const next = params.get('next');
      router.replace(next && next.startsWith('/admin') && !next.startsWith('/admin/dang-nhap') ? next : '/admin');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="login-card card" onSubmit={submit}>
      <div className="login-brand"><span className="brand-mark"><Leaf size={18} /></span><div><strong>GLG HOTEL &amp; SPA</strong><small>Hệ thống vận hành</small></div></div>
      <h1 className="serif">Đăng nhập</h1>
      {error && <Notice kind="error">{error}</Notice>}
      <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="username" required /></label>
      <label className="field"><span>Mật khẩu</span><input className="input" name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn btn-primary btn-block" disabled={busy}><LogIn size={16} /> {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      <a className="small muted" href="/">← Về website</a>
    </form>
  );
}

export default function LoginPage() {
  return <main className="login-page"><Suspense><LoginForm /></Suspense></main>;
}
