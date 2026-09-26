import { fail, redirect }                      from '@sveltejs/kit';
import type { PageServerLoad, Actions }        from './$types';
import { createSession }                       from '$lib/server/auth/session';
import { setSessionCookie, setRememberCookie } from '$lib/server/auth/cookies';
import { createRememberToken }                 from '$lib/server/auth/remember';
import { prisma }                              from '$lib/server/prisma';
import bcrypt                                  from 'bcrypt';
import { superValidate, message }              from 'sveltekit-superforms';
import { zod4 }                                from 'sveltekit-superforms/adapters';
import { LoginFormSchema }                     from '$lib/schemas/login';
import { createPasswordReset }                 from '$lib/server/auth/password-reset';
import { sendResetPasswordEmail }              from '$lib/server/mail/mailer';
import { runStatutAffairesToutes }             from '$lib/server/runStatutAffaireActive&Archive';

// ─── Load ────────────────────────────────────────────────────────
export const load: PageServerLoad = async () => {
    const form = await superValidate(zod4(LoginFormSchema));
    return { form };
};

/** Supprime toutes les sessions et remember tokens d'un utilisateur. */
async function cleanUserSessions(userId: number) {
    await prisma.session.deleteMany({ where: { abonneId: userId } });
    await prisma.remember.deleteMany({ where: { abonneId: userId } });
}

// ─── Actions ─────────────────────────────────────────────────────
export const actions: Actions = {
    login: async ({ request, cookies }) => {
        const formData  = await request.formData();
        const remember  = formData.get('remember');
        // 1. Validation Zod via Superforms
        const form      = await superValidate(formData, zod4(LoginFormSchema));
        if (!form.valid) return fail(400, { form });
        const { email, password } = form.data;
        // 2. Vérifier l'utilisateur
        const user      = await prisma.abonne.findUnique({ where: { email } });
        if (!user) {
            return message(form, 'Utilisateur inconnu.', { status: 400 });
        }
        // 3. Vérifier le mot de passe
        const valid     = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return message(form, 'Mot de passe incorrect.', { status: 400 });
        }
        // 4. Nettoyer sessions et remember existants
        await cleanUserSessions(user.id);
        // 5. Créer la nouvelle session
        const session   = await createSession(user.id);
        setSessionCookie(cookies, session);
        // 6. Remember me
        if (remember) {
            const token = await createRememberToken(user.id);
            setRememberCookie(cookies, token);
        }
        // 7. Actualisation de toutes les affaires à la connexion ──
        try {
            await runStatutAffairesToutes(user.id);
        } catch (err) {
            // L'utilisateur se connecte quand même — le traitement sera relancé à la prochaine connexion ou par le cron nocturne
            console.error('[login] runStatutAffairesToutes échec:', err);
        }
        // ─────────────────────────────────────────────────────────
        // 8. Redirection
        throw redirect(302, '/dashboard');
    },
    forgot: async ({ request }) => {
        const formData = await request.formData();
        const email    = formData.get('email')?.toString()?.trim() || '';
        const form     = await superValidate(zod4(LoginFormSchema));
        if (!email) {
            return message(form, 'Veuillez saisir votre adresse email avant de cliquer sur "Mot de passe oublié".', { status: 400 });
        }
        const result = await createPasswordReset(email);
        if (!result.success) {
            return message(form, result.reason, { status: 400 });
        }
        try {
            await sendResetPasswordEmail(email, result.tempPassword);
        } catch (error) {
            console.error('[forgot] Erreur envoi email:', error);
            return message(form, "L'envoi de l'email a échoué. Veuillez réessayer dans quelques minutes.", { status: 500 });
        }
        throw redirect(302, `/reset-password?token=${result.token}`);
    }
};