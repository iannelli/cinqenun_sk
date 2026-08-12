import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/prisma';
import { FiscaliteFormSchema, ABONNE_SELECT, parseStatut, buildStatut, parseAbonnement } from '$lib/schemas/abonne';
import type { StatutDerived } from '$lib/schemas/abonne';

/** Convertit YYYY-MM-DD → jj/mm/aaaa */
function dateIsoVersJjMmAaaa(dateIso: string): string {
        if (!dateIso || !dateIso.includes('-')) return dateIso;
        const [aaaa, mm, jj] = dateIso.split('-');
        return `${jj}/${mm}/${aaaa}`;
    }
    /** Convertit jj/mm/aaaa → YYYY-MM-DD (pour le champ <input type="date">) */
    function dateJjMmAaaaVersIso(dateFr: string): string {
        if (!dateFr || !dateFr.includes('/')) return dateFr;
        const [jj, mm, aaaa] = dateFr.split('/');
        return `${aaaa}-${mm}-${jj}`;
    }

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const abonne = await prisma.abonne.findUniqueOrThrow({
        where: { id: locals.user.id },
        select: ABONNE_SELECT
    });
    const statut = parseStatut(abonne.statut);
    const abonnement = parseAbonnement(abonne.abonnement);
    const form = await superValidate(
        {
            ...statut,
            // dateDebActiv0 : jj/mm/aaaa en base → YYYY-MM-DD pour <input type="date">
            dateDebActiv0: dateJjMmAaaaVersIso(statut.dateDebActiv0),
            // versLib0 : string en base → boolean pour le formulaire
            versLib0: statut.versLib0 === '1',
            // champs Prisma directs
            tvaIntra: abonne.tvaIntra ?? '',
            temoinAsso: (abonne.temoinAsso ?? 0) === 1,
            reprise: abonne.reprise ?? ''
        },
        zod4(FiscaliteFormSchema),
        { id: 'fiscalite' }
    );
    //return { form };
    return { form, dateOuvert0: abonnement.dateOuvert0 };
};

export const actions: Actions = {
    update: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        const form = await superValidate(request, zod4(FiscaliteFormSchema), {
            id: 'fiscalite'
        });
        if (!form.valid) {
            return fail(400, { form });
        }
        const d = form.data;
        const statutDerived: StatutDerived = {
            typeActivite0: d.typeActivite0,
            dateDebActiv0: dateIsoVersJjMmAaaa(d.dateDebActiv0),
            statutFiscal0: d.statutFiscal0,
            declaTva0: d.declaTva0,
            impotIr0: d.impotIr0,
            // versLib0 : boolean du formulaire → string '1'/'0' pour le composite
            versLib0: d.versLib0 ? '1' : '0',
            facAnnul0: d.facAnnul0
        };
        await prisma.abonne.update({
            where: { id: locals.user.id },
            data: {
                statut: buildStatut(statutDerived),
                tvaIntra: d.tvaIntra,
                temoinAsso: d.temoinAsso ? 1 : 0,
                reprise: d.reprise,
                updatedAt: new Date()
            }
        });
        return message(form, 'Fiscalité mise à jour avec succès.');
    }
};