import type { PageServerLoad, Actions }      from './$types';
import { prisma }                            from '$lib/server/prisma';
import type { Prisma }                       from '@prisma/client';
import { type RequestEvent, fail, redirect } from '@sveltejs/kit';
import { superValidate, message }            from 'sveltekit-superforms';
import { zod4 }                              from 'sveltekit-superforms/adapters';
import { ABONNE_SELECT, convertAbonneRawToAbonne, type Abonne }          from '$lib/schemas/abonne';
import { AffaireFormSchema, AFFAIRE_SELECT, convertAffaireRawToAffaire } from '$lib/schemas/affaire';
import { ClientFormSchema }                                              from '$lib/schemas/client';
import { updateAffaireLogic, deleteAffaireLogic, updateNbrMontAffaire, resolveLibClient } from '$lib/server/affaireActions';

// =============================================================================
// HELPERS
// ========
function requireUser(locals: App.Locals) {
    if (!locals.user) throw redirect(302, '/login');
    return locals.user;
}

// =============================================================================
// LOAD
// ======
export const load: PageServerLoad = async ({ locals, parent, depends }) => {
    depends('app:affaires');   // invalidate('app:affaires') apres create/update/delete affaire
    const user = requireUser(locals);
    const { clients } = await parent();   // depuis le layout, plus besoin de requeter
    const clientCreateForm = await superValidate(zod4(ClientFormSchema));
    const [abonneRaw, affaires, createForm] = await Promise.all([
        prisma.abonne.findUniqueOrThrow({
            where:  { id: user.id },
            select: ABONNE_SELECT
        }),
        prisma.affaire.findMany({
            where:   { abonneId: user.id, archived: 0 },
            orderBy: { createdAt: 'asc' },
            select:  AFFAIRE_SELECT
        }),
        superValidate(zod4(AffaireFormSchema))
    ]);
    return {
        abonne:     convertAbonneRawToAbonne(abonneRaw) as Abonne,
        affaires:   affaires.map(convertAffaireRawToAffaire),
        createForm,
        clients,
        clientCreateForm
    };
};

// =============================================================================
// ACTIONS Autres ...
// ==================
export const actions: Actions = {
    // ──── Création d'une Affaire ────────────────────────────────────────────────────────────
    create: async ({ request, locals }) => {
        const user = requireUser(locals);
        const form = await superValidate(request, zod4(AffaireFormSchema));
        if (!form.valid) return fail(400, { form });
        const libClient = await resolveLibClient(form.data.clientId, user.id);
        if (!libClient) {
            return message(form, 'Client introuvable ou non autorise.', { status: 400 });
        }
        try {
            await prisma.affaire.create({
                data: {
                    libAffaire: form.data.libAffaire,
                    libClient,
                    situation:  '00x',
                    statutCode: 0,
                    statutLib:  "<mark style='background:gray;color:white'>Affaire a Initier",
                    suiviFac:   '0|0,00|0|0,00|0|0,00|0|0,00|0|0,00|0|0,00|0|0,00|0|0,00',
                    clientId:   form.data.clientId,
                    abonneId:   user.id,
                } as Prisma.AffaireUncheckedCreateInput
            });
            await updateNbrMontAffaire(user.id, +1, 0);
            const abonneRaw     = await prisma.abonne.findUniqueOrThrow({ where: { id: user.id }, select: { suiviFac: true } });
            const suiviFacParts = abonneRaw.suiviFac!.split('|');
            suiviFacParts[0]    = String(Math.max(0, parseInt(suiviFacParts[0] ?? '0') + 1));
            await prisma.abonne.update({
                where: { id: user.id },
                data:  { suiviFac: suiviFacParts.join('|') },
            });
        } catch (err) {
            console.error('[affaire/create]', err);
            return message(form, 'Erreur serveur lors de la Création.', { status: 500 });
        }
        return message(form, 'Affaire créée avec succès.');
    },
    // ──── Mise a jour d'une Affaire - (logique partagee avec affaire/[id]) ─────────────────────────────────────────
    update: async ({ request, locals }) => {
        const user      = requireUser(locals);
        const formData  = await request.formData();
        const form      = await superValidate(formData, zod4(AffaireFormSchema));
        if (!form.valid) return fail(400, { form });
        const affaireId = Number(formData.get('id'));
        const result    = await updateAffaireLogic(affaireId, user.id, form.data.libAffaire, form.data.clientId);
        if (!result.ok) return message(form, result.error, { status: result.status });
        return message(form, 'Affaire modifiée avec succès.');
    },
    // ──── Suppression d'une Affaire - (logique partagee avec affaire/[id]) ─────────────────────────────────────────
    delete: async ({ request, locals }) => {
        const user      = requireUser(locals);
        const formData  = await request.formData();
        const affaireId = Number(formData.get('id'));
        const result    = await deleteAffaireLogic(affaireId, user.id);
        if (!result.ok) return fail(result.status, { error: result.error });

        return { success: true as const, action: 'delete' as const };
    },
    // ──── Vérification de la présenced'une Facture "Validée" dans l'Affaire considérée ───────────────────────────
    checkFacturesValidees: async ({ request, locals }: RequestEvent) => {
        const session = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd             = await request.formData();
        const affaireId      = parseInt(String(fd.get('affaireId')), 10);
        const factureValidee = await prisma.facture.findFirst({
            where: {
                affaireId,
                abonneId:   session.userId,
                statutCode: { in: [1, 2, 21, 22, 23, 24, 25, 26, 27, 28] },
            },
            select: { id: true },
        });
        return { success: true, hasFactureValidee: !!factureValidee };
    },
};