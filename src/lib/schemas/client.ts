import { z }           from 'zod';
import type { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Séparateurs
// ─────────────────────────────────────────────────────────────────────────────
const ROW_SEP         = '|';   // sépare les lignes facture
const CELL_SEP_DEBIT  = '*';   // sépare les éléments de stringArray0 dans debit
const CELL_SEP_CREDIT = '*';   // sépare les éléments de stringArray0 dans credit
const ELEM_SEP_DEBIT  = '¤';   // sépare les éléments d'une ligne debit (implicite, voir ci-dessous)
const ELEM_SEP_CREDIT = '#';   // sépare les éléments d'une ligne credit

// ─────────────────────────────────────────────────────────────────────────────
// Sélecteur Prisma
// ─────────────────────────────────────────────────────────────────────────────
export const CLIENT_SELECT = {
    id:          true,
    libClient:   true,
    temoinType:  true,
    adres:       true,
    adresCompl:  true,
    cp:          true,
    ville:       true,
    pays:        true,
    temoinCee:   true,
    temoinTva:   true,
    siren:       true,
    tvaIntra:    true,
    phone:       true,
    mail:        true,
    contNom:     true,
    contPhone:   true,
    contTexte:   true,
    debit:       true,
    credit:      true,
    soldeDebit:  true,
    soldeCredit: true,
} satisfies Prisma.ClientSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ClientRaw = Prisma.ClientGetPayload<{ select: typeof CLIENT_SELECT }>;
export type Client = Omit<ClientRaw, 'soldeDebit' | 'soldeCredit'> & {
    soldeDebit:  number | null;
    soldeCredit: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Champ `debit` — Stocké en ROW_SEP / éléments séparés par des '¤'
// Format base de données : refFac0¤solde0¤affaireId0¤stringArray0|...
// stringArray0 : groupes répétitifs de 3 [nature0, date0, montant0] séparés par '*' : nature0*date0*montant0*nature0*date0*montant0*...
// Exemple : FAC001¤150,00¤3¤20,0¤Facture*01/06/2026*150,00*Règlement*15/06/2026*75,00
// ─────────────────────────────────────────────────────────────────────────────
export const debitMouvementSchema = z.object({
    nature0:  z.string().default(''),
    date0:    z.string().default(''),
    montant0: z.string().default('0,00'),
});
export type DebitMouvement = z.infer<typeof debitMouvementSchema>;
export const debitLigneSchema = z.object({
    refFac0:     z.string().default(''),
    solde0:      z.string().default('0,00'),
    affaireId0:  z.number().int().default(0),
    mouvements0: z.array(debitMouvementSchema).default([]),
});
export type DebitLigne = z.infer<typeof debitLigneSchema>;
export type Debit = DebitLigne[];

/** Désérialise le champ `debit` */
export function parseDebit(raw: string | null | undefined): Debit | null {
    if (!raw) return null;
    try {
        const lignes = raw.split(ROW_SEP).filter(Boolean);
        return lignes.map((ligne) => {
            const cells = ligne.split(ELEM_SEP_DEBIT);
            // ── Désérialisation de stringArray0 ──────────────────────
            const rawMouvements = cells[4] ?? '';
            const parts         = rawMouvements.split(CELL_SEP_DEBIT).filter(Boolean);
            const mouvements: DebitMouvement[] = [];
            for (let i = 0; i + 2 < parts.length; i += 3) {
                mouvements.push(debitMouvementSchema.parse({
                    nature0:  parts[i]     ?? '',
                    date0:    parts[i + 1] ?? '',
                    montant0: parts[i + 2] ?? '0,00',
                }));
            }
            return debitLigneSchema.parse({
                refFac0:     cells[0] ?? '',
                solde0:      cells[1] ?? '0,00',
                affaireId0:  parseInt(cells[2] ?? '0', 10),
                mouvements0: mouvements,
            });
        });
    } catch {
        return null;
    }
}

/** Sérialise un Debit en chaîne pour stockage en base. */
export function serializeDebit(data: Debit): string {
    return data.map((ligne) => {
        const strArray = ligne.mouvements0
            .flatMap((m) => [m.nature0, m.date0, m.montant0])
            .join(CELL_SEP_DEBIT);
        return [
            ligne.refFac0,
            ligne.solde0,
            String(ligne.affaireId0),
            strArray,
        ].join(ELEM_SEP_DEBIT);
    }).join(ROW_SEP);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Champ `credit` — Stocké en ROW_SEP / éléments séparés par des '#'/
// Format base de données : refFac0#solde0#affaireId0#stringArray0|...
// stringArray0 : groupes répétitifs de 4 [nature0, date0, montant0, facImput0] séparés par '*' : nature0*date0*montant0*facImput0*nature0*date0*montant0*facImput0*...
// Exemple : FAC001#250,00#3#Règlement*15/06/2026*250,00*FAC002
// ─────────────────────────────────────────────────────────────────────────────
export const creditMouvementSchema = z.object({
    nature0:   z.string().default(''),
    date0:     z.string().default(''),
    montant0:  z.string().default('0,00'),
    facImput0: z.string().default(''),
});
export type CreditMouvement = z.infer<typeof creditMouvementSchema>;
export const creditLigneSchema = z.object({
    refFac0:     z.string().default(''),
    solde0:      z.string().default('0,00'),
    soldeRemb0:  z.string().default('0,00'),
    affaireId0:  z.number().int().default(0),
    mouvements0: z.array(creditMouvementSchema).default([]),
});
export type CreditLigne = z.infer<typeof creditLigneSchema>;
export type Credit = CreditLigne[];

/** Désérialise le champ `credit` */
export function parseCredit(raw: string | null | undefined): Credit | null {
    if (!raw) return null;
    try {
        const lignes = raw.split(ROW_SEP).filter(Boolean);
        return lignes.map((ligne) => {
            const cells = ligne.split(ELEM_SEP_CREDIT);
            // ── Désérialisation de stringArray0 ──────────────────────
            const rawMouvements = cells[4] ?? '';
            const parts = rawMouvements ? rawMouvements.split(CELL_SEP_CREDIT) : [];
            const mouvements: CreditMouvement[] = [];
            for (let i = 0; i + 3 < parts.length; i += 4) {
                mouvements.push(creditMouvementSchema.parse({
                    nature0:   parts[i]     ?? '',
                    date0:     parts[i + 1] ?? '',
                    montant0:  parts[i + 2] ?? '0,00',
                    facImput0: parts[i + 3] ?? '',
                }));
            }
            return creditLigneSchema.parse({
                refFac0:     cells[0] ?? '',
                solde0:      cells[1] ?? '0,00',
                soldeRemb0:  cells[2] ?? '0,00',
                affaireId0:  parseInt(cells[3] ?? '0', 10),
                mouvements0: mouvements,
            });
        });
    } catch {
        return null;
    }
}

/** Sérialise un Credit en chaîne pour stockage en base. */
export function serializeCredit(data: Credit): string {
    return data.map((ligne) => {
        const strArray = ligne.mouvements0
            .flatMap((m) => [m.nature0, m.date0, m.montant0, m.facImput0])
            .join(CELL_SEP_CREDIT);
        return [
            ligne.refFac0,
            ligne.solde0,
            ligne.soldeRemb0,
            String(ligne.affaireId0),
            strArray,
        ].join(ELEM_SEP_CREDIT);
    }).join(ROW_SEP);
}

// ─────────────────────────────────────────────────────────────────────────────
// Schéma Zod (utilisé par Superforms)
// ─────────────────────────────────────────────────────────────────────────────
export const ClientFormSchema = z.object({
    libClient:  z.string().min(1, 'Le nom du client est obligatoire.').max(255),
    temoinType: z.number().int().min(0).max(1).default(0),
    adres:      z.string().min(1, "L'adresse est obligatoire.").max(255),
    adresCompl: z.string().max(255).nullable().optional(),
    cp:         z.string().min(1, 'Le code postal est obligatoire.').max(5),
    ville:      z.string().min(1, 'La ville est obligatoire.').max(150),
    pays:       z.string().min(1, 'Le pays est obligatoire.').max(60),
    temoinCee:  z.number().int().min(0).max(1).default(0),
    temoinTva:  z.number().int().min(0).max(1).default(0),
    siren:      z.string().max(60).nullable().optional(),
    tvaIntra:   z.string().max(60).nullable().optional(),
    phone:      z.string().max(12).nullable().optional(),
    mail:       z.string().max(60).nullable().optional(),
    contNom:    z.string().max(60).nullable().optional(),
    contPhone:  z.string().max(12).nullable().optional(),
    contTexte:  z.string().nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Conversion Decimal → number
// ─────────────────────────────────────────────────────────────────────────────
function parseFrDecimal(val: unknown): number | null {
    if (val == null) return null;
    const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
}

export function convertClientRawToClient(raw: ClientRaw): Client {
    return {
        ...raw,
        soldeDebit:  parseFrDecimal(raw.soldeDebit),
        soldeCredit: parseFrDecimal(raw.soldeCredit),
    };
}