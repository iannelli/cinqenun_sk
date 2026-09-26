import type { Cookies } from '@sveltejs/kit';
import type { Session } from './session';

export function setSessionCookie(cookies: Cookies, session: Session) {
    cookies.set('sessionId', session.id.toString(), {
        path:      '/',
        httpOnly:  true,
        sameSite: 'lax',
        secure:    process.env.NODE_ENV === 'production',
        maxAge:    60 * 60 * 24 * 7 // 7 jours
    });
}

export function setRememberCookie(cookies: Cookies, token: string) {
    cookies.set('rememberToken', token, {
        path:     '/',
        httpOnly: true,
        sameSite: 'lax',
        secure:   process.env.NODE_ENV === 'production',
        maxAge:   60 * 60 * 24 * 30 // 30 jours
    });
}

export function clearSessionCookie(cookies: Cookies) {
    cookies.delete('session', { path: '/' });
}

export function clearRememberCookie(cookies: Cookies) {
    cookies.delete('remember', { path: '/' });
}