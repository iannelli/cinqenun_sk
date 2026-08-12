import { hashPassword } from '$lib/server/auth/password';
import { fail } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import type { PageServerLoad, Actions } from './$types';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { RegisterFormSchema } from '$lib/schemas/register';
import { createPendingRegistration } from '$lib/server/auth/email-token';
import { sendConfirmationEmail } from '$lib/server/mail/mailer';

// ─── Load ────────────────────────────────────────────────────────
export const load: PageServerLoad = async () => {
    const form = await superValidate(zod4(RegisterFormSchema));
    return { form };
};

// ─── Actions ─────────────────────────────────────────────────────
export const actions: Actions = {
    default: async ({ request }) => {
        const form = await superValidate(request, zod4(RegisterFormSchema));
        if (!form.valid) return fail(400, { form });
        const { email, password } = form.data;
        // ── 1. Stocker l'inscription en attente ──
        let token: string;
        try {
            const hashedPassword = await hashPassword(password);
            token = await createPendingRegistration(email, hashedPassword);
        } catch (error) {
            console.error('[register] Erreur création pending:', error);
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                return message(form, 'Cet email est déjà utilisé ou une inscription est déjà en cours.', { status: 400 });
            }
            return message(form, "Une erreur est survenue lors de l'enregistrement de votre inscription.", {
                status: 500,
            });
        }
        // ── 2. Envoi de l'email de confirmation ──
        try {
            await sendConfirmationEmail(email, token);
        } catch (error) {
            console.error('[register] Erreur envoi email:', error);
            const smtpError = error as { responseCode?: number };
            if (smtpError.responseCode === 550) {
                return message(form, "L'adresse email indiquée ne peut pas recevoir de messages.", { status: 400 });
             }
            if (smtpError.responseCode === 553) {
                return message(form, "L'adresse email semble invalide.", { status: 400 });
            }
            if (smtpError.responseCode && smtpError.responseCode >= 500) {
                return message(form, "Le serveur de messagerie a rejeté l'envoi. Vérifiez votre adresse email.", { status: 400 });
            }
            return message(
                form, "L'envoi de l'email de confirmation a échoué. Veuillez réessayer dans quelques minutes.", { status: 500 }
            );
        }
        // ── 3. Succès ──
        return message(
            form, 'Un email de confirmation vous a été envoyé. Veuillez cliquer sur le lien reçu pour finaliser votre inscription.'
        );
    },
};