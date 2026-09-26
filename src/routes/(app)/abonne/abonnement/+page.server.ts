import type { PageServerLoad, Actions } from './$types';
import { fail, redirect }               from '@sveltejs/kit';
import { superValidate, message }       from 'sveltekit-superforms';
import { zod4 }                         from 'sveltekit-superforms/adapters';
import { prisma }                       from '$lib/server/prisma';
import { type AbonnementDerived, AbonnementFormSchema, ABONNE_SELECT, parseAbonnement, buildAbonnement } from '$lib/schemas/abonne';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const abonne = await prisma.abonne.findUniqueOrThrow({
        where: { id: locals.user.id },
        select: ABONNE_SELECT
    });
    const abonnement = parseAbonnement(abonne.abonnement);
    const form       = await superValidate(abonnement, zod4(AbonnementFormSchema), {
        id: 'abonnement'
    });
    return { form };
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        const form = await superValidate(request, zod4(AbonnementFormSchema), {
            id: 'abonnement'
        });
        if (!form.valid) {
            return fail(400, { form });
        }
        const d = form.data;
        const abonnementDerived: AbonnementDerived = {
            numAbonne0:   d.numAbonne0,
            dateOuvert0:  d.dateOuvert0,
            dateFerme0:   d.dateFerme0,
            etatAbonne0:  d.etatAbonne0,
            soldeAbonne0: d.soldeAbonne0
        };
        await prisma.abonne.update({
            where: { id: locals.user.id },
            data: {
                abonnement: buildAbonnement(abonnementDerived),
                updatedAt: new Date()
            }
        });
        return message(form, 'Abonnement mis à jour avec succès.');
    }
};