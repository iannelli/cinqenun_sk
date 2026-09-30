import { prisma } from '$lib/server/prisma';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseFrVal(val: unknown): number {
    if (val == null) return 0;
    return parseFloat(String(val).replace(',', '.')) || 0;
}

function formatFrVal(val: number): string {
    return val.toFixed(2).replace('.', ',');
}

// --- Recalcul complet des Montants de l'Affaire à partir de ses Factures ---
// Appelée avant runStatutAffaireActive() dans : createFacture, createFactureAcompteRecette,
// validerFacture, updateFacture (d'un Devis uniquement), annulationFacture, et deleteFacture (suppression d'un Devis uniquement)
export  async function recalculerMontantsAffaire(affaireId: number, abonneId: number): Promise<void> {
    // 1 — Initialisation des cumuls
    let somMontFac     = 0;
    let somMontRegl    = 0;
    let somMontCli     = 0;
    let somImputCreCli = 0;
    let somMontPena    = 0;
    // 2 — Lecture des Factures de l'Affaire
    const facturesRaw = await prisma.facture.findMany({
        where: { affaireId, abonneId },
        select: {
            codeType: true, refFac: true, refDevis: true, refPre: true,
            statutCode: true, totTtc: true, imputCreCli: true,
            totRegl: true, montCli: true, soldePenalite: true,
        },
    });
    const statutsFactureValidee = [21, 22, 23, 24, 25, 26, 27, 28];
    type ObjFacture = {
        codeType: number; refFac: string; refDevis: string; refPre: string; statutCode: number;
        totTtc: number; imputCreCli: number; totRegl: number; montCli: number; soldePenalite: number;
    };
    // 2.2 — Filtre + 2.3 — Tri décroissant sur codeType
    const facturesTriees: ObjFacture[] = facturesRaw
        .filter(f =>
            f.codeType === 10 ||                                                     // Devis
            (f.codeType === 20 && f.statutCode === 21) ||                            // Facture d'Acompte non annulée
            (f.codeType === 30 && statutsFactureValidee.includes(f.statutCode ?? 0)) // Facture validée
        )
        .map(f => ({
            codeType:      f.codeType,
            refFac:        f.refFac,
            refDevis:      f.refDevis   ?? '',
            refPre:        f.refPre     ?? '',
            statutCode:    f.statutCode ?? 0,
            totTtc:        parseFrVal(f.totTtc),
            imputCreCli:   parseFrVal(f.imputCreCli),
            totRegl:       parseFrVal(f.totRegl),
            montCli:       parseFrVal(f.montCli),
            soldePenalite: parseFrVal(f.soldePenalite),
        }))
        .sort((a, b) => b.codeType - a.codeType);
    // 3 — Suppression du Devis correspondant à une Facture Validée issue de lui
    for (const obj30 of facturesTriees.filter(o => o.codeType === 30)) {
        const indDevis = facturesTriees.findIndex(o => o.codeType === 10 && o.refFac === obj30.refDevis);
        if (indDevis !== -1) facturesTriees.splice(indDevis, 1);
    }
   // 4 — Cumuls
    for (const obj of facturesTriees) {
        if (obj.codeType === 20) {
            // Facture d'Acompte : cumuler totTtc seulement si le Devis lié n'existe pas dans la liste
            const devisLie = facturesTriees.find(o => o.codeType === 10 && o.refFac === obj.refDevis);
            if (!devisLie) somMontFac += obj.totTtc;
        } else {
            somMontFac += obj.totTtc;  // Devis + Factures validées
        }
        somMontRegl    += obj.totRegl;
        somMontCli     += obj.montCli;
        somImputCreCli += obj.imputCreCli;
        somMontPena    += obj.soldePenalite;
    }
    // 5 — Mise à jour de l'Affaire
    const montSolde = (somMontFac + somMontPena) - (somImputCreCli + somMontRegl);
    await prisma.affaire.update({
        where: { id: affaireId },
        data: {
            montFac:     formatFrVal(somMontFac),
            montRegl:    formatFrVal(somMontRegl),
            montCli:     formatFrVal(somMontCli),
            imputCreCli: formatFrVal(somImputCreCli),
            montPena:    formatFrVal(somMontPena),
            montSolde:   formatFrVal(montSolde),
        },
    });
}