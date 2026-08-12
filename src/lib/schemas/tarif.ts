import type { Prisma } from '@prisma/client';

// ─── Sélecteur Prisma ────────────────────────────────────────────
export const TARIF_SELECT = {
    id:        true,
    motCle:    true,
    textHtml:  true,
    nature:    true,
    unite:     true,
    prixUnite: true,
    tauxTva:   true,
    abonneId:  true,
} satisfies Prisma.TarifSelect;

// ─── Types ───────────────────────────────────────────────────────
type TarifRaw = Prisma.TarifGetPayload<{ select: typeof TARIF_SELECT }>;
// Les champs Decimal (prixUnite, tauxTva) sont convertis en number
export type Tarif = Omit<TarifRaw, 'prixUnite' | 'tauxTva'> & {
    prixUnite: string;
    tauxTva:   string;
};

// ─── Conversion  ─────────────────────────────────
export function convertTarifRawToTarif(raw: TarifRaw): Tarif {
    return {
        ...raw,
        prixUnite: raw.prixUnite ?? '0,00',
        tauxTva:   raw.tauxTva   ?? '0,0',
    };
}