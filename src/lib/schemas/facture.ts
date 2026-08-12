/**
 * Schémas Zod et types TypeScript pour le modèle Facture.
 * Les champs "dérivés" (client, dateEcheance, ligne, total, acompMont, penalite) sont stockés sous forme de chaînes encodées dans la base de données.
 * Ce fichier expose :
 *  - les types TypeScript de chaque sous-structure,
 *  - les schémas Zod correspondants,
 *  - des utilitaires parse / serialize pour chaque champ.
 * Convention de nommage des séparateurs :
 *   ROW_SEP  = '|'   → sépare les lignes de Facturation et de Totalisation (1er niveau de `ligne`)
 *   CELL_SEP = '¤'   → sépare les rubriques d'une ligne (2e niveau de `ligne`) et les couples taux/montant de `acompMont` en régime TVA
 */
import { z } from "zod";
import { numberToFrStr } from '$lib/utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────
export const ROW_SEP  = "|";
export const CELL_SEP = "¤";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers : formate en format français
// ─────────────────────────────────────────────────────────────────────────────
export function fmt2fr(value: string | number): string {
    const n = typeof value === 'string'
        ? parseFloat(value.replace(',', '.'))
        : value;
    return isNaN(n) ? '0,00' : n.toFixed(2).replace('.', ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schéma complet du modèle Facture (champs Prisma + champs dérivés parsés)
// ─────────────────────────────────────────────────────────────────────────────
/** Représentation complète d'une Facture avec ses champs dérivés désérialisés. À utiliser côté application après lecture en base. */
export type FactureComplete = {
    // ── Champs Prisma natifs ────────────────────────────────────────────────
    id:               number;
    codeType:         number;          // Int(2)
    refFac:           string;          // VarChar(15)
    refDevis:         string | null;
    refPre:           string | null;
    statutCode:       number;
    statut:           string;
    regimeTva:        string | null;   // Char(1) : 'A'=Non Assujetti(franchise Tva) | 'B'=Facturation Avec TVA | 'C' et 'D'=Facturation Sans TVA
    dateEmis:         Date;
    typeDelai:        number;          // Int(1) - 1="délai légal(limité à 30jours)"", 2="45jours fin de mois", 3="45jours date emission", 4="60jours date emission"
    delai:            number;          // Int(2)
    dateEcheance:     string;
    remTot:           number | null;
    totTtc:           number | null;
    acompTaux:        number | null;
    totPrestaHt:      number | null;
    totVenteHt:       number | null;
    dateRegl:         Date   | null;
    imputCreCli:      number | null;
    totRegl:          number | null;
    montCli:          number | null;
    solde:            number | null;
    soldePenalite:    number | null;
    createdAt:        Date;
    courrierId:       number | null;
    affaireId:        number;
    clientId:         number;
    abonneId:         number;
    // ── Champs dérivés format français ───────────────────────────────────────
    soldeStr:         string;   // solde au format '0,00'
    montCliStr:       string;   // montCli au format '0,00'
    soldePenaliteStr: string;   // soldePenalite au format '0,00'
    // ── Champs dérivés désérialisés ─────────────────────────────────────────
    clientData:       ClientFacture | null;    // issu de `client`
    dateEcheanceData: DateEcheance  | null;    // issu de `dateEcheance`
    ligneData:        Ligne         | null;    // issu de `ligne`
    totalData:        Total         | null;    // issu de `total`
    penaliteData:     Penalite      | null;    // issu de `penalite`
};

/** Transforme un enregistrement Prisma brut (tel que retourné par `prisma.facture.findUnique(…)`) en FactureComplete avec tous les champs dérivés désérialisés. */
export function toFactureComplete(raw: {
    id:            number;
    codeType:      number;
    refFac:        string;
    refDevis:      string | null;
    refPre:        string | null;
    client:        string | null;
    statutCode:    number;
    statut:        string;
    regimeTva:     string | null;
    dateEmis:      Date;
    typeDelai:     number;
    delai:         number;
    dateEcheance:  string;
    ligne:         string | null;
    remTot:        number | null;
    total:         string | null;
    totTtc:        number | null;
    acompTaux:     number | null;
    acompMont:     string | null;
    totPrestaHt:   number | null;
    totVenteHt:    number | null;
    dateRegl:      Date | null;
    imputCreCli:   number | null;
    totRegl:       number | null;
    montCli:       number | null;
    solde:         number | null;
    penalite:      string | null;
    soldePenalite: number | null;
    createdAt:     Date;
    courrierId:    number | null;
    affaireId:     number;
    clientId:      number;
    abonneId:      number;
}): FactureComplete {
    return {
        id:               raw.id,
        codeType:         raw.codeType,
        refFac:           raw.refFac,
        refDevis:         raw.refDevis,
        refPre:           raw.refPre,
        statutCode:       raw.statutCode,
        statut:           raw.statut,
        regimeTva:        raw.regimeTva,
        dateEmis:         raw.dateEmis,
        typeDelai:        raw.typeDelai,
        delai:            raw.delai,
        dateEcheance:     raw.dateEcheance,
        remTot:           raw.remTot        != null ? parseFloat(String(raw.remTot))        : null,
        totTtc:           raw.totTtc        != null ? parseFloat(String(raw.totTtc))        : null,
        acompTaux:        raw.acompTaux,
        totPrestaHt:      raw.totPrestaHt   != null ? parseFloat(String(raw.totPrestaHt))   : null,
        totVenteHt:       raw.totVenteHt    != null ? parseFloat(String(raw.totVenteHt))    : null,
        dateRegl:         raw.dateRegl,
        imputCreCli:      raw.imputCreCli   != null ? parseFloat(String(raw.imputCreCli))   : null,
        totRegl:          raw.totRegl       != null ? parseFloat(String(raw.totRegl))       : null,
        montCli:          raw.montCli       != null ? parseFloat(String(raw.montCli))       : null,
        solde:            raw.solde         != null ? parseFloat(String(raw.solde))         : null,
        soldePenalite:    raw.soldePenalite != null ? parseFloat(String(raw.soldePenalite)) : null,
        createdAt:        raw.createdAt,
        courrierId:       raw.courrierId,
        affaireId:        raw.affaireId,
        clientId:         raw.clientId,
        abonneId:         raw.abonneId,
        // ── Champs dérivés format français ─────────────────────────────────
        soldeStr:         numberToFrStr(raw.solde),
        montCliStr:       numberToFrStr(raw.montCli),
        soldePenaliteStr: numberToFrStr(raw.soldePenalite),
        // ── Champs dérivés désérialisés ─────────────────────────────────────
        clientData:       parseClientFacture(raw.client),
        dateEcheanceData: parseDateEcheance(raw.dateEcheance),
        ligneData:        parseLigne(raw.ligne),
        totalData:        parseTotal(raw.total),
        penaliteData:     parsePenalite(raw.penalite),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Type `Facture` — forme allégée retournée par le select Prisma du load
// ─────────────────────────────────────────────────────────────────────────────
// Ce type correspond exactement aux champs sélectionnés dans `+page.server.ts` → `prisma.facture.findMany({ select: { … } })`.
// Il est utilisé dans `+page.svelte` pour typer le tableau `data.factures`.
// Si de nouveaux champs sont ajoutés au `select`, les ajouter ici également.
export type Facture = {
    id:               number;
    codeType:         number;          // 10 | 20 | 30 | 40
    refFac:           string;
    refDevis:         string | null;
    refPre:           string | null;
    client:           string | null;   // JSON sérialisé (factureClientSchema)
    statutCode:       number;
    statut:           string;
    regimeTva:        string | null;   // 'A'=Non Assujetti(franchise Tva) *** 'B'=Facturation Avec TVA *** 'C' et 'D'=Facturation Sans TVA
    dateEmis:         Date;
    typeDelai:        number;
    delai:            number;
    dateEcheance:     string | null;
    ligne:            string | null;   // encodage ROW_SEP / CELL_SEP
    total:            string | null;   // JSON sérialisé
    remTot:           number | null;
    totTtc:           number | null;
    acompTaux:        number | null;
    acompMont:        string | null;
    // ── Totaux ───────────────
    totPrestaHt:      number | null;
    totVenteHt:       number | null;
    dateRegl?:        string | null;
    imputCreCli:      number | null;
    totRegl:          number | null;
    montCli:          number | null;
    solde:            number | null;
    penalite:         string | null;
    soldePenalite:    number | null;
    createdAt:        Date;
    clientId:         number;
    abonneId:         number;
    // ── Champs dérivés format français ───────────────────────────────────────
    soldeStr:         string;   // solde au format '0,00'
    montCliStr:       string;   // montCli au format '0,00'
    soldePenaliteStr: string;   // soldePenalite au format '0,00'
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Initialisation d'une Facture vide (Création Devis / Facture)
// ─────────────────────────────────────────────────────────────────────────────
export function createFactureVide(overrides: Partial<Facture> = {}): Facture {
    return {
        id:               0,
        codeType:         0,
        refFac:           '',
        refDevis:         null,
        refPre:           null,
        client:           null,
        statutCode:       0,
        statut:           '',
        regimeTva:        null,
        dateEmis:         new Date(),
        typeDelai:        0,
        delai:            0,
        dateEcheance:     null,
        ligne:            null,
        total:            null,
        // ── Champs décimaux initialisés à 0.00 ────────────────────
        remTot:           0.00,
        totTtc:           0.00,
        acompTaux:        null,
        acompMont:        null,
        totPrestaHt:      0.00,
        totVenteHt:       0.00,
        dateRegl:         null,
        imputCreCli:      0.00,
        totRegl:          0.00,
        montCli:          0.00,
        solde:            0.00,
        penalite:         null,
        soldePenalite:    0.00,
        createdAt:        new Date(),
        // ── Champs dérivés format français ────────────────────────
        soldeStr:         '0,00',
        montCliStr:       '0,00',
        soldePenaliteStr: '0,00',
        clientId:          0,
        abonneId:          0,
        ...overrides,    // ← permet de surcharger à la création
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Champ `client` : Stocké en CELL_SEP (objet unique, pas de ROW_SEP).
// Format base de données : libClient0¤adres0¤complAdres0¤cp0¤ville0¤pays0¤contNom0¤contPhone0¤cee0¤tva0¤typeCli0
// Exemple : Client-B¤10 rue du chemin vert¤impasse trois¤14956¤Thonon¤France¤¤¤0¤0¤0
// ─────────────────────────────────────────────────────────────────────────────
// Les Factures étant rattachées à une seule Affaire, le client est figé à l'émission de la facture.
export const factureClientSchema = z.object({
    libClient0:  z.string().min(1, "Libellé client requis"),       // raison sociale / nom du client
    adres0:      z.string().optional().default(""),                // adresse ligne 1
    complAdres0: z.string().optional().default(""),                // complément d'adresse
    cp0:         z.string().optional().default(""),                // code postal
    ville0:      z.string().optional().default(""),                // ville
    pays0:       z.string().optional().default(""),                // pays
    contNom0:    z.string().optional().default(""),                // nom du contact
    contPhone0:  z.string().optional().default(""),                // téléphone du contact
    cee0:        z.union([z.literal(0), z.literal(1)]).default(0), // membre CEE (0 | 1)
    tva0:        z.union([z.literal(0), z.literal(1)]).default(0), // assujetti TVA (0 | 1)
    typeCli0:    z.number().int().default(0),                      // type de client 0=professionnel - 1=particulier
});
export type ClientFacture = z.infer<typeof factureClientSchema>;

/** Désérialise le champ `client` — Format brut : "libClient0¤adres0¤...¤typeCli0" */
export function parseClientFacture(raw: string | null | undefined): ClientFacture | null {
    if (!raw) return null;
    try {
        // Rétrocompatibilité avec anciennes données JSON
        if (raw.trimStart().startsWith('{')) {
            return factureClientSchema.parse(JSON.parse(raw));
        }
        // Format CELL_SEP
        const cells = raw.split(CELL_SEP);
        return factureClientSchema.parse({
            libClient0:  cells[0]  ?? '',
            adres0:      cells[1]  ?? '',
            complAdres0: cells[2]  ?? '',
            cp0:         cells[3]  ?? '',
            ville0:      cells[4]  ?? '',
            pays0:       cells[5]  ?? '',
            contNom0:    cells[6]  ?? '',
            contPhone0:  cells[7]  ?? '',
            cee0:        parseInt(cells[8]  ?? '0', 10) as 0 | 1,
            tva0:        parseInt(cells[9]  ?? '0', 10) as 0 | 1,
            typeCli0:    parseInt(cells[10] ?? '0', 10),
        });
    } catch {
        return null;
    }
}

/** Sérialise un ClientFacture en CELL_SEP pour stockage en base. */
export function serializeClientFacture(data: ClientFacture): string {
    const validated = factureClientSchema.parse(data);
    return [
        validated.libClient0,
        validated.adres0,
        validated.complAdres0,
        validated.cp0,
        validated.ville0,
        validated.pays0,
        validated.contNom0,
        validated.contPhone0,
        String(validated.cee0),
        String(validated.tva0),
        String(validated.typeCli0),
    ].join(CELL_SEP);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Champ `dateEcheance` : Stocké en ROW_SEP (objet unique, pas de CELL_SEP).
// Format base de données : date0|couleurHtml0
// Exemple : 14/08/2026|#66C909
// ─────────────────────────────────────────────────────────────────────────────
export const dateEcheanceSchema = z.object({
    date0:        z.string().regex(
        /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/,
        'Format date attendu : DD/MM/YYYY ou YYYY-MM-DD'
    ),
    couleurHtml0: z
        .string()
        .regex(/^#[0-9A-Fa-f]{3,6}$/, "Code couleur HTML invalide")
        .optional()
        .default("#000000"),
});
export type DateEcheance = z.infer<typeof dateEcheanceSchema>;

/** Désérialise le champ `dateEcheance` — Format brut : "DD/MM/YYYY|#couleur" */
export function parseDateEcheance(raw: string | null | undefined): DateEcheance | null {
    if (!raw) return null;
    try {
        if (raw.trimStart().startsWith('{')) {
            return dateEcheanceSchema.parse(JSON.parse(raw));
        }
        const cells = raw.split(ROW_SEP);
        const result = dateEcheanceSchema.parse({
            date0:        cells[0] ?? '',
            couleurHtml0: cells[1] ?? '#000000',
        });
        return result;
    } catch {
        return null;
    }
}

/** Sérialise une DateEcheance en ROW_SEP pour stockage en base. */
export function serializeDateEcheance(data: DateEcheance): string {
    return [
        data.date0,
        data.couleurHtml0,
    ].join(ROW_SEP);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Champ d'une `ligne` de Facturation
// ─────────────────────────────────────────────────────────────────────────────
export const ligneCellSchema = z.object({
    typeLig0:      z.string().optional().default(''),       // [0]
    nature0:       z.string().optional().default(''),       // [1]
    textHtml0:     z.string().optional().default(''),       // [2]
    unite0:        z.string().optional().default(''),       // [3]
    prixUnitaire0: z.string().optional().default('0,00'),   // [4]
    quantite0:     z.string().optional().default('0,00'),   // [5]
    baseHt0:       z.string().optional().default('0,00'),   // [6]
    pourRemise0:   z.string().optional().default('0'),      // [7]
    remise0:       z.string().optional().default('0,00'),   // [8]
    montantHt0:    z.string().optional().default('0,00'),   // [9]
    tauxTva0:      z.string().optional().default('0,0'),    // [10]
    tarifId0:      z.string().optional().default(''),       // [11]
});
export type LigneCell = z.infer<typeof ligneCellSchema>;
export const ligneSchema = z.array(ligneCellSchema);
export type Ligne = z.infer<typeof ligneSchema>;

/** Désérialise le champ `ligne` - Format brut : "nature0¤textHtml0¤...¤montantHt0¤tauxTva0¤tarifId0|..." */
export function parseLigne(raw: string | null | undefined): Ligne | null {
    if (!raw) return null;
    try {
        const rows = raw.split(ROW_SEP).filter(Boolean);
        return rows.map((row) => {
            const cells = row.split(CELL_SEP);
            return ligneCellSchema.parse({
                typeLig0:      cells[0]  ?? '',
                nature0:       cells[1]  ?? '',
                textHtml0:     cells[2]  ?? '',
                unite0:        cells[3]  ?? '',
                prixUnitaire0: cells[4]  ?? '0,00',
                quantite0:     cells[5]  ?? '0,00',
                baseHt0:       cells[6]  ?? '0,00',
                pourRemise0:   cells[7]  ?? '0',
                remise0:       cells[8]  ?? '0,00',
                montantHt0:    cells[9]  ?? '0,00',
                tauxTva0:      cells[10] ?? '0,00',
                tarifId0:      cells[11] ?? '',
            });
        });
    } catch {
        return null;
    }
}

export function serializeLigne(lignes: LigneCell[]): string {
    return lignes.map((l) => [
        l.typeLig0,
        l.nature0,
        l.textHtml0,
        l.unite0,
        l.prixUnitaire0,
        l.quantite0,
        l.baseHt0,
        l.pourRemise0,
        l.remise0,
        l.montantHt0,
        l.tauxTva0,
        l.tarifId0,
    ].join(CELL_SEP)).join(ROW_SEP);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Champ `total` : Stocké en ROW_SEP / CELL_SEP
// Format : typeTotalisation0¤libelle0¤montBrut0¤acompteImputation0¤montHt0¤montTva0¤montTtc0|...
// ─────────────────────────────────────────────────────────────────────────────
export const totalRowSchema = z.object({
    typeTotalisation0:  z.string().optional().default(''),
    libelle0:           z.string().optional().default(''),
    montBrut0:          z.string().optional().default('0,00'),
    acompteImputation0: z.string().optional().default('0,00'),
    montHt0:            z.string().optional().default('0,00'),
    montTva0:           z.string().optional().default('0,00'),
    montTtc0:           z.string().optional().default('0,00'),
});
export type TotalRow = z.infer<typeof totalRowSchema>;
export const totalSchema = z.union([totalRowSchema, z.array(totalRowSchema)]);
export type Total = z.infer<typeof totalSchema>;

/** Désérialise le champ `total` — Format brut : "typeTotalisation0¤libelle0¤...¤montTtc0|..." */
export function parseTotal(raw: string | null | undefined): Total | null {
    if (!raw) return null;
    try {
        if (raw.trimStart().startsWith('[') || raw.trimStart().startsWith('{')) {
            return totalSchema.parse(JSON.parse(raw));
        }
        const rows = raw.split(ROW_SEP).filter(Boolean);
        const parsed = rows.map((row) => {
            const cells = row.split(CELL_SEP);
            return totalRowSchema.parse({
                typeTotalisation0:  cells[0] ?? '',
                libelle0:           cells[1] ?? '',
                montBrut0:          cells[2] ?? '0,00',
                acompteImputation0: cells[3] ?? '',
                montHt0:            cells[4] ?? '0,00',
                montTva0:           cells[5] ?? '0,00',
                montTtc0:           cells[6] ?? '0,00',
            });
        });
        return parsed.length === 1 ? parsed[0] : parsed;
    } catch {
        return null;
    }
}

/** Sérialise le champ `total` en ROW_SEP / CELL_SEP pour stockage en base. */
export function serializeTotal(data: Total): string {
    const rows = Array.isArray(data) ? data : [data];
    return rows.map((r) => [
        r.typeTotalisation0,
        r.libelle0,
        r.montBrut0,
        r.acompteImputation0,
        r.montHt0,
        r.montTva0,
        r.montTtc0,
    ].join(CELL_SEP)).join(ROW_SEP);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Données calculées pour FactureTotaux + API PDF (partagées)
// ─────────────────────────────────────────────────────────────────────────────
export type FactureTotauxState = {
    // ── Acompte ────────────────────────────────────────────────────
    imputAcomp0:              string;        // ''
    acompMontArray0:          string[];      // tableau avant jointure
    acompteId0:               number;        // id de la facture d'acompte
    acompPresta0:             string;        // format français '0,00'
    acompVente0:              string;        // format français '0,00'
    // ── Lignes de remise ───────────────────────────────────────────
    nbreLigRem0:              number;
    // ── Colonnes totaux ────────────────────────────────────────────
    colSpanTot0:              number;
    // ── Tableaux de totalisation ───────────────────────────────────
    arrTot10:                 string[];
    arrTot20:                 string[];
    arrTot30:                 string[];
    arrTot40:                 string[];
    arrTot50:                 string[];
    // ── Style PDF ──────────────────────────────────────────────────
    numLigneGras0:            number;
    // ── Dimensions lignes totaux ───────────────────────────────────
    dimLigTotGauche0:         number;
    dimLigTotDroit0:          number;
    // ── BDP ────────────────────────────────────────────────────────
    bdp1Label0:               string;
    // ── Total brut TTC ────────────────────────────────────────────
    totBrutTtc0:              string;        // format français '0,00'
};

// ─────────────────────────────────────────────────────────────────────────────
// 8b - Initialisation d'un FactureTotauxState vide
// ─────────────────────────────────────────────────────────────────────────────
export function createFactureTotauxState(): FactureTotauxState {
    return {
        imputAcomp0:              '0',
        acompMontArray0:          [],
        acompteId0:               0,
        acompPresta0:             '0,00',
        acompVente0:              '0,00',
        nbreLigRem0:              0,
        colSpanTot0:              3,
        arrTot10:                 [],
        arrTot20:                 [],
        arrTot30:                 [],
        arrTot40:                 [],
        arrTot50:                 [],
        numLigneGras0:            0,
        dimLigTotGauche0:         0,
        dimLigTotDroit0:          0,
        bdp1Label0:               '',
        totBrutTtc0:              '0,00',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Champ `penalite` : Stocké en CELL_SEP (objet unique, pas de ROW_SEP).
// Format base de données : typePenalite0¤montPenalite0¤indemForfait0
// Exemple : 2¤150,00¤40,00
// ─────────────────────────────────────────────────────────────────────────────
export const penaliteSchema = z.object({
    typePenalite0: z.number().int().default(0),           // type de pénalité : de 0 à 8
    montPenalite0: z.string().optional().default('0,00'), // montant de la pénalité (2 décimales)
    indemForfait0: z.string().optional().default('0,00'), // indemnité forfaitaire (2 décimales)
});
export type Penalite = z.infer<typeof penaliteSchema>;

/** Désérialise le champ `penalite` — Format brut : "typePenalite0¤montPenalite0¤indemForfait0" */
export function parsePenalite(raw: string | null | undefined): Penalite | null {
    if (!raw) return null;
    try {
        if (raw.trimStart().startsWith('{')) {
            return penaliteSchema.parse(JSON.parse(raw));
        }
        const cells = raw.split(CELL_SEP);
        return penaliteSchema.parse({
            typePenalite0: parseInt(cells[0] ?? '0', 10),
            montPenalite0: cells[1] ?? '0,00',
            indemForfait0: cells[2] ?? '0,00',
        });
    } catch {
        return null;
    }
}

/** Sérialise une Penalite en CELL_SEP pour stockage en base. */
export function serializePenalite(data: Penalite): string {
    return [
        String(data.typePenalite0),
        data.montPenalite0,
        data.indemForfait0,
    ].join(CELL_SEP);
}