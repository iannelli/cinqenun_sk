import { fail }                              from '@sveltejs/kit';
import type { PageServerLoad, Actions }      from './$types';
import { superValidate, message }            from 'sveltekit-superforms';
import { zod4 }                              from 'sveltekit-superforms/adapters';
import { ResetPasswordSchema }               from '$lib/schemas/reset-password';
import { consumePasswordReset }              from '$lib/server/auth/password-reset';

// ─── Load ────────────────────────────────────────────────────────
export const load: PageServerLoad = async ({ url }) => {
    const token = url.searchParams.get('token');
    if (!token) {
        return { form: await superValidate(zod4(ResetPasswordSchema)), token: null, error: 'Lien de réinitialisation invalide.' };
    }
    const form = await superValidate(zod4(ResetPasswordSchema));
    return { form, token, error: null };
};
// ─── Actions ─────────────────────────────────────────────────────
export const actions: Actions = {
    default: async ({ request }) => {
        const formData = await request.formData();
        const token    = formData.get('token')?.toString() || '';
        const form     = await superValidate(formData, zod4(ResetPasswordSchema));
        if (!form.valid) return fail(400, { form });
        const { tempPassword, password } = form.data;
        const result   = await consumePasswordReset(token, tempPassword, password);
        if (!result.valid) {
            return message(form, result.reason, { status: 400 });
        }
        return message(form, 'Votre mot de passe a été modifié avec succès. Vous pouvez vous connecter.');
    },
};