/**
 * src/lib/utils/regimeTva.ts
 * Détermine le Régime TVA d'une Facture selon le statut fiscal de l'abonné et les caractéristiques du client.
 * Régimes :
 *   'A' = Non Assujetti (franchise TVA)
 *   'B' = Facturation Avec TVA
 *   'C' = Facturation Sans TVA (client UE, assujetti)
 *   'D' = Facturation Sans TVA (client Hors UE, assujetti)
 */

import { parseStatut } from '$lib/schemas/abonne';

/**
 * @param cliPays    - Pays du client (ex. 'France')
 * @param cliCee     - 0 = membre UE, 1 = hors UE
 * @param cliTva     - 0 = assujetti TVA, 1 = non assujetti
 * @param statutRaw  - Champ `statut` brut de l'abonné (depuis Prisma)
 * @returns          - Code régime TVA : 'A' | 'B' | 'C' | 'D'
 */
export function regimeTvaFacture(
    cliPays:    string,
    cliCee:     number,
    cliTva:     number,
    statutRaw:  string
): string {
    const { statutFiscal0 } = parseStatut(statutRaw);
    // ── Franchise TVA (non assujetti) ─────────────────────────────
    if (statutFiscal0 === '1') return 'A';
    // ── Client en France → toujours avec TVA ──────────────────────
    if (cliPays === 'France') return 'B';
    // ── Client UE ─────────────────────────────────────────────────
    if (cliCee === 0) {
        return cliTva === 0
            ? 'C'   // assujetti TVA → facturation sans TVA
            : 'B';  // non assujetti  → facturation avec TVA
    }
    // ── Client Hors UE ────────────────────────────────────────────
    return cliTva === 0
        ? 'D'   // assujetti TVA → facturation sans TVA
        : 'B';  // non assujetti  → facturation avec TVA
}