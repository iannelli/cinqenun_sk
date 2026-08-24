import { error, fail, redirect }       from '@sveltejs/kit';
import type { RequestEvent }           from '@sveltejs/kit';
import { superValidate }               from 'sveltekit-superforms';
import { zod4 as zod }                 from 'sveltekit-superforms/adapters';
import { prisma }                      from '$lib/server/prisma';
import type { Prisma }                 from '@prisma/client';
import { ABONNE_SELECT, convertAbonneRawToAbonne, parseNbrMontAffaire, buildNbrMontAffaire } from '$lib/schemas/abonne';
import { AffaireFormSchema, AFFAIRE_SELECT, convertAffaireRawToAffaire }                     from '$lib/schemas/affaire';
import { updateAffaireLogic, deleteAffaireLogic }                                            from '$lib/server/affaireActions';
import { CLIENT_SELECT, convertClientRawToClient, type Client }                              from '$lib/schemas/client';
import { dateEcheanceSchema, parseTotal, type Total}                                         from '$lib/schemas/facture';
import { ventilTvaRowSchema }                                                                from '$lib/schemas/recette';
import { statutAffaireActive }         from '$lib/utils/statutAffaireActive';
import { statutFacture }               from '$lib/utils/statutFacture';
import { numberToFrStr, convert, dec } from '$lib/utils/format';
import { debitCreditClient }           from '$lib/utils/debitCreditClient';

// =============================================================================
// HELPERS
// =============================================================================
// --- Attribution du N° de facture définitif -------------------------
async function attribuerNumeroFacture(tx:Prisma.TransactionClient, abonneId:number): Promise<string> {
    const abo = await tx.abonne.findUnique({
        where:{ id:abonneId },
        select:{ anFact:true, numFact:true },
    });
    if (!abo) throw new Error('Abonné introuvable');
    const nouveauNum = (parseInt(abo.numFact ?? '0', 10) || 0) + 1;
    await tx.abonne.update({ where:{ id:abonneId }, data:{ numFact:String(nouveauNum) } });
    return String(abo.anFact ?? '') + '-' + convert(nouveauNum, 5);
}
// --- Liaison refPre entre "Facture brouillon" et Facture d'Acompte -------------
async function lierRefPre(factureId:number, factureRef:string, acompteId:number):Promise<void> {
    const acompte = await prisma.facture.findUnique({ where:{ id:acompteId }, select:{ refFac:true } });
    if (!acompte) return;
    await prisma.$transaction([
        prisma.facture.update({ where:{ id:factureId }, data:{ refPre:acompte.refFac } }),
        prisma.facture.update({ where:{ id:acompteId }, data:{ refPre:factureRef } }),
    ]);
}
// --- Lecture des montants Affaire + Facture -----------------------------------
async function getAffaireFactureMontants(affaireId:number, facture:{totTtc:string|number|null; totRegl:string|number|null; imputCreCli:string|number|null}) {
    const affaire = await prisma.affaire.findUniqueOrThrow({
        where: { id:affaireId },
        select:{ montFac:true, montRegl:true, montCli:true, montSolde:true, situation:true, suiviFac:true },
    });
    return {
        situationAvant: affaire.situation,
        montSoldAvant:  parseFloat(String(affaire.montSolde   ?? '0').replace(',', '.')) || 0,
        suiviFacAvant:  affaire.suiviFac,
        montFac:        parseFloat(String(affaire.montFac     ?? '0').replace(',', '.')) || 0,
        montRegl:       parseFloat(String(affaire.montRegl    ?? '0').replace(',', '.')) || 0,
        montCli:        parseFloat(String(affaire.montCli     ?? '0').replace(',', '.')) || 0,
        totTtc:         parseFloat(String(facture.totTtc      ?? '0').replace(',', '.')) || 0,
        totRegl:        parseFloat(String(facture.totRegl     ?? '0').replace(',', '.')) || 0,
        imputCreCli:    parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) || 0,
    };
}
// --- Détermination et Mise à jour (en BDD) de Affaire.statutCode et de Affaire.statut ----------
async function determinationStatutFacture(factureRaw:{id:number; codeType:number; refFac:string; statutCode:number|null; statut:string; dateEcheance:string|null; [key:string]:unknown}):Promise<void> {
    const facturePourStatut = { ...factureRaw } as unknown as import('$lib/schemas/facture').Facture;
    statutFacture(facturePourStatut);
    if (facturePourStatut.statutCode !== factureRaw.statutCode || facturePourStatut.statut !== factureRaw.statut || facturePourStatut.dateEcheance !== factureRaw.dateEcheance) {
        await prisma.facture.update({
            where:{ id:factureRaw.id },
            data:{ statutCode:facturePourStatut.statutCode, statut:facturePourStatut.statut, dateEcheance:facturePourStatut.dateEcheance ?? '' },
        });
    }
}
// --- Mise à jour de Affaire.suiviFac avec sa nouvelle valeur, puis répercute la différence sur Abonne.suiviFac ---------------------
async function updateSuiviFac(affaireId:number, abonneId:number, suiviFacNew:string, suiviFacAvant:string|null):Promise<void> {
    const suiviFacNewParts   = suiviFacNew.split('|');
    const suiviFacAvantParts = (suiviFacAvant ?? '').split('|');
    const nbSlots            = Math.max(suiviFacNewParts.length, suiviFacAvantParts.length);
    const suiviFacDiff: number[] = Array.from({ length: nbSlots }, (_, i) => {
        const newVal   = parseFloat((suiviFacNewParts[i]   ?? '0').replace(',', '.')) || 0;
        const avantVal = parseFloat((suiviFacAvantParts[i] ?? '0').replace(',', '.')) || 0;
        return newVal - avantVal;
    });
    const abonneRaw = await prisma.abonne.findUniqueOrThrow({ where:{ id:abonneId }, select:{ suiviFac:true } });
    const abonneSuiviFacParts = abonneRaw.suiviFac!.split('|');
    suiviFacDiff.forEach((diff, i) => {
        const abonneIdx = i + 1;
        const actuel    = parseFloat((abonneSuiviFacParts[abonneIdx] ?? '0').replace(',', '.')) || 0;
        const result    = Math.max(0, actuel + diff);
        abonneSuiviFacParts[abonneIdx] = abonneIdx % 2 === 0
            ? result.toFixed(2).replace('.', ',')
            : String(Math.round(result));
    });
    await Promise.all([
        prisma.affaire.update({ where:{ id:affaireId }, data:{ suiviFac:suiviFacNew } }),
        prisma.abonne.update({ where:{ id:abonneId },  data:{ suiviFac:abonneSuiviFacParts.join('|') } }),
    ]);
}
// --- Mise à jour de abonne.nbrMontAffaire -------------------------------------------------------------------------------
async function updateNbrMontAffaireComplet(abonneId:number, affaireId:number, situationAvant:string|null, montSoldAvant:number):Promise<void> {
    const situationIndexMap: Record<string, number> = {'00x':0, '10x':1, '20x':2, '30x':4, '11a':6, '11b':8, '31a':10, '31b':12};
    const abonneNbr    = await prisma.abonne.findUniqueOrThrow({ where:{ id:abonneId }, select:{ nbrMontAffaire:true } });
    const nbrMontArray = parseNbrMontAffaire(abonneNbr.nbrMontAffaire);
    const indAvant     = situationIndexMap[situationAvant ?? ''];
    if (indAvant !== undefined) {
        nbrMontArray[indAvant]     = Math.max(0, nbrMontArray[indAvant] - 1);
        nbrMontArray[indAvant + 1] = Math.max(0, nbrMontArray[indAvant + 1] - montSoldAvant);
    }
    const nouvelleAffaire   = await prisma.affaire.findUniqueOrThrow({ where:{ id:affaireId }, select:{ situation:true, montSolde:true } });
    const nouvelleSituation = nouvelleAffaire.situation ?? '';
    const nouvMontSolde     = parseFloat(String(nouvelleAffaire.montSolde ?? '0').replace(',', '.')) || 0;
    const indApres          = situationIndexMap[nouvelleSituation];
    if (indApres !== undefined) {
        nbrMontArray[indApres]     = nbrMontArray[indApres] + 1;
        nbrMontArray[indApres + 1] = nbrMontArray[indApres + 1] + nouvMontSolde;
    }
    await prisma.abonne.update({ where:{ id:abonneId }, data:{ nbrMontAffaire:buildNbrMontAffaire(nbrMontArray) } });
}
/* --- Actualisation (éventuelle) : du statut (facture.statutCode et facture.statut) de chaque Facture d’une Affaire ---------------------------------------------------------
                                    du statut de l'Affaire (affaire.statutCode et affaire.statutLib) et de affaire.suiviFac
                                    de abonne.suiviFac et de abonne.nbrMontAffaire */
async function runStatutAffaireActive( session:{ userId:number }, affaireId:number, situationAvant:string|null, montSoldAvant:number, suiviFacAvant:string|null):Promise<void> {
    const [abonneRaw, affaireRaw, facturesRaw] = await Promise.all([
        prisma.abonne.findUnique({ where:{ id:session.userId }, select:ABONNE_SELECT }),
        prisma.affaire.findFirst({ where:{ id:affaireId, abonneId:session.userId }, select:AFFAIRE_SELECT }),
        prisma.facture.findMany({ where:{ affaireId, abonneId:session.userId }, orderBy:{ createdAt:'asc' } }),
    ]);
    if (!abonneRaw || !affaireRaw) return;
    const abonneConv  = convertAbonneRawToAbonne(abonneRaw);
    const affaireConv = convertAffaireRawToAffaire(affaireRaw);
    const result      = statutAffaireActive( abonneConv, affaireConv, facturesRaw as unknown as import('$lib/schemas/facture').Facture[] );
    if (result.facturesToUpdate.length > 0) {
        await Promise.all(
            result.facturesToUpdate.map(fac => prisma.facture.update({ where:{ id:fac.id }, data:{ statutCode:fac.statutCode, statut:fac.statut } }))
        );
    }
    if (result.action === 'delete') { // ─── Si Suppression de l'affaire ──────────────────────────────────
        await prisma.affaire.delete({ where:{ id:affaireId } });
        return;
    }
    if (result.affaireData) { // ─── Mise à jour de affaire.statutCode / statutLib / situation / facValide / archived ──
        await prisma.affaire.update({
            where:{ id:affaireId },
            data:{ statutCode:result.affaireData.statutCode, statutLib:result.affaireData.statutLib,
                   situation: result.affaireData.situation, facValide:result.affaireData.facValide, archived:result.affaireData.archived,
            },
        });
    }
    const suiviFacNew = result.affaireData?.suiviFac ?? null;
    if (suiviFacNew !== null) {
        await updateSuiviFac(affaireId, session.userId, suiviFacNew, suiviFacAvant);
        await updateNbrMontAffaireComplet(session.userId, affaireId, situationAvant, montSoldAvant);
    }
}
// Détermination du Statut d'un Devis -------------
async function majStatutDevisEcheance(tx:Prisma.TransactionClient, devis:{id:number; dateEcheance:string|null}):Promise<void> {
    if (!devis.dateEcheance) return;
    const dateStr   = String(devis.dateEcheance).split('|')[0];
    const [j, m, a] = dateStr.split('/').map(Number);
    const dateEch   = new Date(a, m - 1, j);
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const echeance  = Math.ceil((dateEch.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const SEUILS    = [
        { test: (d: number) => d >  20,            couleur: '#66C909', base: 3 },
        { test: (d: number) => d >= 10 && d <= 20, couleur: '#FC9B05', base: 4 },
        { test: (d: number) => d >=  0 && d <  10, couleur: '#FC6A05', base: 5 },
        { test: (d: number) => d <   0,            couleur: '#FC1B05', base: 6 },
    ];
    const seuil = SEUILS.find(s => s.test(echeance));
    if (seuil) {
        await tx.facture.update({
            where: { id: devis.id },
            data:  { statutCode: seuil.base, statut: `<mark style='background:white;color:${seuil.couleur}'>Echéance <strong>${dateStr}` },
        });
    }
}

// =============================================================================
// LOAD
// =============================================================================
export async function load({ params, locals, depends, parent }:RequestEvent & {
    depends: (dep:string) => void;
    parent:  () => Promise<{ tarifs:unknown[]; clients:unknown[]; abonne:unknown; statutRaw:string }>;
}) {
    depends('app:affaire');
    const session = locals.session;
    if (!session) throw redirect(302, '/login');
    const affaireId = parseInt((params as Record<string, string>).id, 10);
    if (isNaN(affaireId)) throw error(400, 'Identifiant Affaire invalide');
    const affaireRaw = await prisma.affaire.findFirst({
        where:{ id:affaireId, abonneId:session.userId },
        select:AFFAIRE_SELECT,
    });
    if (!affaireRaw) throw error(404, 'Affaire introuvable');
    // Récuperation des données du layout (chargées une fois au démarrage)
    const { tarifs, clients, abonne, statutRaw } = await parent();
    // Requêtes spécifiques à cette Affaire
    const [facturesRaw, clientRaw, updateForm] = await Promise.all([
        prisma.facture.findMany({
            where:{ affaireId, abonneId: session.userId },
            orderBy:{ createdAt:'asc' },
            select:{ id:true, codeType:true, refFac:true, refDevis:true, refPre:true, client:true, statutCode:true, statut:true, regimeTva:true, dateEmis:true, typeDelai:true, delai:true,
                     dateEcheance:true, ligne:true, remTot:true, total:true, totTtc:true, acompTaux:true, acompMont:true, totPrestaHt:true, totVenteHt:true, dateRegl:true, imputCreCli:true,
                     totRegl:true, montCli:true, solde:true, penalite:true, soldePenalite:true, createdAt:true, clientId:true, abonneId:true },
        }),
        affaireRaw.clientId
            ? prisma.client.findUnique({ where:{ id:affaireRaw.clientId }, select:CLIENT_SELECT })
            : Promise.resolve(null),
        superValidate(
            { libAffaire:affaireRaw.libAffaire, clientId:affaireRaw.clientId },
            zod(AffaireFormSchema),
        ),
    ]);
    const affaire  = convertAffaireRawToAffaire(affaireRaw);
    const factures = facturesRaw.map(f => {
        const solde         = dec(f.solde);
        const montCli       = dec(f.montCli);
        const soldePenalite = dec(f.soldePenalite);
        return {
            ...f,
            totTtc:dec(f.totTtc), totRegl:dec(f.totRegl), montCli, solde, soldePenalite,
            soldeStr:numberToFrStr(solde), montCliStr:numberToFrStr(montCli), soldePenaliteStr:numberToFrStr(soldePenalite)
        };
    });
    const client = clientRaw ? convertClientRawToClient(clientRaw):null;
    const factureIds  = facturesRaw.map(f => f.id);
    const recettesRaw = await prisma.recette.findMany({
        where:{ abonneId:session.userId, factureId:{ in:factureIds } },
        orderBy:{ dateEmis:'desc' },
    });
    return {
        affaire, factures, tarifs, updateForm,
        clients:clients, client:client as Client | null,
        recettes:recettesRaw.map(r => ({ ...r })),
        statutRaw,
        abonne,
    };
}

export const actions = {
// =========================================================================
// ACTIONS PROPRES à une AFFAIRE
// =========================================================================
    // Mise à jour d'une Affaire ----------------------------------
    updateAffaire: async ({ request, locals, params }:RequestEvent) => {
        const session   = locals.session;
        if (!session) throw redirect(302, '/login');
        const form      = await superValidate(request, zod(AffaireFormSchema));
        if (!form.valid) return fail(400, { form });
        const affaireId = parseInt((params as Record<string, string>).id, 10);
        const result    = await updateAffaireLogic(affaireId, session.userId, form.data.libAffaire as string, form.data.clientId as number);
        if (!result.ok) return fail(result.status, { form, message:result.error });
        return { form };
    },
     // Suppression d'une Affaire ----------------------------------
    deleteAffaire: async ({ request, locals }:RequestEvent) => {
        const session   = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const affaireId = parseInt(String(fd.get('id')), 10);
        if (isNaN(affaireId)) return fail(400, { message: 'Identifiant invalide' });
        const result    = await deleteAffaireLogic(affaireId, session.userId);
        if (!result.ok) return fail(result.status, { message:result.error });
        return { success:true };
    },
    // Mise à jour du Statut d’une Affaire : Action appelée depuis "ModalFacture.svelte" contrairement à "runStatutAffaireActive" qui recalcule tout côté serveur--------------------
    saveStatutAffaire: async ({ request, locals, params }:RequestEvent) => {
        const session   = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const affaireId = parseInt((params as Record<string, string>).id, 10);
        const payload   = JSON.parse(String(fd.get('payload'))) as import('$lib/utils/statutAffaireActive').StatutAffaireActiveResult;
        if (payload.action === 'delete') {
            await Promise.all([
                prisma.facture.deleteMany({ where:{ affaireId } }),
                prisma.abonne.update({
                    where:{ id:session.userId },
                    data: { nbrMontAffaire:payload.abonneData.nbrMontAffaire, suiviFac:payload.abonneData.suiviFac },
                }),
            ]);
            await prisma.affaire.delete({ where:{ id:affaireId } });
            return { success:true, deleted:true };
        }
        await Promise.all([
            payload.affaireData
                ? prisma.affaire.update({
                    where:{ id:affaireId },
                    data:{ statutCode:payload.affaireData.statutCode, statutLib:payload.affaireData.statutLib,
                           situation:payload.affaireData.situation, suiviFac:payload.affaireData.suiviFac,
                           facValide:payload.affaireData.facValide, archived:payload.affaireData.archived ? 1 : 0,
                    },
                  })
                : Promise.resolve(),
            ...payload.facturesToUpdate.map(fac =>
                prisma.facture.update({ where:{ id:fac.id }, data:{ statutCode:fac.statutCode, statut:fac.statut } })
            ),
            prisma.abonne.update({
                where:{ id:session.userId },
                data:{ nbrMontAffaire:payload.abonneData.nbrMontAffaire, suiviFac:payload.abonneData.suiviFac },
            }),
        ]);
        return { success:true, deleted:false };
    },

// =========================================================================
// ACTIONS PROPRES à une FACTURE
// =========================================================================
    // Création d'un Devis ou d'une "Facture Brouillon" -------------------------
    createFacture: async ({ request, locals, params }:RequestEvent) => {
        const session = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const affaireId = parseInt((params as Record<string, string>).id, 10);
        const facture   = await prisma.facture.create({
            data:{
                codeType:      parseInt(String(fd.get('codeType')),   10),
                refFac:        String(fd.get('refFac')),
                refDevis:      fd.get('refDevis')      ? String(fd.get('refDevis'))                                : null,
                refPre:        fd.get('refPre') ? String(fd.get('refPre'))                                         : null,
                client:        fd.get('client')        ? String(fd.get('client'))                                  : null,
                statutCode: parseInt(String(fd.get('statutCode')), 10) || 0,
                statut:     fd.get('statut') ? String(fd.get('statut'))                                            : '',
                regimeTva:     fd.get('regimeTva')     ? String(fd.get('regimeTva'))                               : null,
                dateEmis:      new Date(String(fd.get('dateEmis'))),
                typeDelai:     parseInt(String(fd.get('typeDelai')),  10),
                delai:         parseInt(String(fd.get('delai')), 10) || 0,
                dateEcheance:  fd.get('dateEcheance')  ? String(fd.get('dateEcheance'))                            : '',
                ligne:         fd.get('ligne')         ? String(fd.get('ligne'))                                   : null,
                total:         fd.get('total')         ? String(fd.get('total'))                                   : null,
                remTot:        fd.get('remTot')        ? String(fd.get('remTot')).replace(',', '.')                : null,
                totTtc:        fd.get('totTtc')        ? String(fd.get('totTtc')).replace(',', '.')                : null,
                acompTaux:     fd.get('acompTaux')     ? parseFloat(String(fd.get('acompTaux')).replace(',', '.')) : null,
                totPrestaHt:   fd.get('totPrestaHt')   ? String(fd.get('totPrestaHt')).replace(',', '.')           : null,
                totVenteHt:    fd.get('totVenteHt')    ? String(fd.get('totVenteHt')).replace(',', '.')            : null,
                imputCreCli:   fd.get('imputCreCli')   ? String(fd.get('imputCreCli')).replace(',', '.')           : null,
                totRegl:       fd.get('totRegl')       ? String(fd.get('totRegl')).replace(',', '.')               : null,
                montCli:       fd.get('montCli')       ? String(fd.get('montCli')).replace(',', '.')               : null,
                solde:         fd.get('solde')         ? String(fd.get('solde')).replace(',', '.')                 : null,
                soldePenalite: fd.get('soldePenalite') ? String(fd.get('soldePenalite')).replace(',', '.')         : null,
                acompMont:     fd.get('acompMont')     ? String(fd.get('acompMont'))                               : null,
                affaire:       {connect:{id:affaireId}},
                clientId:       parseInt(String(fd.get('clientId')), 10),
                abonneId:       session.userId,
            },
        });
        // ─── Détermination du Statut ────────────────────────────────────
        await determinationStatutFacture(facture);

        // ─── Création d'un Devis ────────────────────────────────────────
        if (parseInt(String(fd.get('codeType')), 10) === 10) {
            const affaireRaw  = await prisma.affaire.findUnique({ where:{id:affaireId}, select:{devis:true} });
            const devisActuel = affaireRaw?.devis ?? '';
            const newDevis    = devisActuel ? devisActuel + '|' + String(fd.get('refFac')) : '|' + String(fd.get('refFac'));
            await prisma.affaire.update({ where:{id:affaireId}, data:{devis:newDevis}});
            const { situationAvant, montSoldAvant, suiviFacAvant } = await getAffaireFactureMontants(affaireId, facture);
            /* Actualisation (éventuelle) de facture.statutCode et facture.statut de chaque Facture de l'Affaire
                                          du statut de l'Affaire (affaire.statutCode et affaire.statutLib) et de affaire.suiviFac
                                          de abonne.suiviFac et de abonne.nbrMontAffaire */
            await runStatutAffaireActive(session, affaireId, situationAvant, montSoldAvant, suiviFacAvant);
        }
        
        // ─── Création d'une "Facture Brouillon" ────────────────────────────────────────
        if (parseInt(String(fd.get('codeType')), 10) === 30 && String(fd.get('refFac')).slice(0,2) === 'FB') {
            const refDevisFb = String(fd.get('refDevis') ?? '');
            // §I.2.1 - Si la Facture brouillon est en relation avec un Devis ---
            if (refDevisFb !== '') {
                const dev = await prisma.facture.findFirst({
                    where:  { affaireId, abonneId: session.userId, codeType: 10, refFac: refDevisFb },
                    select: { id: true, refFac: true, refDevis: true, statutCode: true, statut: true, acompTaux: true },
                });
                if (dev) {
                    if (dev.statutCode !== 20) {
                        const devisAvecAcompte = (Number(dev.acompTaux) || 0) > 0;
                        if (!devisAvecAcompte) {
                            await prisma.facture.update({ where: { id: dev.id }, data: { refDevis: facture.refFac } });
                        } else {
                            await prisma.facture.update({ where: { id: dev.id }, data: { refDevis: '' } });
                        }
                    }
                    if (dev.statutCode === 20) {
                        if (dev.statut.includes('Devis Acompte Réglé')) {
                            const fa = await prisma.facture.findFirst({
                                where:  { affaireId, abonneId: session.userId, codeType: 20, refFac: dev.refDevis ?? undefined },
                                select: { id: true, refPre: true },
                            });
                            if (fa && (fa.refPre === '' || fa.refPre === null)) {
                                await prisma.facture.update({ where: { id: fa.id }, data: { refPre: facture.refFac } });
                            }
                        }
                    }
                }
            }

            // ─── I.2.3 — Imputation d'un excédent d'encaissement ───────────────────────
            // Rappel : une Facture Brouillon possède toujours totRegl = 0 — seule l'imputation affecte le solde
            const montantImputerSaisi = parseFloat(String(fd.get('montantImputerSaisi') ?? '0').replace(',', '.')) || 0;
            if (montantImputerSaisi > 0) {
                const totTtcNum = parseFloat(String(facture.totTtc ?? '0').replace(',', '.')) || 0;
                const estImputationTotale = montantImputerSaisi >= totTtcNum;
                const imputCreCliFinal    = estImputationTotale ? totTtcNum : montantImputerSaisi;
                const soldeFinal          = estImputationTotale ? 0 : (totTtcNum - imputCreCliFinal);
                await prisma.facture.update({
                    where: { id: facture.id },
                    data: {
                        imputCreCli: imputCreCliFinal.toFixed(2).replace('.', ','),
                        solde:       soldeFinal.toFixed(2).replace('.', ','),
                    },
                });
                const rawClient = await prisma.client.findUniqueOrThrow({
                    where:  { id: facture.clientId },
                    select: CLIENT_SELECT,
                });
                await debitCreditClient({
                    parOrigine:   'credit',
                    parNature:    'imputation',
                    parDate:      new Date().toLocaleDateString('fr-FR'),
                    parMontant:   '-' + imputCreCliFinal.toFixed(2).replace('.', ','),
                    parRefFac:    facture.refFac,
                    parAffaireId: affaireId,
                    parFacImput:  '',
                    client:       convertClientRawToClient(rawClient),
                });
            }
            // ─── Actualisation unique du Statut Affaire, CA, nbrMontAffaire ────────────
            const { situationAvant, montSoldAvant, suiviFacAvant } = await getAffaireFactureMontants(affaireId, facture);
            await runStatutAffaireActive(session, affaireId, situationAvant, montSoldAvant, suiviFacAvant);
        }
    },

    // Création de la Facture d'Acompte et de la Recette correspondante ──────────────────────────────
    createFactureAcompteRecette: async ({ request, locals, params }:RequestEvent) => {
        const session   = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const affaireId = parseInt((params as Record<string, string>).id, 10);
        const refDevis  = fd.get('refDevis') ? String(fd.get('refDevis')):null;
        try {
            const txResult = await prisma.$transaction(async (tx) => {
                //Recherche du Devis concerné (si présent) ----
                const dev = refDevis ? await tx.facture.findFirst({
                        where: { affaireId, abonneId:session.userId, codeType:10, refFac:refDevis },
                        select:{ id:true, refFac:true, totTtc:true },
                    }) : null;
                // Création de la Facture d'Acompte (fa.refDevis = dev.refFac) -----
                const facture = await tx.facture.create({
                    data:{
                        codeType:      20,
                        refFac:        await attribuerNumeroFacture(tx, session.userId),
                        refDevis:      dev ? dev.refFac : refDevis,
                        client:        fd.get('client')        ? String(fd.get('client'))        : null,
                        statutCode:    21,
                        statut:        "<mark style='background:white;color:#0488fd'>Facture Acompte Réglée",
                        regimeTva:     fd.get('regimeTva')     ? String(fd.get('regimeTva'))     : null,
                        dateEmis:      new Date(String(fd.get('dateEmis'))),
                        typeDelai:     parseInt(String(fd.get('typeDelai')), 10) || 0,
                        delai:         parseInt(String(fd.get('delai')),     10) || 0,
                        dateEcheance:  fd.get('dateEcheance')  ? String(fd.get('dateEcheance'))  : '',
                        ligne:         fd.get('ligne')         ? String(fd.get('ligne'))         : null,
                        total:         fd.get('total')         ? String(fd.get('total'))         : null,
                        remTot:        fd.get('remTot')        ? String(fd.get('remTot')).replace(',', '.')        : null,
                        totTtc:        fd.get('totTtc')        ? String(fd.get('totTtc')).replace(',', '.')        : null,
                        totPrestaHt:   fd.get('totPrestaHt')   ? String(fd.get('totPrestaHt')).replace(',', '.')   : null,
                        totVenteHt:    fd.get('totVenteHt')    ? String(fd.get('totVenteHt')).replace(',', '.')    : null,
                        dateRegl:      new Date(String(fd.get('recDateRegl'))),
                        imputCreCli:   null,   // ← une Facture d'Acompte n'impute jamais de crédit client
                        totRegl:       fd.get('totRegl')       ? String(fd.get('totRegl')).replace(',', '.')       : null,
                        montCli:       fd.get('montCli')       ? String(fd.get('montCli')).replace(',', '.')       : null,
                        solde:         fd.get('solde')         ? String(fd.get('solde')).replace(',', '.')         : null,
                        soldePenalite: fd.get('soldePenalite') ? String(fd.get('soldePenalite')).replace(',', '.') : null,
                        acompTaux: null, acompMont: null, penalite: null,
                        affaire:  { connect: { id: affaireId } },
                        clientId: parseInt(String(fd.get('clientId')), 10),
                        abonneId: session.userId,
                    },
                });
                //Création de l'écriture de Recette ----
                const recette = await tx.recette.create({
                    data: {
                        dateEmis:     new Date(String(fd.get('recDateEmis'))),
                        dateRegl:     new Date(String(fd.get('recDateRegl'))),
                        refFac:       facture.refFac,
                        cliNom:       String(fd.get('cliNom')),
                        libelle:      String(fd.get('libelle')),
                        regimeTva:    fd.get('regimeTva') ? String(fd.get('regimeTva')) : null,
                        modeRegl:     String(fd.get('modeRegl')),
                        montRegl:     fd.get('montRegl')  ? String(fd.get('montRegl'))  : null,
                        montHt:       fd.get('montHt')    ? String(fd.get('montHt'))    : null,
                        ventilTva:    fd.get('ventilTva') ? String(fd.get('ventilTva')) : null,
                        montTva:      fd.get('montTva')   ? String(fd.get('montTva'))   : null,
                        montTtc:      fd.get('montTtc')   ? String(fd.get('montTtc'))   : null,
                        debours:      fd.get('debours')   ? String(fd.get('debours'))   : null,
                        penalite:     fd.get('penalite')  ? String(fd.get('penalite'))  : null,
                        nature:       String(fd.get('nature') ?? ''),
                        dateEcriture: new Date(),
                        factureId:    facture.id,
                        clientId:     parseInt(String(fd.get('clientId')), 10),
                        abonneId:     session.userId,
                    },
                });
                // Mise à jour du Devis concerné ----
                if (dev) {
                    await tx.facture.update({
                        where:{ id:dev.id },
                        data:{ refDevis:facture.refFac, // relation Devis ↔ Facture d'Acompte
                               statutCode:20,
                               statut:"<mark style='background:white;color:#0488fd'>Devis Acompte Réglé",
                        },
                    });
                }
                return { factureId:facture.id, recetteId:recette.id, refFac:facture.refFac, facture, dev };
            });
            // Mise à jour des montants de l'Affaire ----
            const affaireRaw = await prisma.affaire.findUniqueOrThrow({
                where:{ id:affaireId },
                select:{ montFac:true, montRegl:true, situation:true, suiviFac:true, montSolde:true },
            });
            const situationAvant = affaireRaw.situation;
            const suiviFacAvant  = affaireRaw.suiviFac;
            const montSoldAvant  = parseFloat(String(affaireRaw.montSolde ?? '0').replace(',', '.')) || 0;
            const montFacInit    = parseFloat(String(affaireRaw.montFac  ?? '0').replace(',', '.')) || 0;
            const montReglInit   = parseFloat(String(affaireRaw.montRegl ?? '0').replace(',', '.')) || 0;
            const devTotTtc      = txResult.dev ? parseFloat(String(txResult.dev.totTtc ?? '0').replace(',', '.')) || 0 : 0;
            const faTotRegl      = parseFloat(String(fd.get('totRegl') ?? '0').replace(',', '.')) || 0;
            const montFac        = montFacInit  + devTotTtc;   // affaire.montFac  += dev.totTtc
            const montRegl       = montReglInit + faTotRegl;   // affaire.montRegl += fa.totRegl
            const montSolde      = montFac - montRegl;
            await prisma.affaire.update({
                where:{ id:affaireId },
                data:{
                    montFac:   montFac.toFixed(2).replace('.', ','),
                    montRegl:  montRegl.toFixed(2).replace('.', ','),
                    montSolde: montSolde.toFixed(2).replace('.', ','),
                },
            });
            // Actualisation Statut Affaire, CA Affaire, CA Abonné, nbrMontAffaire -----
            await runStatutAffaireActive(session, affaireId, situationAvant, montSoldAvant, suiviFacAvant);
            return { success:true, factureId:txResult.factureId, recetteId:txResult.recetteId, refFac:txResult.refFac };
        } catch (err) {
            console.error('Erreur createFactureAcompteRecette:', err);
            return fail(500, { success: false, message: "Erreur lors de la Création de la Facture d'Acompte et de l'Encaissement." });
        }
    },

    // Validation d'une "Facture Brouillon" ──────────────────────────────
    validerFacture: async ({ request, locals, params }: RequestEvent) => {
        const session   = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const factureId = parseInt(String(fd.get('factureId')), 10);
        const affaireId = parseInt((params as Record<string, string>).id, 10);
        if (isNaN(factureId) || isNaN(affaireId)) return fail(400, { message: 'Identifiant invalide' });
        const facture = await prisma.facture.findFirst({
            where:  { id: factureId, abonneId: session.userId },
            select: {
                id:true, refFac:true, refDevis:true, dateEcheance:true,
                totTtc:true, totRegl:true, imputCreCli:true, solde:true,
                clientId:true, regimeTva:true, dateEmis:true, total:true,
            },
        });
        if (!facture) return fail(404, { message: "Facture introuvable" });
        if (!(facture.refFac ?? '').startsWith('FB')) return fail(400, { message: "Cette facture n'est pas une Facture Brouillon" });
        const [date0 = '', couleurHtml0 = ''] = String(facture.dateEcheance ?? '').split('|');
        const parsed = dateEcheanceSchema.safeParse({ date0, couleurHtml0 });
        if (!parsed.success) return fail(400, { message: "La date d'echéance est absente ou invalide" });
        const codeParCouleur: Record<string, number> = { '#66C909': 23, '#FC9B05': 24, '#FC6A05': 25, '#FC1B05': 26 };
        const statutCode = codeParCouleur[parsed.data.couleurHtml0];
        if (statutCode === undefined) return fail(400, { message: "Couleur d'echéance non reconnue" });
        const statut = `<mark style='background:white;color:${parsed.data.couleurHtml0}'>Facture Echéance <strong>${parsed.data.date0}`;
        const refFacBrouillon = facture.refFac;
        const imputCreCliVal  = parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) || 0;
        const soldeVal        = parseFloat(String(facture.solde       ?? '0').replace(',', '.')) || 0;
        let devTtc = 0;
        const refFac = await prisma.$transaction(async (tx) => {
            // ─── Attribution du numéro définitif + statut par défaut (échéance) ──
            const newRef = await attribuerNumeroFacture(tx, session.userId);
            await tx.facture.update({ where: { id: factureId }, data: { refFac: newRef, statutCode, statut } });
            // ─── III.3 — Imputation d'un excédent d'encaissement ────────────────
            if (imputCreCliVal > 0 && soldeVal === 0) {
                // III.3.2 — Solde entièrement soldé par l'imputation
                // I — Mise à jour du Statut
                await tx.facture.update({
                    where:{ id:factureId },
                    data:{ statutCode:21, statut:"<mark style='background:white;color:#0488fd'>Facture Réglée" },
                });
                const rawClient = await prisma.client.findUniqueOrThrow({
                    where:{ id:facture.clientId },
                    select: CLIENT_SELECT,
                });
                // II.1 — Lecture des lignes de totalisation de la Facture Brouillon
                const totalRows: Total | null = parseTotal(facture.total);
                const lignesTotal = totalRows
                    ? (Array.isArray(totalRows) ? totalRows : [totalRows])
                    : [];
                // II.2 — Construction de ventilTva et cumul de debours
                const ventilLignes: string[] = [];
                let deboursCumul = 0;
                for (const ligne of lignesTotal) {
                    // 1 — Vente ou Prestation (typeTotalisation0.slice(0,2) != '00')
                    if (ligne.typeTotalisation0.slice(0,2) !== '00') {
                        const tauxTva0    = ligne.typeTotalisation0.slice(0,4);
                        const baseHt0     = ligne.montHt0;
                        const montantTva0 = ligne.montTva0;
                        ventilLignes.push([tauxTva0, baseHt0, montantTva0].join('¤'));
                    }
                    // 2 — Débours (typeTotalisation0.slice(4,6) == '20')
                    if (ligne.typeTotalisation0.slice(4, 6) === '20') {
                        deboursCumul += parseFloat(String(ligne.montTtc0 ?? '0').replace(',', '.')) || 0;
                    }
                }
                const ventilTvaFinal = ventilLignes.length > 0 ? ventilLignes.join('|') : null;
                const deboursFinal   = deboursCumul > 0 ? deboursCumul.toFixed(2).replace('.', ',') : null;
                // 3 — Création de l'occurrence de Recette --------------
                await tx.recette.create({
                    data: {
                        dateEmis:     facture.dateEmis,
                        dateRegl:     new Date(),
                        refFac:       newRef,
                        cliNom:       rawClient.libClient ?? '',
                        libelle:      'Imputation Crédit Client',
                        regimeTva:    facture.regimeTva,
                        modeRegl:     'Imputation Crédit Client',
                        montRegl:     imputCreCliVal.toFixed(2).replace('.', ','),
                        montHt:       null,
                        ventilTva:    ventilTvaFinal,
                        montTva:      null,
                        montTtc:      imputCreCliVal.toFixed(2).replace('.', ','),
                        debours:      deboursFinal,
                        penalite:     null,
                        nature:       'imputation',
                        dateEcriture: new Date(),
                        factureId,
                        clientId:     facture.clientId,
                        abonneId:     session.userId,
                    },
                });
            }

            // ─── Si la "Facture Brouillon" est en relation avec un Devis ────────
            if (facture.refDevis) {
                const dev = await tx.facture.findFirst({
                    where:{ affaireId, abonneId:session.userId, codeType:10, refFac:facture.refDevis },
                    select:{ id:true, refFac:true, refDevis:true, statutCode:true, statut:true, totTtc:true, acompTaux:true },
                });
                if (dev) {
                    if (dev.statutCode !== 20) {
                        const devisAvecAcompte = (Number(dev.acompTaux) || 0) > 0;
                        if (!devisAvecAcompte) {
                            if (dev.refDevis === refFacBrouillon) {
                                await tx.facture.update({
                                    where:{ id:dev.id },
                                    data: { statutCode:20, statut:"<mark style='background:white;color:#0488fd'>Devis Signé", refDevis:newRef },
                                });
                            }
                        } else {
                            const fa = await tx.facture.findFirst({
                                where:{ affaireId, abonneId:session.userId, codeType:20, refFac:dev.refDevis ?? undefined },
                                select:{ id:true, refFac:true, refPre:true },
                            });
                            if (fa) {
                                if (fa.refPre === refFacBrouillon) {
                                    await tx.facture.update({ where:{ id:factureId }, data:{ refPre:fa.refFac } });
                                    await tx.facture.update({ where:{ id:fa.id }, data:{ refPre:newRef } });
                                }
                                await tx.facture.update({
                                    where:{ id:dev.id },
                                    data:{ statutCode:20, statut:"<mark style='background:white;color:#0488fd'>Devis Acompte Réglé" },
                                });
                            }
                        }
                    }
                    if (dev.statutCode === 20) {
                        if (dev.statut.includes('Devis Signé')) { /* aucune action */ }
                        if (dev.statut.includes('Devis Acompte Réglé')) {
                            const fa = await tx.facture.findFirst({
                                where:{ affaireId, abonneId:session.userId, codeType:20, refFac:dev.refDevis ?? undefined },
                                select:{ id:true, refFac:true, refPre:true },
                            });
                            if (fa && fa.refPre === refFacBrouillon) {
                                await tx.facture.update({ where:{ id:factureId }, data:{ refPre:fa.refFac } });
                                await tx.facture.update({ where:{ id:fa.id }, data:{ refPre:newRef } });
                                devTtc = parseFloat(String(dev.totTtc ?? '0').replace(',', '.')) || 0;
                            }
                        }
                    }
                }
            }
            return newRef;
        });
        // ─── III.4 — Mise à jour des montants de l'Affaire ──────────────────────
        const { situationAvant, montSoldAvant, suiviFacAvant, montFac:mF, montRegl:mR, montCli:mC, totTtc } = await getAffaireFactureMontants(affaireId, facture);
        const montFac = mF - devTtc + totTtc;   // relation Facture d'Acompte via devTtc (0 si aucune)
        let montCli = mC;
        let montSolde: number;
        if (imputCreCliVal > 0) {
            montCli   -= imputCreCliVal;
            montSolde  = montFac - mR - imputCreCliVal;
        } else {
            montSolde = montFac - mR;
        }
        await prisma.affaire.update({
            where: { id: affaireId },
            data: {
                montFac:   montFac.toFixed(2).replace('.', ','),
                montRegl:  mR.toFixed(2).replace('.', ','),        // aucune incidence
                montCli:   montCli.toFixed(2).replace('.', ','),
                montSolde: montSolde.toFixed(2).replace('.', ','),
            },
        });
        // ─── Actualisation Statut Affaire, CA Affaire, CA Abonné, nbrMontAffaire ──
        await runStatutAffaireActive(session, affaireId, situationAvant, montSoldAvant, suiviFacAvant);
        return { success:true, refFac };
    },

    // Annulation d'une Facture : ne Concerne que les "Factures d'Acompte" et les autres "Factures Validées"  ──────────────────────────────
    annulationFacture: async ({ request, locals, params }:RequestEvent) => {
        const session   = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const situation = JSON.parse(String(fd.get('situation') ?? '{}')) as
            | { type: 'acompte-simple' }
            | { type: 'acompte-avec-fb';         fbId:number }
            | { type: 'validee-simple' }
            | { type: 'validee-avec-facAcompte'; faId:number };
        const factureId = parseInt(String(fd.get('factureId')), 10);
        const affaireId = parseInt((params as Record<string, string>).id, 10);
        // ─── Lecture préalable (hors transaction) pour capturer l'état "avant" ──
        const factureLue = await prisma.facture.findFirst({
            where:{ id:factureId, abonneId:session.userId },
            select:{ id:true, codeType:true, refFac:true, refDevis:true, refPre:true, statutCode:true, totTtc:true, totRegl:true, imputCreCli:true, montCli:true, clientId:true },
        });
        if (!factureLue) return fail(404, { message:'Facture introuvable' });
        const { situationAvant, montSoldAvant, suiviFacAvant } = await getAffaireFactureMontants(affaireId, factureLue);
        let devTtc = 0;   // ← capturé uniquement pour §I.6 (Facture d'Acompte)
        // ─── Helper : recharge le Client à jour (le solde se cumule à chaque appel) ──
        async function getClientFrais(): Promise<Client> {
            const raw = await prisma.client.findUniqueOrThrow({
                where:  { id: factureLue!.clientId },
                select: CLIENT_SELECT,
            });
            return convertClientRawToClient(raw);
        }
        try {
            await prisma.$transaction(async (tx) => {
                const facture = await tx.facture.findFirst({ where:{ id:factureId, abonneId:session.userId } });
                if (!facture) throw new Error('Facture introuvable');
                // ─── §IV.3.1 / §IV.4.1 — Création de la Facture d'Avoir + Attribution du N° définitif ──
                const newRef = await attribuerNumeroFacture(tx, session.userId);
                await tx.facture.create({
                    data: {
                        codeType:40, refFac:newRef, refDevis:facture.refFac, refPre:facture.refFac, client:facture.client, statutCode:2,
                        statut:`<mark style='background:white;color:#FC1B05'>Facture d'Avoir</mark>`,
                        regimeTva:facture.regimeTva, dateEmis:new Date(), typeDelai:0, delai:0, dateEcheance:'',
                        ligne:facture.ligne, total:facture.total, remTot:facture.remTot,
                        totTtc:      facture.totTtc      ? String(-parseFloat(String(facture.totTtc)))      : null,
                        totPrestaHt: facture.totPrestaHt ? String(-parseFloat(String(facture.totPrestaHt))) : null,
                        totVenteHt:  facture.totVenteHt  ? String(-parseFloat(String(facture.totVenteHt)))  : null,
                        totRegl:null, montCli:null,
                        solde:facture.totTtc ? String(-parseFloat(String(facture.totTtc))) : null,
                        acompTaux:null, acompMont:null,
                        affaire: { connect: { id:affaireId } },
                        clientId:facture.clientId, abonneId:session.userId,
                    },
                });
                // ─── §IV.3.1 / §IV.4.1 — Mise à jour du statut de la facture annulée ──
                await tx.facture.update({
                    where:{ id:factureId },
                    data:{ statutCode:1, statut:`<mark style='background:white;color:#FC1B05'>Facture Annulée</mark>` },
                });

                // ─── §I.2 (toujours vrai pour une Facture d'Acompte) / §IV.4.2 (si réglée même partiellement, OU si imputCreCli soldé) ──
                //  §IV.3.2 / §IV.4.2.1 - Recette(s) de contre-passation
                const totRegl       = parseFloat(String(facture.totRegl    ?? '0').replace(',', '.')) || 0;
                const imputCreCliTx = parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) || 0;
                const soldeTx        = parseFloat(String(facture.solde       ?? '0').replace(',', '.')) || 0;
                if (totRegl > 0 || (imputCreCliTx > 0 && soldeTx === 0)) {
                    const recettesInitiales = await tx.recette.findMany({
                        where:   { factureId, abonneId: session.userId },
                        orderBy: { dateEcriture: 'asc' },
                    });
                    for (const recetteInitiale of recettesInitiales) {
                        let ventilTvaContrePassation: string | null = null;
                        if (recetteInitiale.ventilTva) {
                            try {
                                const rows = recetteInitiale.ventilTva.split('|').map((row) => {
                                    const cells      = row.split('¤');
                                    const parsed     = ventilTvaRowSchema.parse({ tauxTva0: cells[0] ?? '', baseHt0: cells[1] ?? '0,00', montantTva0: cells[2] ?? '0,00' });
                                    const baseHt     = parseFloat(parsed.baseHt0.replace(',', '.'))     || 0;
                                    const montantTva = parseFloat(parsed.montantTva0.replace(',', '.')) || 0;
                                    return [parsed.tauxTva0, (-baseHt).toFixed(2).replace('.', ','), (-montantTva).toFixed(2).replace('.', ',')].join('¤');
                                });
                                ventilTvaContrePassation = rows.join('|');
                            } catch { ventilTvaContrePassation = recetteInitiale.ventilTva; }
                        }
                        await tx.recette.create({
                            data: {
                                dateEmis: recetteInitiale.dateEmis, dateRegl: new Date(), refFac: facture.refFac,
                                cliNom: recetteInitiale.cliNom, libelle: 'Contre-passation ' + recetteInitiale.libelle,
                                regimeTva: recetteInitiale.regimeTva, modeRegl: recetteInitiale.modeRegl,
                                montRegl:  recetteInitiale.montRegl  ? String(-parseFloat(String(recetteInitiale.montRegl)))  : null,
                                montHt:    recetteInitiale.montHt    ? String(-parseFloat(String(recetteInitiale.montHt)))    : null,
                                ventilTva: ventilTvaContrePassation,
                                montTva:   recetteInitiale.montTva   ? String(-parseFloat(String(recetteInitiale.montTva)))   : null,
                                montTtc:   recetteInitiale.montTtc   ? String(-parseFloat(String(recetteInitiale.montTtc)))   : null,
                                debours: recetteInitiale.debours, penalite: null, nature: 'contre-passation',
                                dateEcriture: new Date(), factureId, clientId: recetteInitiale.clientId, abonneId: session.userId,
                            },
                        });
                    }
                }
                if (facture.codeType === 20) { // ═══ §IV.3 — Facture d'Acompte ═══════════════════════════════════
                    // ─── §IV.3.4 — Si imputée sur une Facture Brouillon : suppression de celle-ci ──
                    if (facture.refPre && facture.refPre !== '' && situation.type === 'acompte-avec-fb') {
                        await tx.facture.delete({ where:{ id:situation.fbId } });
                    }
                    // ─── §IV.3.5 — Recherche du Devis via fa.refDevis : maj statut + refDevis='' ──
                    const devis = await tx.facture.findFirst({
                        where:{ affaireId, abonneId:session.userId, codeType:10, refFac:facture.refDevis ?? undefined },
                        select:{ id:true, refFac:true, statutCode:true, statut:true, dateEcheance:true, totTtc:true },
                    });
                    if (devis) {
                        devTtc = parseFloat(String(devis.totTtc ?? '0').replace(',', '.')) || 0;   // ← utilisé en §I.6
                        await majStatutDevisEcheance(tx, devis);
                        await tx.facture.update({ where:{ id:devis.id }, data:{ refDevis:'' } });
                    }
                } else { // ═══ §IV.4 — Facture Validée (autre qu'une Facture d'Acompte) ═══════════════════════════════════
                    // ─── §IV.4.4 — Si en relation [fv.refDevis ≠ ''] ─────────────────
                    if (facture.refDevis && facture.refDevis !== '') {
                        if (situation.type === 'validee-avec-facAcompte') { // §IV.4.3.2 — la relation est une Facture d'Acompte(fa)
                            await tx.facture.update({ where:{ id:situation.faId }, data:{ refPre:'' } });
                        } else {// §IV.4.3.1 — la relation est un Devis (Devis Signé, sans acompte, statutCode == 20)
                            const dev = await tx.facture.findFirst({
                                where:{ affaireId, abonneId:session.userId, codeType:10, refFac:facture.refDevis },
                                select:{ id:true, refDevis:true, dateEcheance:true },
                            });
                            if (dev && dev.refDevis === facture.refFac) {
                                await tx.facture.update({ where:{ id:dev.id }, data:{ refDevis:'' } });
                                await majStatutDevisEcheance(tx, dev);
                            }
                        }
                    }
                    // ─── Recette 'Excédent' (si fv.montCli > 0) ────────────────────
                    const montCli = parseFloat(String(facture.montCli ?? '0').replace(',', '.')) || 0;
                    if (montCli > 0) {
                        await tx.recette.create({
                            data:{
                                dateEmis:new Date(), dateRegl:new Date(), refFac:facture.refFac, cliNom:'', libelle:'Excédent', regimeTva:null, modeRegl:'',
                                montRegl:String(montCli).replace('.', ','), montHt:null, ventilTva:null, montTva:null, montTtc:String(montCli).replace('.', ','),
                                debours:null, penalite:null, nature:'Excédent', dateEcriture:new Date(), factureId, clientId:facture.clientId, abonneId:session.userId,
                            },
                        });
                    }
                    // NOTE : les écritures de crédit (§II.2.2 et §II.4) sont déplacées hors transaction, plus bas
                }
            });
            // ─── §IV.3.3 / §IV.4.2.3 — Mise à Jour du Crédit du Compte du Client suite règlement annulé ──
            const totReglVal     = parseFloat(String(factureLue.totRegl     ?? '0').replace(',', '.')) || 0;
            const imputCreCliVal = parseFloat(String(factureLue.imputCreCli ?? '0').replace(',', '.')) || 0;
            if (totReglVal > 0) {
                await debitCreditClient({
                    parOrigine:   'credit',
                    parNature:    'annulation Facture',
                    parDate:      new Date().toLocaleDateString('fr-FR'),
                    parMontant:   String(totReglVal).replace('.', ','),
                    parRefFac:    factureLue.refFac,
                    parAffaireId: affaireId,
                    parFacImput:  '',
                    client:       await getClientFrais(),
                });
            }
            // ─── §IV.4.4  — Crédit sur imputCreCli (uniquement Facture Validée autre que Facture d'Acompte) ──
            if (factureLue.codeType !== 20) {
                if (imputCreCliVal > 0) {
                    await debitCreditClient({
                        parOrigine:   'credit',
                        parNature:    'annulation Facture',
                        parDate:      new Date().toLocaleDateString('fr-FR'),
                        parMontant:   String(imputCreCliVal).replace('.', ','),
                        parRefFac:    factureLue.refFac,
                        parAffaireId: affaireId,
                        parFacImput:  '',
                        client:       await getClientFrais(),
                    });
                }
            }
            // ─── §IV.4.6 / §IV.4.5 : Mise à jour des montants de l'Affaire (hors transaction) ──
            const affaireRaw = await prisma.affaire.findUniqueOrThrow({
                where:  { id: affaireId },
                select: { montFac: true, montRegl: true, montCli: true },
            });
            const montFacInit    = parseFloat(String(affaireRaw.montFac   ?? '0').replace(',', '.')) || 0;
            const montReglInit   = parseFloat(String(affaireRaw.montRegl  ?? '0').replace(',', '.')) || 0;
            const montCliInit    = parseFloat(String(affaireRaw.montCli   ?? '0').replace(',', '.')) || 0;
            const totTtc         = parseFloat(String(factureLue.totTtc      ?? '0').replace(',', '.')) || 0;
            const totRegl2       = parseFloat(String(factureLue.totRegl     ?? '0').replace(',', '.')) || 0;
            const imputCreCliFac = parseFloat(String(factureLue.imputCreCli ?? '0').replace(',', '.')) || 0;
            let montFac: number;
            let montRegl: number;
            let montCli   = montCliInit;
            let montSolde: number;
            if (factureLue.codeType === 20) {
                // §IV.3.6 — Facture d'Acompte
                montFac   = montFacInit - devTtc;
                montRegl  = montReglInit - totRegl2;
                montSolde = montFac - montRegl;
            } else {
                // §IV.4.6 — Facture Validée
                montFac  = montFacInit - totTtc;
                montRegl = montReglInit - totRegl2;
                if (imputCreCliFac > 0) {
                    montCli   = montCliInit + imputCreCliFac;
                    montSolde = montFac - montRegl - imputCreCliFac;
                } else {
                    montSolde = montFac - montRegl;
                }
            }
            await prisma.affaire.update({
                where: { id: affaireId },
                data: {
                    montFac:   montFac.toFixed(2).replace('.', ','),
                    montRegl:  montRegl.toFixed(2).replace('.', ','),
                    montCli:   montCli.toFixed(2).replace('.', ','),
                    montSolde: montSolde.toFixed(2).replace('.', ','),
                },
            });
            // ─── §IV.4.7 / §IV.4.6 — Actualisation Statut Affaire, CA, nbrMontAffaire ──
            await runStatutAffaireActive(session, affaireId, situationAvant, montSoldAvant, suiviFacAvant);
            return { success:true };
        } catch (err) {
            console.error('annulationFacture error:', err);
            return fail(500, { message: err instanceof Error ? err.message : "Erreur lors de l'Annulation" });
        }
    },

    // Uniquement pour les Devis et les "Factures Brouillon" ──────────────────────────────
    updateFacture: async ({ request, locals, params }: RequestEvent) => {
        const session   = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const factureId = parseInt(String(fd.get('factureId')), 10);
        const affaireId = parseInt((params as Record<string, string>).id, 10);
        if (isNaN(factureId)) return fail(400, { message: 'Identifiant Facture invalide' });
        const existing = await prisma.facture.findFirst({
            where:  { id: factureId, abonneId: session.userId },
            select: { id: true, codeType: true, refFac: true, imputCreCli: true, solde: true, clientId: true },
        });
        if (!existing) return fail(404, { message: 'Facture introuvable' });
        // ─── §II — Imputation d'un excédent d'encaissement (Facture Brouillon uniquement) ──
        const estFactureBrouillon = existing.codeType === 30 && existing.refFac.slice(0, 2) === 'FB';
        const montantImputerSaisi = parseFloat(String(fd.get('montantImputerSaisi') ?? '0').replace(',', '.')) || 0;
        let imputCreCliOverride: string | null = null;
        let soldeOverride: string | null = null;
        let deltaImputation = 0;
        if (estFactureBrouillon && montantImputerSaisi > 0) {
            const totTtcNum  = parseFloat(String(fd.get('totTtc')  ?? '0').replace(',', '.')) || 0;
            const totReglNum = parseFloat(String(fd.get('totRegl') ?? '0').replace(',', '.')) || 0;
            const soldeAvant  = totTtcNum - totReglNum;
            const estImputationTotale = montantImputerSaisi >= soldeAvant;
            const imputCreCliFinal = estImputationTotale ? soldeAvant : montantImputerSaisi;
            const soldeFinal       = estImputationTotale ? 0 : (totTtcNum - imputCreCliFinal - totReglNum);
            const imputCreCliAvant = parseFloat(String(existing.imputCreCli ?? '0').replace(',', '.')) || 0;
            deltaImputation = imputCreCliFinal - imputCreCliAvant;
            imputCreCliOverride = imputCreCliFinal.toFixed(2).replace('.', ',');
            soldeOverride       = soldeFinal.toFixed(2).replace('.', ',');
        }
        await prisma.facture.update({
            where: { id: factureId },
            data: {
                client:        fd.get('client')        ? String(fd.get('client'))                                  : null,
                regimeTva:     fd.get('regimeTva')     ? String(fd.get('regimeTva'))                               : null,
                typeDelai:     parseInt(String(fd.get('typeDelai')),  10),
                delai:         parseInt(String(fd.get('delai')),      10),
                dateEcheance:  fd.get('dateEcheance')  ? String(fd.get('dateEcheance'))                            : '',
                ligne:         fd.get('ligne')         ? String(fd.get('ligne'))                                   : null,
                total:         fd.get('total')         ? String(fd.get('total'))                                   : null,
                remTot:        fd.get('remTot')        ? String(fd.get('remTot')).replace(',', '.')                : null,
                totTtc:        fd.get('totTtc')        ? String(fd.get('totTtc')).replace(',', '.')                : null,
                acompTaux:     fd.get('acompTaux')     ? parseFloat(String(fd.get('acompTaux')).replace(',', '.')) : null,
                totPrestaHt:   fd.get('totPrestaHt')   ? String(fd.get('totPrestaHt')).replace(',', '.')           : null,
                totVenteHt:    fd.get('totVenteHt')    ? String(fd.get('totVenteHt')).replace(',', '.')            : null,
                imputCreCli:   imputCreCliOverride ?? (fd.get('imputCreCli') ? String(fd.get('imputCreCli')).replace(',', '.') : null),
                totRegl:       fd.get('totRegl')       ? String(fd.get('totRegl')).replace(',', '.')               : null,
                montCli:       fd.get('montCli')       ? String(fd.get('montCli')).replace(',', '.')               : null,
                solde:         soldeOverride ?? (fd.get('solde') ? String(fd.get('solde')).replace(',', '.') : null),
                soldePenalite: fd.get('soldePenalite') ? String(fd.get('soldePenalite')).replace(',', '.')         : null,
                acompMont:     fd.get('acompMont')     ? String(fd.get('acompMont'))                               : null,
            },
        });
        // ─── §II — Écriture de crédit uniquement (uniquement si delta non nul) ──
        if (estFactureBrouillon && montantImputerSaisi > 0 && deltaImputation !== 0) {
            const rawClient = await prisma.client.findUniqueOrThrow({
                where:  { id: existing.clientId },
                select: CLIENT_SELECT,
            });
            await debitCreditClient({
                parOrigine:   'credit',
                parNature:    'imputation',
                parDate:      new Date().toLocaleDateString('fr-FR'),
                parMontant:   (deltaImputation > 0 ? '-' : '+') + Math.abs(deltaImputation).toFixed(2).replace('.', ','),
                parRefFac:    existing.refFac,
                parAffaireId: affaireId,
                parFacImput:  '',
                client:       convertClientRawToClient(rawClient),
            });
        }
        // Recalcul du Statut après Modification
        const factureUpdated = await prisma.facture.findUnique({
            where:  { id: factureId },
            select: { id: true, codeType: true, refFac: true, statutCode: true, statut: true, dateEcheance: true },
        });
        if (factureUpdated) await determinationStatutFacture(factureUpdated);

        // Liaison refPre si Facture d'Acompte associée ------------------------------------
        const acompteId = parseInt(String(fd.get('acompteId') ?? '0'), 10);
        if (acompteId > 0) {
            const updated = await prisma.facture.findUnique({ where: { id: factureId }, select: { refFac: true } });
            if (updated?.refFac) await lierRefPre(factureId, updated.refFac, acompteId);
        }

        // Mises a jour suiviFac + nbrMontAffaire
        const affaireMontants = await getAffaireFactureMontants(affaireId, { totTtc: null, totRegl: null, imputCreCli: null });
        await runStatutAffaireActive(session, affaireId, affaireMontants.situationAvant, affaireMontants.montSoldAvant, affaireMontants.suiviFacAvant);

        return { success: true };
    },

    // Suppression Uniquement pour les Devis et les "Factures Brouillon"  ──────────────────────────────
    deleteFacture: async ({ request, locals }:RequestEvent) => {
        const session   = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const factureId = parseInt(String(fd.get('factureId')), 10);
        const affaireId = parseInt(String(fd.get('affaireId')), 10);
        const situation = JSON.parse(String(fd.get('situation') ?? '{}')) as
            | { type: 'devis-simple' }
            | { type: 'devis-seul';         fbId: number }
            | { type: 'devis-et-fb';        fbId: number }
            | { type: 'fb-simple' }
            | { type: 'fb-avec-devis';      devId: number }
            | { type: 'fb-avec-facAcompte'; faId: number };
        if (isNaN(factureId)) return fail(400, { message:'Identifiant Facture invalide' });
        const facture = await prisma.facture.findFirst({
            where:  { id: factureId, abonneId: session.userId },
            select: { id: true, codeType: true, statutCode: true, refFac: true },
        });
        if (!facture) return fail(404, { message:'Facture introuvable' });
        // ─── Garde-fou serveur : seuls Devis et Facture Brouillon sont supprimables ──
        const estDevis            = facture.codeType === 10;
        const estFactureBrouillon = facture.codeType === 30 && facture.refFac.slice(0, 2) === 'FB';
        if (!estDevis && !estFactureBrouillon) {
            return fail(422, { message:'Seuls un Devis ou une Facture Brouillon peuvent être supprimés' });
        }
        // ─── Capture de l'état "avant" ──────────────────────────────
        const { situationAvant, montSoldAvant, suiviFacAvant } = await getAffaireFactureMontants(affaireId, { totTtc:null, totRegl:null, imputCreCli:null });
        async function retirerDevisDeAffaire(refFac: string):Promise<void> {
            const affaireRaw  = await prisma.affaire.findUnique({ where:{ id:affaireId }, select:{ devis:true } });
            const devisActuel = affaireRaw?.devis ?? '';
            const newDevis    = devisActuel.split('|').filter(ref => ref !== refFac && ref !== '').join('|');
            await prisma.affaire.update({ where:{ id:affaireId }, data:{ devis:newDevis || null } });
        }
        switch (situation.type) {
            case 'devis-simple':
                await retirerDevisDeAffaire(facture.refFac);
                await prisma.facture.delete({ where:{ id:factureId } });
                break;
            case 'devis-seul':
                await retirerDevisDeAffaire(facture.refFac);
                await prisma.facture.update({ where:{ id:situation.fbId }, data:{ refDevis:'' } });
                await prisma.facture.delete({ where:{ id:factureId } });
                break;
            case 'devis-et-fb':
                await retirerDevisDeAffaire(facture.refFac);
                await prisma.facture.delete({ where:{ id:situation.fbId } });
                await prisma.facture.delete({ where:{ id:factureId } });
                break;
            case 'fb-simple':
                await prisma.facture.delete({ where:{ id:factureId } });
                break;
            case 'fb-avec-devis':
                await prisma.facture.update({ where:{ id:situation.devId }, data:{ refDevis:'' } });
                await prisma.facture.delete({ where:{ id:factureId } });
                break;
            case 'fb-avec-facAcompte':
                await prisma.facture.update({ where:{ id:situation.faId }, data:{ refPre:'' } });
                await prisma.facture.delete({ where:{ id:factureId } });
                break;
            default:
                return fail(400, { message:'Situation de suppression non reconnue' });
        };
        // ─── Actualisation Statut Affaire, CA, nbrMontAffaire ────────
        await runStatutAffaireActive(session, affaireId, situationAvant, montSoldAvant, suiviFacAvant);
        return { success:true };
    },

// =========================================================================
// ACTIONS PROPRES à une ECRITURE de RECETTE
// =========================================================================
    // Création d'une Ecriture de Recette -------------------------
    createRecette: async ({ request, locals }:RequestEvent) => {
        const session = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd      = await request.formData();
        const recette = await prisma.recette.create({
            data: {
                dateEmis:     new Date(String(fd.get('dateEmis'))),
                dateRegl:     new Date(String(fd.get('dateRegl'))),
                refFac:       String(fd.get('refFac')),
                cliNom:       String(fd.get('cliNom')),
                libelle:      String(fd.get('libelle')),
                regimeTva:    fd.get('regimeTva') ? String(fd.get('regimeTva')) : null,
                modeRegl:     String(fd.get('modeRegl')),
                montRegl:     fd.get('montRegl')  ? String(fd.get('montRegl'))  : null,
                montHt:       fd.get('montHt')    ? String(fd.get('montHt'))    : null,
                ventilTva:    fd.get('ventilTva') ? String(fd.get('ventilTva')) : null,
                montTva:      fd.get('montTva')   ? String(fd.get('montTva'))   : null,
                montTtc:      fd.get('montTtc')   ? String(fd.get('montTtc'))   : null,
                debours:      fd.get('debours')   ? String(fd.get('debours'))   : null,
                penalite:     fd.get('penalite')  ? String(fd.get('penalite'))  : null,
                nature:       String(fd.get('nature')),
                dateEcriture: new Date(),
                factureId:    parseInt(String(fd.get('factureId')), 10),
                clientId:     parseInt(String(fd.get('clientId')),  10),
                abonneId:     session.userId,
            },
        });
        return { success:true, recetteId:recette.id };
    },

// =========================================================================
// ACTIONS PROPRES à un TARIF
// =========================================================================
    // Création d’un Tarif ----------------------------------
    createTarif: async ({ request, locals }:RequestEvent) => {
        const session = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd      = await request.formData();
        const tarif   = await prisma.tarif.create({
            data: {
                motCle:    String(fd.get('motCle')),
                textHtml:  String(fd.get('textHtml') ?? ''),
                nature:    String(fd.get('nature')),
                unite:     String(fd.get('unite')),
                prixUnite: String(fd.get('prixUnite') ?? '0,00'),
                tauxTva:   String(fd.get('tauxTva')   ?? '0,00'),
                abonneId:  session.userId,
            },
        });
        // Après Création d'un Tarif : côté client appeler invalidate('app:tarifs')
        return { id:tarif.id };
    },
    // Modification d’un Tarif ----------------------------------
    updateTarif: async ({ request, locals }:RequestEvent) => {
        const session = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd      = await request.formData();
        const id      = parseInt(String(fd.get('id')), 10);
        await prisma.tarif.update({
            where:{ id },
            data:{
                textHtml:  String(fd.get('textHtml') ?? ''),
                nature:    String(fd.get('nature')),
                unite:     String(fd.get('unite')),
                prixUnite: String(fd.get('prixUnite') ?? '0,00'),
                tauxTva:   String(fd.get('tauxTva')   ?? '0,00'),
            },
        });
        // Après Modification d'un tarif : côté client appeler invalidate('app:tarifs')
        return { success:true };
    },
};