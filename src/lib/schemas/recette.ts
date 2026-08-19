import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Séparateurs (cohérence avec facture.ts)
// ─────────────────────────────────────────────────────────────────────────────
const CELL_SEP = '¤';
const ROW_SEP  = '|';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Type principal Recette (forme retournée par le select Prisma)
// ─────────────────────────────────────────────────────────────────────────────
export type Recette = {
    id:           number;
    dateEmis:     Date;
    dateRegl:     Date | null;
    refFac:       string;
    cliNom:       string;
    libelle:      string;
    regimeTva:    string | null;   // 'A'=Non Assujetti | 'B'=Avec TVA | 'C' et 'D'=Sans TVA | 'E'=défaut
    modeRegl:     string;
    montRegl:     string | null;   // format français '0,00'
    montHt:       string | null;   // format français '0,00'
    ventilTva:    string | null;   // encodage ROW_SEP / CELL_SEP
    montTva:      string | null;   // format français '0,00'
    montTtc:      string | null;   // format français '0,00'
    debours:      string | null;   // format français '0,00'
    penalite:     string | null;   // format français '0,00'
    nature:       string;
    dateEcriture: Date;
    factureId:    number;
    clientId:     number;
    abonneId:     number;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Initialisation d'une Recette vide
// ─────────────────────────────────────────────────────────────────────────────
export function createRecetteVide(overrides: Partial<Recette> = {}): Recette {
    return {
        id:           0,
        dateEmis:     new Date(),
        dateRegl:     null,
        refFac:       '',
        cliNom:       '',
        libelle:      '',
        regimeTva:    'E',
        modeRegl:     '',
        montRegl:     '0,00',
        montHt:       '0,00',
        ventilTva:    null,
        montTva:      '0,00',
        montTtc:      '0,00',
        debours:      '0,00',
        penalite:     '0,00',
        nature:       '',
        dateEcriture: new Date(),
        factureId:    0,
        clientId:     0,
        abonneId:     0,
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Champ `ventilTva` : Stocké en ROW_SEP / CELL_SEP (multi-lignes).
// Format base de données : tauxTva0¤baseHt0¤montantTva0|tauxTva0¤baseHt0¤montantTva0|...
// Exemple : 5,5¤100,00¤5,50|20,0¤4000,00¤800,00
// ─────────────────────────────────────────────────────────────────────────────
export const ventilTvaRowSchema = z.object({
    tauxTva0:    z.string(),
    baseHt0:     z.string(),
    montantTva0: z.string(),
});
export const ventilTvaSchema = z.union([
    ventilTvaRowSchema,
    z.array(ventilTvaRowSchema),
]);
export type VentilTvaRow = z.infer<typeof ventilTvaRowSchema>;
export type VentilTva    = z.infer<typeof ventilTvaSchema>;
/** Désérialise le champ `ventilTva` — Format brut : "tauxTva0¤baseHt0¤montantTva0|..." */
export function parseVentilTva(raw: string | null | undefined): VentilTvaRow[] | null {
    if (!raw) return null;
    try {
        // Rétrocompatibilité avec anciennes données JSON
        if (raw.trimStart().startsWith('[') || raw.trimStart().startsWith('{')) {
            const parsed = JSON.parse(raw);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            return arr.map((r: Record<string, unknown>) => ventilTvaRowSchema.parse(r));
        }
        // Format ROW_SEP / CELL_SEP
        const rows = raw.split(ROW_SEP).filter(Boolean);
        return rows.map((row) => {
            const cells = row.split(CELL_SEP);
            return ventilTvaRowSchema.parse({
                tauxTva0:    cells[0] ?? '0,0',
                baseHt0:     cells[1] ?? '0,00',
                montantTva0: cells[2] ?? '0,00',
            });
        });
    } catch {
        return null;
    }
}
/** Sérialise un tableau VentilTvaRow en ROW_SEP / CELL_SEP pour stockage en base. */
export function serializeVentilTva(data: VentilTvaRow | VentilTvaRow[]): string {
    const rows = Array.isArray(data) ? data : [data];
    return rows.map((r) => [
        r.tauxTva0,
        r.baseHt0,
        r.montantTva0,
    ].join(CELL_SEP)).join(ROW_SEP);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Schema Zod pour validation formulaire Recette (saisie partielle)
//    Seuls dateRegl, modeRegl et montRegl sont saisis par l'utilisateur. Les autres champs sont alimentés automatiquement depuis la facture.
// ─────────────────────────────────────────────────────────────────────────────
export const RecetteFormSchema = z.object({
    dateRegl: z.string().min(1, 'La date de règlement est obligatoire.'),
    modeRegl: z.string().min(1, 'Le mode de règlement est obligatoire.'),
    montRegl: z.string().min(1, 'Le montant du règlement est obligatoire.'),
});
export type RecetteFormData = z.infer<typeof RecetteFormSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. Données de traitement (UI uniquement — pas de stockage en base)
// ─────────────────────────────────────────────────────────────────────────────
export type RecetteTotalRow = {
    [key: string]: unknown;
};
export type RecetteTraitement = {
    acompteMont0:          string;
    facMontantDu0:         string;
    facMontFacturer0:      string;
    saisiAImputer0:        string;
    facTotalRecetteArray2: RecetteTotalRow[];
    facMontDebours0:       string;
    facTotReglSav0:        string;
    //Ope0:                  string | null;   // null conservé car absence = pas d'opération
    selRecettes:           Recette[];
};

export function createRecetteTraitementVide(): RecetteTraitement {
    return {
        acompteMont0:          '0,00',
        facMontantDu0:         '0,00',
        facMontFacturer0:      '0,00',
        saisiAImputer0:        '0,00',
        facTotalRecetteArray2: [],
        facMontDebours0:       '0,00',
        facTotReglSav0:        '0,00',
        //Ope0:                  null,
        selRecettes:           [],
    };
}

