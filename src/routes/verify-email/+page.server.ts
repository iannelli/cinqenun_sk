import { confirmPendingRegistration } from '$lib/server/auth/email-token';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
    const token = url.searchParams.get('token');
    if (!token) {
        return { status: 'error', errorMessage: 'Lien de confirmation invalide.' };
     }
    const result = await confirmPendingRegistration(token);
    if (!result.valid) {
        return { status: 'error', errorMessage: result.reason };
    }
     return { status: 'success' };
};