import { prisma } from '$lib/server/prisma';
import {parseDebit, parseCredit, serializeDebit, serializeCredit, type DebitMouvement, type CreditMouvement, type Client} from '$lib/schemas/client';

// ─── Helpers format français ──────────────────────────────────────────────────
/** '1 234,56' → 1234.56 */
function parseFr(val: string): number {
    return parseFloat(val.replace(/\s/g, '').replace(',', '.')) || 0;
}
/** 1234.56 → '1 234,56' */
function formatFr(val: number): string {
    return val.toFixed(2).replace('.', ',');
}

// ─── Paramètres ───────────────────────────────────────────────────────────────
export interface DebitCreditParams {
    parOrigine:   'credit' | 'debit';
    parNature:    string;
    parDate:      string;
    parMontant:   string;
    parRefFac:    string;
    parAffaireId: number;
    parFacImput:  string;   // utilisé uniquement pour 'credit'
    client:       Client;
}

// ─── Fonction principale ──────────────────────────────────────────────────────
export async function debitCreditClient(p: DebitCreditParams): Promise<void> {
    if (p.parOrigine === 'credit') {
        await traitementCredit(p);
    } else {
        await traitementDebit(p);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// I – CRÉDIT
// ─────────────────────────────────────────────────────────────────────────────
async function traitementCredit(p: DebitCreditParams): Promise<void> {
    // I.2 – Création du nouveau mouvement
    const nouveauMouvement: CreditMouvement = {
        nature0:   p.parNature,
        date0:     p.parDate,
        montant0:  '+' + p.parMontant,
        facImput0: p.parFacImput,
    };
    // Désérialisation du champ credit
    const lignes = parseCredit(p.client.credit) ?? [];
    // I.3 – Recherche de l'occurrence dont refFac0 === parRefFac
    const idx = lignes.findIndex((l) => l.refFac0 === p.parRefFac);
    if (idx !== -1) {
        // I.3.1 – Occurrence trouvée : ajouter le mouvement
        lignes[idx].mouvements0.push(nouveauMouvement);
    } else {
        // I.3.2 – Occurrence non trouvée : créer une nouvelle ligne
        lignes.push({
            refFac0:     p.parRefFac,
            solde0:      '0,00',
            affaireId0:  p.parAffaireId,
            mouvements0: [nouveauMouvement],
        });
    }
    // I.3.3 – Recalculer solde0 de la ligne concernée
    const idxCourant = idx !== -1 ? idx : lignes.length - 1;
    const soldeLigne = lignes[idxCourant].mouvements0.reduce((acc, m) => {
        // montant0 peut être préfixé par '+'
        return acc + parseFr(m.montant0.replace(/^\+/, ''));
    }, 0);
    lignes[idxCourant].solde0 = formatFr(soldeLigne);
    // I.3.4 – Recalculer client.soldeCredit = Σ solde0 de toutes les lignes
    const soldeCredit = lignes.reduce((acc, l) => acc + parseFr(l.solde0), 0);
    // Mise à jour de l'occurrence dans la Table Client
    await prisma.client.update({
        where: { id: p.client.id },
        data: {
            credit:      serializeCredit(lignes),
            soldeCredit: formatFr(soldeCredit), // string 
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// II – DÉBIT
// ─────────────────────────────────────────────────────────────────────────────
async function traitementDebit(p: DebitCreditParams): Promise<void> {
    // II.2 – Création du nouveau mouvement
    const nouveauMouvement: DebitMouvement = {
        nature0:  p.parNature,
        date0:    p.parDate,
        montant0: '+' + p.parMontant,
    };
    // Désérialisation du champ debit
    const lignes = parseDebit(p.client.debit) ?? [];
    // II.3 – Recherche de l'occurrence dont refFac0 === parRefFac
    const idx = lignes.findIndex((l) => l.refFac0 === p.parRefFac);
    if (idx !== -1) {
        // II.3.1 – Occurrence trouvée : ajouter le mouvement
        lignes[idx].mouvements0.push(nouveauMouvement);
    } else {
        // II.3.2 – Occurrence non trouvée : créer une nouvelle ligne
        lignes.push({
            refFac0:     p.parRefFac,
            solde0:      '0,00',
            affaireId0:  p.parAffaireId,
            mouvements0: [nouveauMouvement],
        });
    }
    // II.3.3 – Recalculer solde0 de la ligne concernée
    const idxCourant = idx !== -1 ? idx : lignes.length - 1;
    const soldeLigne = lignes[idxCourant].mouvements0.reduce((acc, m) => {
        return acc + parseFr(m.montant0.replace(/^\+/, ''));
    }, 0);
    lignes[idxCourant].solde0 = formatFr(soldeLigne);
    // II.3.4 – Recalculer client.soldeDebit = Σ solde0 de toutes les lignes
    const soldeDebit = lignes.reduce((acc, l) => acc + parseFr(l.solde0), 0);
    // Mise à jour de l'occurrence dans la Table Client
    await prisma.client.update({
        where: { id: p.client.id },
        data:  {
            debit:      serializeDebit(lignes),
            soldeDebit: formatFr(soldeDebit),
        },
    });
}