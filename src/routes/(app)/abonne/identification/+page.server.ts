import type { PageServerLoad, Actions } from './$types';
import { fail, redirect }               from '@sveltejs/kit';
import { superValidate, message }       from 'sveltekit-superforms';
import { zod4 }                         from 'sveltekit-superforms/adapters';
import { prisma }                       from '$lib/server/prisma';
import { type IdentiteDerived, type LogoTextDerived, IdentificationFormSchema, ABONNE_SELECT, parseIdentite, buildIdentite, parseLogoText, buildLogoText, validerSIREN } from '$lib/schemas/abonne';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(303, '/login');
    const abonne = await prisma.abonne.findUniqueOrThrow({
        where: { id: locals.user.id },
        select: {
            ...ABONNE_SELECT,
            logoData: true,
            logoMimeType: true
        }
    });
    const identite = parseIdentite(abonne.identite);
    const logoText = parseLogoText(abonne.logoText);
    const form = await superValidate(
        {
            ...identite,
            temoinLogo: abonne.temoinLogo ?? 0,
            ligne10:    logoText.ligne10,
            ligne20:    logoText.ligne20,
            urlWeb:     abonne.urlWeb ?? '',
            temoinCgv:  (abonne.temoinCgv ?? 0) === 1
        },
        zod4(IdentificationFormSchema),
        { id: 'identification' }
    );
    // Convertir logoData (Buffer) en base64 pour l'aperçu client
    let logoBase64: string | null = null;
    if (abonne.logoData && abonne.logoMimeType) {
        const buffer = Buffer.from(abonne.logoData);
        logoBase64   = `data:${abonne.logoMimeType};base64,${buffer.toString('base64')}`;
    }
    // Détecte le paramètre ?welcome pour la modale de bienvenue
    const welcomeParam = url.searchParams.get('welcome');
    const welcomeEmail = url.searchParams.get('e');
    const welcome = welcomeParam
        ? { email: welcomeEmail ? atob(welcomeEmail) : abonne.email }
        : null;
    return {
        form,
        initialSiren: identite.siren0,
        logoBase64,
        logoMimeType: abonne.logoMimeType ?? null,
        welcome
    };
};

export const actions: Actions = {
    // ─── ACTION PRINCIPALE (champs texte + identité) ─────────────
    update: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        const form = await superValidate(request, zod4(IdentificationFormSchema), {
            id: 'identification'
        });
        if (!form.valid) {
            return fail(400, { form });
        }
        const d = form.data;
        // ─── Contrôles SIREN ─────────────────────────────────────
        const abonneActuel = await prisma.abonne.findUniqueOrThrow({
            where: { id: locals.user.id },
            select: { identite: true }
        });
        const identiteActuelle = parseIdentite(abonneActuel.identite);
        const sirenExistant = identiteActuelle.siren0.trim();
        if (sirenExistant !== '') {
            if (d.siren0.replace(/\s+/g, '') !== sirenExistant.replace(/\s+/g, '')) {
                return message(form,
                    "Le N° Siren a déjà été saisi précédemment. Il ne peut être ni modifié, ni supprimé. Veuillez consulter l'assistance.",
                    { status: 400 }
                );
            }
        } else {
            const sirenResult = validerSIREN(d.siren0);
            if (!sirenResult.valid) {
                return message(form, sirenResult.message, { status: 400 });
            }
            const sirenCleaned = d.siren0.replace(/\s+/g, '');
            const doublon = await prisma.abonne.findFirst({
                where: {
                    id: { not: locals.user.id },
                    identite: { contains: sirenCleaned }
                },
                select: { id: true }
            });
            if (doublon) {
                return message(form, 'Numéro Siren déjà existant pour un autre Abonné.', { status: 400 });
            }
        }
        // ─── Enregistrement ──────────────────────────────────────
        const identiteDerived: IdentiteDerived = {
            raisonSociale0: d.raisonSociale0,
            adresse0: d.adresse0,
            adresseCompl0: d.adresseCompl0,
            cp0: d.cp0,
            ville0: d.ville0,
            nomPrenomContact0: d.nomPrenomContact0,
            telFixe0: d.telFixe0,
            telPortable0: d.telPortable0,
            siren0: d.siren0.replace(/\s+/g, ''),
            iban0: d.iban0,
            bic0: d.bic0
        };
        const logoTextDerived: LogoTextDerived = {
            ligne10: d.ligne10,
            ligne20: d.ligne20
        };
        // Récupérer le temoinLogo actuel avant update
        const current = await prisma.abonne.findUnique({
            where:  { id: locals.user.id },
            select: { temoinLogo: true, logoData: true },
        });
        await prisma.abonne.update({
            where: { id: locals.user.id },
            data: {
                identite:   buildIdentite(identiteDerived),
                // Garder temoinLogo à 1 si logoData existe
                temoinLogo: current?.logoData ? 1 : d.temoinLogo,
                logoText:   buildLogoText(logoTextDerived),
                urlWeb:     d.urlWeb,
                temoinCgv:  d.temoinCgv ? 1 : 0,
                updatedAt:  new Date()
            }
        });
        return message(form, 'Identification mise à jour avec succès.');
    },

    // ─── ACTION UPLOAD LOGO IMAGE ────────────────────────────────
    uploadLogo: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        const formData = await request.formData();
        const file = formData.get('logoFile') as File | null;
        if (!file || file.size === 0) {
            return fail(400, { logoError: 'Aucun fichier sélectionné.' });
        }
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            return fail(400, { logoError: 'Format non supporté. Utilisez JPG, JPEG ou PNG.' });
        }
        const maxSize = 500 * 1024;
        if (file.size > maxSize) {
            return fail(400, { logoError: 'Le fichier est trop volumineux (max 500 Ko).' });
        }
        const arrayBuffer = await file.arrayBuffer();
        let buffer: Buffer = Buffer.from(arrayBuffer);
        try {
            const { default: sharp } = await import('sharp');
            const metadata = await sharp(buffer).metadata();
            const w = metadata.width ?? 0;
            const h = metadata.height ?? 0;
            if (w > 600 || h > 160) {
                buffer = await sharp(buffer)
                .resize({
                    width: 600,
                    height: 160,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toBuffer();
            }
        } catch {
            // sharp non disponible
        }
        await prisma.abonne.update({
            where: { id: locals.user.id },
            data: {
                logoData: new Uint8Array(buffer),
                logoMimeType: file.type,
                temoinLogo: 1,
                updatedAt: new Date()
            }
        });
        return { logoSuccess: 'Logo mis à jour avec succès.' };
    }
};