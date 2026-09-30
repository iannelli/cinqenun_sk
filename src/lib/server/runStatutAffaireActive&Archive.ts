import { prisma }                                                                                         from '$lib/server/prisma';
import { type Abonne, ABONNE_SELECT, convertAbonneRawToAbonne, parseNbrMontAffaire, buildNbrMontAffaire } from '$lib/schemas/abonne';
import { AFFAIRE_SELECT, convertAffaireRawToAffaire }                                                     from '$lib/schemas/affaire';
import { statutAffaireActive }                                                                            from '$lib/utils/statutAffaireActive';
import type { Facture }                                                                                   from '$lib/schemas/facture';
import { statutFacture } from '$lib/utils/statutFacture';

// ── Helpers ───────────────────────────────────────────────────────────────────
// ── 1. Mise à jour de affaire.suiviFac uniquement ─────────────────────────────
async function updateSuiviFac(
    affaireId:    number,
    suiviFacNew:  string,
): Promise<void> {
    await prisma.affaire.update({
        where: { id: affaireId },
        data:  { suiviFac: suiviFacNew },
    });
}

// ─── Mise à jour de abonne.suiviFac ──────────────────────────────────────────
export async function updateSuiviFacAbonne(
    abonneId:      number,
    suiviFacNew:   string | null,
    suiviFacAvant: string | null,
): Promise<void> {
    const newParts   = (suiviFacNew   ?? '').split('|');
    const avantParts = (suiviFacAvant ?? '').split('|');
    const nbSlots    = Math.max(newParts.length, avantParts.length);
    const suiviFacDiff: number[] = Array.from({ length: nbSlots }, (_, i) => {
        const newVal   = parseFloat((newParts[i]   ?? '0').replace(',', '.')) || 0;
        const avantVal = parseFloat((avantParts[i] ?? '0').replace(',', '.')) || 0;
        return newVal - avantVal;
    });
    const abonneRaw           = await prisma.abonne.findUniqueOrThrow({ where: { id: abonneId }, select: { suiviFac: true } });
    const abonneSuiviFacParts = abonneRaw.suiviFac!.split('|');
    suiviFacDiff.forEach((diff, i) => {
        const abonneIdx = i + 1;  // ← décalage +1 rétabli
        const actuel    = parseFloat((abonneSuiviFacParts[abonneIdx] ?? '0').replace(',', '.')) || 0;
        const result    = Math.max(0, actuel + diff);
        abonneSuiviFacParts[abonneIdx] = (abonneIdx <= 1 || abonneIdx % 2 !== 0)
            ? String(Math.round(result))           // index 0, 1 et impairs ≥ 3 → entiers
            : result.toFixed(2).replace('.', ','); // index pairs ≥ 2           → décimaux
    });
    // Reformatage des slots non parcourus
    for (let i = suiviFacDiff.length + 1; i < abonneSuiviFacParts.length; i++) {
        const actuel = parseFloat((abonneSuiviFacParts[i] ?? '0').replace(',', '.')) || 0;
        abonneSuiviFacParts[i] = (i <= 1 || i % 2 !== 0)
            ? String(Math.round(actuel))
            : actuel.toFixed(2).replace('.', ',');
    }
    await prisma.abonne.update({
        where: { id: abonneId },
        data:  { suiviFac: abonneSuiviFacParts.join('|') },
    });
}

async function updateNbrMontAffaireComplet(abonneId: number, affaireId: number, situationAvant: string | null, montSoldAvant: number): Promise<void> {
    const situationIndexMap: Record<string, number> = { '00x':0, '10x':1, '20x':2, '30x':4, '11a':6, '11b':8, '31a':10, '31b':12 };
    const situationsSansMontant = new Set([0, 1]); // '00x' et '10x'
    const abonneNbr    = await prisma.abonne.findUniqueOrThrow({ where: { id: abonneId }, select: { nbrMontAffaire: true } });
    const nbrMontArray = parseNbrMontAffaire(abonneNbr.nbrMontAffaire);
    const indAvant = situationIndexMap[situationAvant ?? ''];
    if (indAvant !== undefined) {
        nbrMontArray[indAvant] = Math.max(0, nbrMontArray[indAvant] - 1);
        if (!situationsSansMontant.has(indAvant)) {
            nbrMontArray[indAvant + 1] = Math.max(0, nbrMontArray[indAvant + 1] - montSoldAvant);
        }
    }
    const nouvelleAffaire   = await prisma.affaire.findUniqueOrThrow({ where: { id: affaireId }, select: { situation: true, montSolde: true } });
    const nouvelleSituation = nouvelleAffaire.situation ?? '';
    const nouvMontSolde     = parseFloat(String(nouvelleAffaire.montSolde ?? '0').replace(',', '.')) || 0;
    const indApres = situationIndexMap[nouvelleSituation];
    if (indApres !== undefined) {
        nbrMontArray[indApres] = nbrMontArray[indApres] + 1;
        if (!situationsSansMontant.has(indApres)) {
            nbrMontArray[indApres + 1] = nbrMontArray[indApres + 1] + nouvMontSolde;
        }
    }
    await prisma.abonne.update({ where: { id: abonneId }, data: { nbrMontAffaire: buildNbrMontAffaire(nbrMontArray) } });
}

// ── Traitement de toutes les Affaires au login ────────────────────
export async function runStatutAffairesToutes(userId: number): Promise<void> {
    // ── Chargement unique de l'abonné ─────────────────────────────────────────
    const abonneRaw = await prisma.abonne.findUnique({
        where:  { id: userId },
        select: ABONNE_SELECT,
    });
    if (!abonneRaw) return;
    const abonne       = convertAbonneRawToAbonne(abonneRaw);
    const nbrMontArray = parseNbrMontAffaire(abonneRaw.nbrMontAffaire);
    // ── Condition 1 : Affaires Actives : Lancer si somme des éléments 0+1+3+5 > 0 ────────────────────────────────────────
    const sommActive = (nbrMontArray[0] ?? 0) + (nbrMontArray[1] ?? 0)  + (nbrMontArray[3] ?? 0) + (nbrMontArray[5] ?? 0);
    if (sommActive > 0) {
        const affairesActives = await prisma.affaire.findMany({
            where: { abonneId: userId, archived: 0 },
        });
        await Promise.all(affairesActives.map(async (affaire) => {
            await runStatutAffaireActive(
                { userId },
                abonne,
                affaire.id,
                affaire.situation,
                parseFloat(String(affaire.montSolde ?? '0').replace(',', '.')) || 0,
                affaire.suiviFac,
            );
        }));
    }
    // ── Condition 2 : Affaires Archivées : Lancer si somme des éléments 7+9+11+13 > 0 ──────────────────────────────────────
    const sommArchive = (nbrMontArray[7]  ?? 0) + (nbrMontArray[9]  ?? 0) + (nbrMontArray[11] ?? 0) + (nbrMontArray[13] ?? 0);
    if (sommArchive > 0) {
        await runStatutAffaireArchive(userId, abonne);
    }
}

// ── Traitement des Affaire Actives ──────────────────────────────────────────────────────────────────
export async function runStatutAffaireActive(
    session:        { userId: number },
    abonne:         Abonne,  // ← paramètre ajouté
    affaireId:      number,
    situationAvant: string | null,
    montSoldAvant:  number,
    suiviFacAvant:  string | null
): Promise<void> {
    // ── Chargement de l'affaire et de ses factures (abonne déjà fourni) --------
    const [affaireRaw, facturesRaw] = await Promise.all([
        prisma.affaire.findFirst({
            where:  { id: affaireId, abonneId: session.userId, archived: 0 }, // ← actives uniquement
            select: AFFAIRE_SELECT,
        }),
        prisma.facture.findMany({
            where:   { affaireId, abonneId: session.userId },
            orderBy: { createdAt: 'asc' },
        }),
    ]);
    if (!affaireRaw) return;  // affaire introuvable ou archivée → ignorée
    const affaireConv = convertAffaireRawToAffaire(affaireRaw);
    const result      = statutAffaireActive(abonne, affaireConv, facturesRaw as unknown as Facture[]);
    if (result.facturesToUpdate.length > 0) {
        await Promise.all(
            result.facturesToUpdate.map((fac: { id: number; statutCode: number; statut: string }) =>
                prisma.facture.update({ where: { id: fac.id }, data: { statutCode: fac.statutCode, statut: fac.statut } })
            )
        );
    }
    if (result.action === 'delete') {
        await prisma.affaire.delete({ where: { id: affaireId } });
        const situationIndexMap: Record<string, number> = { '00x':0, '10x':1, '20x':3, '30x':5, '11a':7, '11b':9, '31a':11, '31b':13 };
        const nbrMontArray = parseNbrMontAffaire(abonne.nbrMontAffaire);
        const ind          = situationIndexMap[situationAvant ?? ''];
        if (ind !== undefined) {
            nbrMontArray[ind]     = Math.max(0, nbrMontArray[ind] - 1);
            nbrMontArray[ind + 1] = Math.max(0, nbrMontArray[ind + 1] - montSoldAvant);
        }
        await prisma.abonne.update({
            where: { id: session.userId },
            data:  { nbrMontAffaire: buildNbrMontAffaire(nbrMontArray) },
        });
        return;
    }
    if (result.affaireData) {
        await prisma.affaire.update({
            where: { id: affaireId },
            data: {
                statutCode: result.affaireData.statutCode,
                statutLib:  result.affaireData.statutLib,
                situation:  result.affaireData.situation,
                facValide:  result.affaireData.facValide,
                archived:   result.affaireData.archived,
            },
        });
    }
    const suiviFacNew = result.affaireData?.suiviFac ?? null;
    if (suiviFacNew !== null) {
        await updateSuiviFac(affaireId, suiviFacNew);
        await updateSuiviFacAbonne(session.userId, suiviFacNew, suiviFacAvant);
        // ── Transition '00x' → '10x' : décrémenter abonne.suiviFac[0] ──────────
        if (situationAvant === '00x' && result.affaireData?.situation === '10x') {
            const abonneRaw     = await prisma.abonne.findUniqueOrThrow({ where: { id: session.userId }, select: { suiviFac: true } });
            const suiviFacParts = abonneRaw.suiviFac!.split('|');
            suiviFacParts[0]    = String(Math.max(0, parseInt(suiviFacParts[0] ?? '0') - 1));
            await prisma.abonne.update({
                where: { id: session.userId },
                data:  { suiviFac: suiviFacParts.join('|') },
            });
        }

        await updateNbrMontAffaireComplet(session.userId, affaireId, situationAvant, montSoldAvant);
    }
}

// ── Traitement des Affaires Archivées ────────────────────────────────────────────────────────────────────
export async function runStatutAffaireArchive(userId: number, abonne: Abonne): Promise<void> {
    const arrayNbrMontAffaire: Record<string, number> = { '00x':0, '10x':1, '20x':3, '30x':5, '11a':7, '11b':9, '31a':11, '31b':13 }; // Index spécifiques aux Affaires archivées pour II.3.1
    // Chargement des affaires archivées — '31b' exclues ------------------
    const affaires = await prisma.affaire.findMany({
        where: {
            abonneId: userId,
            archived: 1,
            NOT: { situation: '31b' },
        },
    });
    for (const affaire of affaires) {
        // ── II.2 — Initialisation -------------
        const affSituationAvant = affaire.situation;
        const affMontSoldAvant  = parseFloat(String(affaire.montSolde ?? '0').replace(',', '.')) || 0;
        const affSuiviFacAvant  = affaire.suiviFac;
        let   newAffSituation   = '';
        let   temoinSuprAffaire = 0;
        // Calcul du nombre de jours depuis la dernière mise à jour
        const today    = new Date(); today.setHours(0, 0, 0, 0);
        const updated  = new Date(affaire.updatedAt); updated.setHours(0, 0, 0, 0);
        const nbreJour = Math.ceil((today.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
        // ── II.3 — Détermination de la catégorie ---------------
        switch (affaire.situation) {
            case '11a': // Affaire non soldée — entre 3 et 6 mois
                if (nbreJour > 180 && nbreJour <= 270) {
                    newAffSituation = '11b';
                } else if (nbreJour > 270) {
                    if ((affaire.facValide ?? 0) == 0) temoinSuprAffaire = 1;
                }
                break;
            case '11b': // Affaire non soldée — entre 6 et 9 mois
                if (nbreJour > 270) {
                    if ((affaire.facValide ?? 0) == 0) temoinSuprAffaire = 1;
                }
                break;
            case '31a': // Affaire soldée — entre 3 et 6 mois
                if (nbreJour > 180) {
                    newAffSituation = '31b';
                }
                break;
        }
        // ── II.3.1 — Suppression de l'Affaire ---------------
        if (temoinSuprAffaire === 1) {
            // Mise à jour de abonne.nbrMontAffaire (abonne déjà disponible en paramètre, pas de requête supplémentaire)
            await prisma.facture.deleteMany({ where: { affaireId: affaire.id } });
            await prisma.affaire.delete({ where: { id: affaire.id } });
            // Décrémentation et mise à jour uniquement après suppression réussie
            const nbrMontArray = parseNbrMontAffaire(abonne.nbrMontAffaire);
            const ind          = arrayNbrMontAffaire[affSituationAvant ?? ''];
            if (ind !== undefined) {
                nbrMontArray[ind]     = Math.max(0, nbrMontArray[ind] - 1);
                nbrMontArray[ind + 1] = Math.max(0, nbrMontArray[ind + 1] - affMontSoldAvant);
            }
            const suiviFacParts = (abonne.suiviFac ?? '').split('|');
            const valIdx0       = parseFloat((suiviFacParts[0] ?? '0').replace(',', '.')) || 0;
            suiviFacParts[0]    = String(Math.max(0, Math.round(valIdx0 - 1)));
            await prisma.abonne.update({
                where: { id: userId },
                data: {
                    nbrMontAffaire: buildNbrMontAffaire(nbrMontArray),
                    suiviFac:       suiviFacParts.join('|'),
                },
            });
            continue; // FIN du traitement de cette affaire
        }
        // ── II.3.2 — Poursuite du traitement --------------------
        // Mise à jour de la situation si elle a évolué (31a → 31b)
        if (newAffSituation === '31b') {
            await prisma.affaire.update({
                where: { id: affaire.id },
                data:  { situation: '31b' },
            });
            continue; // 31b exclue du reste du traitement
        }
        // ── II.4 — Examen des documents si situation '11a' ou '11b' --------------
        if (affaire.situation === '11a' || affaire.situation === '11b') {
            const facturesRaw = await prisma.facture.findMany({
                where:   { affaireId: affaire.id, abonneId: userId },
                orderBy: { createdAt: 'asc' },
            });
            // Mise à jour du statut de chaque facture
            if (facturesRaw.length > 0) {
                await Promise.all(
                    facturesRaw.map(async (fac) => {
                        const facturePourStatut = { ...fac } as unknown as import('$lib/schemas/facture').Facture;
                        statutFacture(facturePourStatut);
                        if (facturePourStatut.statutCode !== fac.statutCode || facturePourStatut.statut !== fac.statut) {
                            await prisma.facture.update({
                                where: { id: fac.id },
                                data:  { statutCode: facturePourStatut.statutCode, statut: facturePourStatut.statut },
                            });
                        }
                    })
                );
            }
            // ── II.5 — Mise à jour de l'Affaire ---------------------
            const affaireRaw = await prisma.affaire.findFirst({
                where:  { id: affaire.id, abonneId: userId },
                select: AFFAIRE_SELECT,
            });
            if (!affaireRaw) continue;
            const affaireConv = convertAffaireRawToAffaire(affaireRaw);
            const factures    = facturesRaw as unknown as import('$lib/schemas/facture').Facture[];
            const result      = statutAffaireActive(abonne, affaireConv, factures);
            // II.5.1 — Mise à jour du statut de l'Affaire ------
            if (result.affaireData) {
                await prisma.affaire.update({
                    where: { id: affaire.id },
                    data: {
                        statutCode: result.affaireData.statutCode,
                        statutLib:  result.affaireData.statutLib,
                        situation:  newAffSituation || result.affaireData.situation,
                        facValide:  result.affaireData.facValide,
                    },
                });
            }
            // II.5.2 — Mise à jour de affaire.suiviFac et abonne.suiviFac ------
            const suiviFacNew = result.affaireData?.suiviFac ?? null;
            if (suiviFacNew !== null) {
                await updateSuiviFac(affaire.id, suiviFacNew);
                await updateSuiviFacAbonne(userId, suiviFacNew, affSuiviFacAvant);
                await updateNbrMontAffaireComplet(userId, affaire.id, affSituationAvant, affMontSoldAvant);
            }
        }
    }
}