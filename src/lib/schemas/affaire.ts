import { z }           from 'zod';
import type { Prisma } from '@prisma/client';

// ─── Sélecteur Prisma ────────────────────────────────────────────
export const AFFAIRE_SELECT = {
    id:         true,
    libAffaire: true,
    libClient:  true,
    situation:  true,
    statutCode: true,
    statutLib:  true,
    devis:      true,
    facValide:  true,
    suiviFac:   true,
    montFac:    true,
    montRegl:   true,
    montCli:    true,
    montPena:   true,
    montSolde:  true,
    archived:   true,
    clientId:   true,
    abonneId:   true,
    createdAt:  true,
    updatedAt:  true,
} satisfies Prisma.AffaireSelect;

// ─── Schéma Zod (utilisé par Superforms – formulaire create/update) ──
export const AffaireFormSchema = z.object({
    libAffaire: z.string().min(1, "Le libellé de l'affaire est obligatoire."),
    clientId:   z.coerce
                    .number()
                    .int()
                    .min(1, 'Veuillez sélectionner un client.'),
});

// ─── Types ───────────────────────────────────────────────────────
type AffaireRaw = Prisma.AffaireGetPayload<{ select: typeof AFFAIRE_SELECT }>;

export type Affaire = Omit<AffaireRaw, 'montFac' | 'montRegl' | 'montCli' | 'montPena' | 'montSolde'> & {
    montFac:   string | null;
    montRegl:  string | null;
    montCli:   string | null;
    montPena:  string | null;
    montSolde: string | null;
};

export function convertAffaireRawToAffaire(raw: AffaireRaw): Affaire {
    function fmt(v: unknown): string | null {
        if (v === null || v === undefined) return null;
        // ← gérer string avec virgule OU point, ET Decimal Prisma
        const n = typeof v === 'string'
            ? parseFloat(v.replace(',', '.'))
            : Number(v);
        return isNaN(n) ? null : n.toFixed(2).replace('.', ',');
    }
    return {
        ...raw,
        montFac:   fmt(raw.montFac),
        montRegl:  fmt(raw.montRegl),
        montCli:   fmt(raw.montCli),
        montPena:  fmt(raw.montPena),
        montSolde: fmt(raw.montSolde),
    };
}

/** Désérialise affaire.suiviFac — Format : "nbr|mont|nbr|mont|..." (16 éléments) */
export function parseSuiviFacAffaire(suiviFac: string | null | undefined): string[] {
    if (!suiviFac) return Array(16).fill('0');
    const p = suiviFac.split('|');
    return Array.from({ length: 16 }, (_, i) => p[i] ?? '0');
}
/** Resérialise le tableau suiviFac en chaîne "|" pour stockage en base. */
export function buildSuiviFacAffaire(data: string[]): string {
    return data.join('|');
}
