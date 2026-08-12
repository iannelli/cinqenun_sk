import { redirect } from '@sveltejs/kit';

export function load() {
    // Redirige immédiatement de la racine (/) vers /login
    throw redirect(307, '/login');
}