import { redirect }                                         from '@sveltejs/kit';
import { prisma }                                           from '$lib/server/prisma';
import { statutAffaireActive }                              from '$lib/utils/statutAffaireActive';
import { toFactureComplete }                                from '$lib/schemas/facture';
import type { Facture }                                     from '$lib/schemas/facture';
import { ABONNE_SELECT, convertAbonneRawToAbonne, parseNbrMontAffaire, buildNbrMontAffaire } from '$lib/schemas/abonne';
import { TARIF_SELECT, convertTarifRawToTarif }             from '$lib/schemas/tarif';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ────────
// 1. Recherche d'une différence entre "suiviFacNew" et "suiviFacAvant" afin d'éviter une Maj inutile de affaire.suiviFac, abonne.suiviFac, abonne.nbrMontAffaire
function suiviFacEstDifferent(a:string | null, b:string | null): boolean {
    const partsA = (a ?? '').split('|');
    const partsB = (b ?? '').split('|');
    const nbSlots = Math.max(partsA.length, partsB.length);
    return Array.from({ length: nbSlots }, (_, i) => {
        const valA = parseFloat((partsA[i] ?? '0').replace(',', '.')) || 0;
        const valB = parseFloat((partsB[i] ?? '0').replace(',', '.')) || 0;
        return valA !== valB;
    }).some(Boolean);
}
// 2. Mises à jour de affaire.suiviFac et abonne.suiviFac
async function updateSuiviFac(
    affaireId:     number,
    abonneId:      number,
    suiviFacNew:   string,
    suiviFacAvant: string | null
): Promise<void> {
    // §-IV.3.2 – Calcul de suiviFacDifférence slot par slot
    const suiviFacNewParts   = suiviFacNew.split('|');
    const suiviFacAvantParts = (suiviFacAvant ?? '').split('|');
    const nbSlots = Math.max(suiviFacNewParts.length, suiviFacAvantParts.length);
    const suiviFacDiff: number[] = Array.from({ length: nbSlots }, (_, i) => {
        const newVal   = parseFloat((suiviFacNewParts[i]   ?? '0').replace(',', '.')) || 0;
        const avantVal = parseFloat((suiviFacAvantParts[i] ?? '0').replace(',', '.')) || 0;
        return newVal - avantVal;
    });
    // §-IV.3.3 – Additionner suiviFacDifférence à abonne.suiviFac (décalage +1)
    const abonneRaw = await prisma.abonne.findUniqueOrThrow({
        where:  { id:abonneId },
        select: { suiviFac:true }
    });
    const abonneSuiviFacParts = abonneRaw.suiviFac!.split('|');
    suiviFacDiff.forEach((diff, i) => {
        const abonneIdx = i + 1; // ← décalage +1
        const actuel    = parseFloat((abonneSuiviFacParts[abonneIdx] ?? '0').replace(',', '.')) || 0;
        const result    = Math.max(0, actuel + diff);
        abonneSuiviFacParts[abonneIdx] = abonneIdx % 2 === 0
            ? result.toFixed(2).replace('.', ',')
            : String(Math.round(result));
    });
    // §-IV.3.4 – Mises à jour en parallèle
    await Promise.all([
        prisma.affaire.update({
            where: { id:affaireId },
            data:  { suiviFac:suiviFacNew }
        }),
        prisma.abonne.update({
            where: { id:abonneId },
            data:  { suiviFac: abonneSuiviFacParts.join('|') }
        })
    ]);
}
// 3. – Mise à jour de abonne.nbrMontAffaire ───────────────
async function updateNbrMontAffaireComplet(
    abonneId:      number,
    affaireId:     number,
    situationAvant: string | null,
    montSoldAvant:  number
): Promise<void> {
    const situationIndexMap: Record<string, number> = {'00x':0,'10x':1, '20x':2, '30x':4, '11a':6, '11b':8, '31a':10, '31b':12};
    const abonneNbr = await prisma.abonne.findUniqueOrThrow({
        where:  { id: abonneId },
        select: { nbrMontAffaire: true }
    });
    const nbrMontArray = parseNbrMontAffaire(abonneNbr.nbrMontAffaire);
    // ── Décrémenter l'ancienne situation ─────────────────────────
    const indAvant = situationIndexMap[situationAvant ?? ''];
    if (indAvant !== undefined) {
        nbrMontArray[indAvant]     = Math.max(0, nbrMontArray[indAvant]     - 1);
        nbrMontArray[indAvant + 1] = Math.max(0, nbrMontArray[indAvant + 1] - montSoldAvant);
    }
    // ── Incrémenter la nouvelle situation ────────────────────────
    const nouvelleAffaire = await prisma.affaire.findUniqueOrThrow({
        where:  { id: affaireId },
        select: { situation: true, montSolde: true }
    });
    const nouvelleSituation = nouvelleAffaire.situation ?? '';
    const nouvMontSolde     = parseFloat(String(nouvelleAffaire.montSolde ?? '0').replace(',', '.')) || 0;
    const indApres = situationIndexMap[nouvelleSituation];
    if (indApres !== undefined) {
        nbrMontArray[indApres]     = nbrMontArray[indApres]     + 1;
        nbrMontArray[indApres + 1] = nbrMontArray[indApres + 1] + nouvMontSolde;
    }
    // ── Mise à jour en base ───────────────────────────────────────
    await prisma.abonne.update({
        where: { id:abonneId },
        data:  { nbrMontAffaire:buildNbrMontAffaire(nbrMontArray) }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────────────────────────────────────
export const load = async ({ locals, depends }) => {
    if (!locals.user) throw redirect(302, '/login');
    const userId = locals.user!.id;
    // ─── Dépendances invalidables à la demande ────────────────────
    depends('app:tarifs');    // invalidate('app:tarifs')  après modification d'un tarif
    depends('app:clients');   // invalidate('app:clients') après modification d'un client
    depends('app:abonne');    // invalidate('app:abonne')  après modification du statut fiscal
    // ─── Chargement initial : tarifs, clients, abonné ─────────────
    // Ces données changent rarement — chargées une fois au démarrage et mises à jour uniquement à l'initiative de l'utilisateur
    const [tarifsRaw, clientsRaw, abonneRaw] = await Promise.all([
        prisma.tarif.findMany({
            where:   { abonneId: userId },
            orderBy: { motCle: 'asc' },
            select:  TARIF_SELECT,
        }),
        prisma.client.findMany({
            where:   { abonneId: userId },
            select:  { id: true, libClient: true },
            orderBy: { libClient: 'asc' },
        }),
        prisma.abonne.findUniqueOrThrow({
            where:  { id: userId },
            select: ABONNE_SELECT,
        }),
    ]);
    const tarifs = tarifsRaw.map(convertTarifRawToTarif);
    const abonne = convertAbonneRawToAbonne(abonneRaw);
    // ─── Traitement des statuts des affaires actives ──────────────
    if (!locals.statutAffaireActiveDone) {
        locals.statutAffaireActiveDone = true;
        const affaires = await prisma.affaire.findMany({
            where: { abonneId: userId },
        });
        await Promise.all(affaires.map(async (affaire) => {
            const facturesRaw   = await prisma.facture.findMany({
                where: { affaireId: affaire.id },
            });
            const situationAvant = affaire.situation;
            const montSoldAvant  = parseFloat(String(affaire.montSolde ?? '0').replace(',', '.')) || 0;
            const suiviFacAvant  = affaire.suiviFac;
            const factures = facturesRaw.map(raw => toFactureComplete({
                ...raw,
                remTot:        raw.remTot        != null ? parseFloat(String(raw.remTot))        : null,
                totTtc:        raw.totTtc        != null ? parseFloat(String(raw.totTtc))        : null,
                totPrestaHt:   raw.totPrestaHt   != null ? parseFloat(String(raw.totPrestaHt))   : null,
                totVenteHt:    raw.totVenteHt    != null ? parseFloat(String(raw.totVenteHt))    : null,
                imputCreCli:   raw.imputCreCli   != null ? parseFloat(String(raw.imputCreCli))   : null,
                totRegl:       raw.totRegl       != null ? parseFloat(String(raw.totRegl))       : null,
                montCli:       raw.montCli       != null ? parseFloat(String(raw.montCli))       : null,
                solde:         raw.solde         != null ? parseFloat(String(raw.solde))         : null,
                soldePenalite: raw.soldePenalite != null ? parseFloat(String(raw.soldePenalite)) : null,
            })) as unknown as Facture[];
            // ── 1 - Affaire ACTIVE ────────────────────────────────
            if (affaire.archived == 0) {
                const result = statutAffaireActive(abonne, affaire, factures);
                if (result.action !== 'delete') {
                    const suiviFacNew = result.affaireData?.suiviFac ?? '';
                    if (suiviFacEstDifferent(suiviFacNew, suiviFacAvant)) {
                        await updateSuiviFac(affaire.id, userId, suiviFacNew, suiviFacAvant);
                        await updateNbrMontAffaireComplet(userId, affaire.id, situationAvant, montSoldAvant);
                    }
                }
            } else {
                // ── 2 - Affaire ARCHIVÉE ──────────────────────────
                // à compléter
            }
        }));
    }
    return {
        user:    locals.user,
        tarifs,                 // ← disponible dans toutes les pages via parent()
        clients: clientsRaw,    // ← disponible dans toutes les pages via parent()
        abonne,                 // ← disponible dans toutes les pages via parent()
        statutRaw: abonneRaw.statut ?? '',
    };
};