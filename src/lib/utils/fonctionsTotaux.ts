/**
 * Fonctions utilitaires communes pour la gestion des totalisations :  FactureTotaux.svelte, API PDF, etc.)
 * @param facture  - Objet Facture
 * @param tot      - État calculé des totalisations (mutated: bdp1Label0)
 */

import { numberToFrStr } from '$lib/utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// traitLigneTotal — Élabore les lignes de totalisation à partir des lignes de facturation.
// Utilisé par : FactureLignes, FactureTotaux, API PDF.
// ─────────────────────────────────────────────────────────────────────────────
export function traitLigneTotal(facture:Facture, tot:FactureTotauxState): void {
    // ── Parsing des lignes de facturation ────────────────────────────────────
    const lignes = parseLigne(facture.ligne) ?? [];
    // ── Réinitialisation ─────────────────────────────────────────────────────
    const totalRows: TotalRow[] = [];
    let cumulRemTot      = 0;
    tot.nbreLigRem0      = 0;
    let calTotAcompteTtc = 0;
    let cumulVenteHt     = 0;
    let cumulPrestaHt    = 0;
    let cumulMontTtc     = 0;
    const codeType       = String(facture.codeType);
    const regimeTva      = facture.regimeTva ?? '';
    const acompTaux      = n(facture.acompTaux);
    const imputAcomp     = String(tot.imputAcomp0 ?? '0');
    // ── Boucle sur les lignes de facturation ─────────────────────────────────
    for (const ligne of lignes) {
        // Ignorer les commentaires (typeLig0 == "00,030")
        if (ligne.typeLig0.slice(4, 6) === '30') continue;
        // ── Restitue typTot ──────────────────────────────────────────────────
        const slice46 = ligne.typeLig0.slice(4, 6);
        const typeTot = (slice46 === '12' || slice46 === '13')
            ? ligne.typeLig0.slice(0, 4) + '14'
            : ligne.typeLig0.slice(0, 6);
        // ── libTotal ─────────────────────────────────────────────────────────
        let libTotal = '';
        switch (slice46) {
            case '00': // Vente
                libTotal = regimeTva === 'B'
                    ? `Vente (tva ${parseFloat(ligne.typeLig0.slice(0, 4).replace(',', '.')).toString().replace('.', ',')}%)`
                    : 'Vente';
                break;
            case '11': // Prestation
                libTotal = regimeTva === 'B'
                    ? `Prestation (tva ${parseFloat(ligne.typeLig0.slice(0, 4).replace(',', '.')).toString().replace('.', ',')}%)`
                    : 'Prestation';
                break;
            case '12': // Frais départ
            case '13': // Frais déplacement
                libTotal = regimeTva === 'B'
                    ? `Divers Frais (tva ${parseFloat(ligne.typeLig0.slice(0, 4).replace(',', '.')).toString().replace('.', ',')}%)`
                    : 'Divers Frais';
                break;
            case '20': // Débours
                libTotal = 'Débours';
        }
        // ── Remise Totale ────────────────────────────────────────────────────
        let calRemTot   = 0;
        if (ligne.remise0 !== '') {
            const ind = ligne.remise0.indexOf('>');
            const ediRemTot = ind >= 0
                ? ligne.remise0.slice(ind + 1)
                : ligne.remise0;
            calRemTot = n(ediRemTot.replace(',', '.'));
            cumulRemTot  += calRemTot;
            tot.nbreLigRem0 += 1;
        }
        // ── Montant Brut HT ──────────────────────────────────────────────────
        const ediMontBrutHt = ligne.montantHt0;     // [9] dans ligneCellSchema
        const calMontBrutHt = n(ediMontBrutHt);
        // ── Acompte Devis ────────────────────────────────────────────────────
        let ediAcompte = '';
        let calAcompte = 0;
        if (codeType === '10' && acompTaux > 0) {
            if (typeTot.slice(4, 6) === '00' || typeTot.slice(4, 6) === '11') {
                calAcompte  = (calMontBrutHt * acompTaux) / 100;
                ediAcompte  = fmt2fr(calAcompte);
                calTotAcompteTtc += calAcompte;
            }
        }
        // ── Montant Net HT ───────────────────────────────────────────────────
        const ediMontNetHt = ediMontBrutHt;
        const calMontNetHt = calMontBrutHt;
        // ── Cumul Ventes et Prestations ──────────────────────────────────────
        switch (typeTot.slice(4, 6)) {
            case '00': cumulVenteHt  += calMontNetHt; break;
            case '11': cumulPrestaHt += calMontNetHt; break;
        }
        // ── TVA et Montant TTC ───────────────────────────────────────────────
        let ediMontTva = '';
        let calMontTva = 0;
        let ediMontTtc = '';
        let calMontTtc = 0;
        if (typeTot === '00,020') { // Débours — pas de TVA
            ediMontTtc  = ediMontBrutHt;
            calMontTtc  = calMontBrutHt;
            cumulMontTtc += calMontTtc;
        } else {
            if (regimeTva === 'B') { // Imposition à la TVA
                const tauxTva = n(ligne.tauxTva0);  // [10]
                calMontTva    = (calMontNetHt * tauxTva) / 100;
                ediMontTva    = fmt2fr(calMontTva);
                calMontTtc    = calMontNetHt + calMontTva;
                cumulMontTtc += calMontTtc;
                // Totalisation Acompte TTC (Devis)
                if (codeType === '10' && acompTaux > 0) {
                    if (typeTot.slice(4, 6) === '00' || typeTot.slice(4, 6) === '11') { calTotAcompteTtc += (calAcompte * tauxTva) / 100; }
                }
            } else { // Exonération de TVA
                calMontTtc    = calMontNetHt;
                cumulMontTtc += calMontTtc;
            }
            ediMontTtc = fmt2fr(calMontTtc);
        }
        // ── Cumul dans la ligne de totalisation ──────────────────────────────
        const existing = totalRows.find(r => r.typeTotalisation0.slice(0, 6) === typeTot);
        if (!existing) {
            // Création de la ligne de totalisation
            totalRows.push({
                typeTotalisation0:  typeTot,
                libelle0:           libTotal,
                montBrut0:          ediMontBrutHt,
                acompteImputation0: ediAcompte,
                montHt0:            ediMontNetHt,
                montTva0:           ediMontTva,
                montTtc0:           ediMontTtc,
            });
        } else {
            // Mise à jour de la ligne de totalisation existante
            const updBrut               = n(existing.montBrut0)          + calMontBrutHt;
            const updAcomp              = n(existing.acompteImputation0) + calAcompte;
            const updNet                = updBrut - updAcomp;
            const updTva                = n(existing.montTva0)           + calMontTva;
            const updTtc                = n(existing.montTtc0)           + calMontTtc;
            existing.montBrut0          = fmt2fr(updBrut);
            existing.acompteImputation0 = fmt2fr(updAcomp);
            existing.montHt0            = fmt2fr(updNet);
            existing.montTva0           = fmt2fr(updTva);
            existing.montTtc0           = fmt2fr(updTtc);
        }
    }
    // ── Remise Totale finale ─────────────────────────────────────────────────
    (facture as Record<string, unknown>).remTot = fmt2fr(cumulRemTot);
    (facture as Record<string, unknown>).libRemTot0 = cumulRemTot === 0 ? '' : 'Remise Totale';
    // ── Totaux globaux ───────────────────────────────────────────────────────
    (facture as Record<string, unknown>).totTtc      = fmt2fr(cumulMontTtc);
    (facture as Record<string, unknown>).totPrestaHt = fmt2fr(cumulPrestaHt);
    (facture as Record<string, unknown>).totVenteHt  = fmt2fr(cumulVenteHt);

    // ── DEVIS : Calcul du montant de l'Acompte ───────────────────────────────
    if (codeType === '10' && acompTaux > 0) {
        if (regimeTva === 'B') {
            (facture as Record<string, unknown>).acompMont = fmt2fr(calTotAcompteTtc);
        } else {
            const base    = cumulVenteHt + cumulPrestaHt;
            const acompte = (base * acompTaux) / 100;
            (facture as Record<string, unknown>).acompMont = fmt2fr(acompte);
        }
    }

    // ── FACTURE : Imputation de l'Acompte ────────────────────────────────────
    if (codeType === '30') {
        if (imputAcomp === '2' && facture.refDevis) { // Franchise TVA : imputation sur les totaux finaux ---------
            const totBrut   = fmt2fr(cumulMontTtc);
            const acompMt   = n(facture.acompMont);
            const totNet    = cumulMontTtc - acompMt;
            tot.totBrutTtc0 = totBrut;
            (facture as Record<string, unknown>).totTtc     = fmt2fr(totNet);
            (facture as Record<string, unknown>).solde      = fmt2fr(totNet);
            if (cumulVenteHt > 0) {
                const cal = cumulVenteHt - n(tot.acompVente0);
                (facture as Record<string, unknown>).totVenteHt = fmt2fr(cal);
            }
            if (cumulPrestaHt > 0) {
                const cal = cumulPrestaHt - n(tot.acompPresta0);
                (facture as Record<string, unknown>).totPrestaHt = fmt2fr(cal);
            }
        }
        if (imputAcomp === '3' && facture.refDevis) { // Imposition TVA : imputation sur les lignes de totalisation --------
            const arrAcomp = String(facture.acompMont ?? '').split(ROW_SEP);
            let ligTotAcompte = '';
            for (const itemAcomp of arrAcomp) {
                const ligAcomp = itemAcomp.split(CELL_SEP);
                const tauxStr  = ligAcomp[0] ?? '';
                const montHt   = ligAcomp[1] ?? '0,00';
                const existing = totalRows.find(r => r.typeTotalisation0.slice(0, 6) === tauxStr);
                if (!existing) {
                    // Création d'une ligne Acompte réglé
                    const libel  = `Acompte réglé (${tauxStr.slice(0, 4)}%)`;
                    const tva    = fmt2fr((n(montHt) * n(tauxStr.slice(0, 4))) / 100 * -1);
                    const netTtc = fmt2fr((n(montHt) - n(tva)) * -1);
                    const lig    = `${tauxStr}${CELL_SEP}${libel}${CELL_SEP}${CELL_SEP}${CELL_SEP}-${montHt}${CELL_SEP}${tva}${CELL_SEP}${netTtc}`;
                    ligTotAcompte += (ligTotAcompte ? ROW_SEP : '') + lig;
                } else {
                    // Mise à jour de la ligne existante
                    existing.acompteImputation0 = montHt;
                                const netHt = n(existing.montBrut0) - n(montHt);
                    existing.montHt0  = fmt2fr(netHt);
                    const taux        = n(tauxStr.slice(0, 4));
                    existing.montTva0 = fmt2fr((netHt * taux) / 100);
                    existing.montTtc0 = fmt2fr(netHt + n(existing.montTva0));
                }
            }
            // Ajouter les lignes Acompte non appariées
            if (ligTotAcompte) {
                for (const lig of ligTotAcompte.split(ROW_SEP)) {
                    const cells = lig.split(CELL_SEP);
                    totalRows.push({
                        typeTotalisation0:  cells[0] ?? '',
                        libelle0:           cells[1] ?? '',
                        montBrut0:          cells[2] ?? '0,00',
                        acompteImputation0: cells[3] ?? '0,00',
                        montHt0:            cells[4] ?? '0,00',
                        montTva0:           cells[5] ?? '0,00',
                        montTtc0:           cells[6] ?? '0,00',
                    });
                }
            }
            // Re-calcul totTtc, totVenteHt, totPrestaHt
            cumulMontTtc  = 0;
            cumulVenteHt  = 0;
            cumulPrestaHt = 0;
            for (const row of totalRows) {
                cumulMontTtc += n(row.montTtc0);
                if (row.typeTotalisation0.slice(4, 6) === '00') cumulVenteHt  += n(row.montHt0);
                if (row.typeTotalisation0.slice(4, 6) === '11' ||  row.typeTotalisation0.slice(4, 6) === '14') cumulPrestaHt += n(row.montHt0);
            }
            (facture as Record<string, unknown>).totTtc      = fmt2fr(cumulMontTtc);
            (facture as Record<string, unknown>).totVenteHt  = fmt2fr(cumulVenteHt);
            (facture as Record<string, unknown>).totPrestaHt = fmt2fr(cumulPrestaHt);
        }
    }
    // ── Tri par slice(4,6) croissant ─────────────────────────────────────────
    totalRows.sort( (a, b) => a.typeTotalisation0.slice(4, 6).localeCompare(b.typeTotalisation0.slice(4, 6)) );
    // ── Sérialisation dans facture.total ─────────────────────────────────────
    facture.total = serializeTotal(totalRows);
    // ── Appel des fonctions de finalisation ──────────────────────────────────
    traitLibTotaux(facture, tot);
    traitColSpan(facture, tot);
}

// ─────────────────────────────────────────────────────────────────────────────
// traitLibBasPage — Détermine le libellé légal de bas de page du document en fonction du régime TVA applicable. . Utilisé par : FactureTotaux, API PDF.
// ─────────────────────────────────────────────────────────────────────────────
export function traitLibBasPage(facture: Facture, tot: FactureTotauxState): void {
    tot.bdp1Label0 = '';
    switch (facture.regimeTva) {
        case 'A':
            tot.bdp1Label0 = "Franchise de TVA, art. 293B du Code Général des Impôts.";
            break;
        case 'B':  // Facturation avec TVA → pas de mention légale
            tot.bdp1Label0 = '';
            break;
        case 'C':
            tot.bdp1Label0 = "Autoliquidation - Exonération de TVA, article 283 du CGI.";
            break;
        case 'D':
            tot.bdp1Label0 = "TVA non applicable, art. 259-1 du Code Général des Impôts.";
            break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Autres Fonctions
// ─────────────────────────────────────────────────────────────────────────────
import { parseLigne, serializeTotal, fmt2fr, CELL_SEP, ROW_SEP, type Facture, type FactureTotauxState, type TotalRow } from '$lib/schemas/facture';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function n(v: string | number | null | undefined): number {
    return parseFloat(String(v ?? '0').replace(',', '.')) || 0;
}
function fr(v: number): string {
    return v.toFixed(2).replace('.', ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// traitColSpan — Détermine le colSpan des colonnes pour les lignes de totalisation "Total TTC" et (éventuellement) "Acompte". Utilisé par : FactureTotaux, API PDF.
// ─────────────────────────────────────────────────────────────────────────────
export function traitColSpan(facture: Facture, tot: FactureTotauxState): void {
    tot.colSpanTot0 = 1;
    if (facture.regimeTva === 'B') {
        if (Number(facture.acompTaux) > 0 || facture.regimeTva === 'B') tot.colSpanTot0 += 1;
        if (facture.codeType === 10 && Number(facture.acompTaux) > 0)   tot.colSpanTot0 += 1;
        if (facture.codeType === 10 && Number(facture.acompTaux) > 0)   tot.colSpanTot0 += 1;
        if (facture.codeType === 30) {
            if (tot.imputAcomp0 === '3') tot.colSpanTot0 += 2;
            else if (
                parseFloat(String(facture.acompMont ?? '0').replace(',', '.')) > 0 ||
                parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) > 0
            ) {
                tot.colSpanTot0 += 2;
            }
        }
        tot.colSpanTot0 += 1; // Colonne Montant TVA
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// traitLibTotaux — libellés et montants des lignes "Total Final"
// ─────────────────────────────────────────────────────────────────────────────
export function traitLibTotaux(facture: Facture, tot: FactureTotauxState): void {
    tot.arrTot10 = [];
    tot.arrTot20 = [];
    tot.arrTot30 = [];
    tot.arrTot40 = [];
    tot.arrTot50 = [];
    const acompTaux   = Number(facture.acompTaux);
    const remTot      = String(facture.remTot ?? '0,00');
    const remTotN     = n(remTot);
    const imputCreCli = n(facture.imputCreCli);
    const coche       = (facture as Record<string, unknown>).cocheImputSoldeClient0 === true;
    const imputAcomp  = String(tot.imputAcomp0 ?? '0');
    const hasAcomp    = imputAcomp === '2' || imputAcomp === '3';
    // ──────────────────────────────────────────────────────────────
    switch (facture.codeType) {
        case 10: { // Devis ----------------------
            switch (true) {
                case (acompTaux === 0 && remTotN === 0): // Sans Acompte et Sans Remise
                    tot.arrTot10      = ['Total TTC', numberToFrStr(facture.totTtc), '1'];
                    tot.numLigneGras0 = 0;
                    break;
                case (acompTaux === 0 && remTotN !== 0): // Sans Acompte et Avec remise
                    tot.arrTot10      = ['Total TTC', numberToFrStr(facture.totTtc), '1'];
                    tot.numLigneGras0 = 0;
                    tot.arrTot20      = [ facture.regimeTva === 'B' ? 'dont Remise HT' : 'dont Remise', remTot, '0' ];
                    break;
                case (acompTaux !== 0 && remTotN === 0): // AVEC Acompte et Sans Remise
                    tot.arrTot10     = ['Total TTC', numberToFrStr(facture.totTtc), '0'];
                    tot.arrTot20      = [`Acompte (${facture.acompTaux}%) Dû`, facture.acompMont ?? '0,00', '1'];
                    tot.numLigneGras0 = 1;
                    break;
                case (acompTaux !== 0 && remTotN !== 0): // AVEC Acompte AVEC remise
                    tot.arrTot10      = ['Total TTC', numberToFrStr(facture.totTtc), '0'];
                    tot.arrTot20      = [facture.regimeTva === 'B' ? 'dont Remise HT' : 'dont Remise', remTot, '0'];
                    tot.arrTot30      = [`Acompte (${facture.acompTaux}%) Dû`, facture.acompMont ?? '0,00', '1'];
                    tot.numLigneGras0 = 2;
                    break;
            }
            // Dimensions PDF
            if (facture.regimeTva === 'B') {
                tot.dimLigTotGauche0 = acompTaux === 0 ? 141 : 151;
                tot.dimLigTotDroit0  = acompTaux === 0 ? 46  : 39;
            } else {
                tot.dimLigTotGauche0 = 136;
                tot.dimLigTotDroit0  = 50;
            }
            break;
        }
        case 20: { // Facture Acompte -----------------------
            const totRegl = numberToFrStr((facture as Record<string, unknown>).totRegl as number | null);
            tot.arrTot10 = ['Total TTC', totRegl, '1'];
            tot.numLigneGras0 = 0;
            if (facture.regimeTva === 'B') {
                tot.dimLigTotGauche0 = 140; tot.dimLigTotDroit0 = 47;
            } else {
                tot.dimLigTotGauche0 = 136; tot.dimLigTotDroit0 = 50;
            }
            break;
        }
        case 30: { // Facture ---------------------
            const totBrut  = numberToFrStr((facture as Record<string, unknown>).totBrutTtc0 as number | null);
            const totTtc   = numberToFrStr(facture.totTtc);
            const acompMt  = facture.acompMont ?? '0,00';
            const imputStr = numberToFrStr(facture.imputCreCli);
            switch (true) {
                case (remTotN === 0 && !hasAcomp && imputCreCli === 0 && !coche): // Sans Remise, Sans Acompte, Sans Excédent
                    tot.arrTot10      = ['Total TTC Dû ', totTtc, '1'];
                    tot.numLigneGras0 = 0;
                    break;
                case (remTotN === 0 && !hasAcomp && (imputCreCli !== 0 || coche)): // Sans Remise, Sans Acompte, AVEC Excédent
                    tot.arrTot10      = ['Total TTC', totTtc, '0'];
                    tot.arrTot20      = ['Imputation Crédit', imputStr, '0'];
                    tot.arrTot30      = ['Total TTC Dû ', fr(n(totTtc) - n(imputStr)), '1'];
                    tot.numLigneGras0 = 2;
                    break;
                case (remTotN === 0 && hasAcomp && imputCreCli === 0 && !coche): // Sans Remise, AVEC Acompte, Sans Excédent
                    if (facture.regimeTva === 'B') { // Imposition TVA
                        tot.arrTot10      = ['Total TTC Dû ', totTtc, '1'];
                        tot.numLigneGras0 = 0;
                    } else { // Franchise TVA
                        tot.arrTot10      = ['Total TTC', totBrut, '0'];
                        tot.arrTot20      = ['Acompte réglé', acompMt, '0'];
                        tot.arrTot30      = ['Total TTC Dû ', totTtc, '1'];
                        tot.numLigneGras0 = 2;
                    }
                    break;
                case (remTotN === 0 && hasAcomp && (imputCreCli !== 0 || coche)): // Sans Remise, AVEC Acompte, AVEC Excédent
                    tot.arrTot10          = ['Total TTC', totBrut, '0'];
                    if (facture.regimeTva === 'B') { // Imposition TVA
                        tot.arrTot20      = ['Imputation Crédit', imputStr, '0'];
                        tot.arrTot30      = ['Total TTC Dû ', totTtc, '1'];
                        tot.numLigneGras0 = 2;
                    } else { // Franchise TVA
                        tot.arrTot20      = ['Acompte réglé', acompMt, '0'];
                        tot.arrTot30      = ['Imputation Crédit', imputStr, '0'];
                        tot.arrTot40      = ['Total TTC Dû ', totTtc, '1'];
                        tot.numLigneGras0 = 3;
                    }
                    break;
                case (remTotN !== 0 && !hasAcomp && imputCreCli === 0 && !coche): // AVEC Remise, Sans Acompte, Sans Excédent
                    tot.arrTot10      = ['Total TTC Dû ', totTtc, '1'];
                    tot.numLigneGras0 = 0;
                    tot.arrTot20 = [
                        facture.regimeTva === 'B' ? 'dont Remise HT' : 'dont Remise',
                        remTot, '0'
                    ];
                    break;
                case (remTotN !== 0 && !hasAcomp && (imputCreCli !== 0 || coche)): // AVEC Remise, Sans Acompte, AVEC Excédent
                    tot.arrTot10      = ['Total TTC', totTtc, '0'];
                    tot.arrTot20      = [
                        facture.regimeTva === 'B' ? 'dont Remise HT' : 'dont Remise',
                        remTot, '0'
                    ];
                    tot.arrTot30      = ['Imputation Crédit', imputStr, '0'];
                    tot.arrTot40      = ['Total TTC Dû ', fr(n(totTtc) - n(imputStr)), '1'];
                    tot.numLigneGras0 = 3;
                    break;
                case (remTotN !== 0 && hasAcomp && imputCreCli === 0 && !coche): // AVEC Remise, AVEC Acompte, Sans Excédent
                    if (facture.regimeTva === 'B') { // Imposition TVA
                        tot.arrTot10      = ['Total TTC Dû ', totTtc, '1'];
                        tot.numLigneGras0 = 0;
                        tot.arrTot20      = ['dont Remise HT', remTot, '0'];
                    } else { // Franchise TVA
                        tot.arrTot10      = ['Total TTC', totBrut, '0'];
                        tot.arrTot20      = ['dont Remise', remTot, '0'];
                        tot.arrTot30      = ['Acompte réglé', acompMt, '0'];
                        tot.arrTot40      = ['Total TTC Dû ', totTtc, '1'];
                        tot.numLigneGras0 = 3;
                    }
                    break;
                case (remTotN !== 0 && hasAcomp && (imputCreCli !== 0 || coche)): // AVEC Remise, AVEC Acompte, AVEC Excédent
                    tot.arrTot10          = ['Total TTC', totBrut, '0'];
                    if (facture.regimeTva === 'B') { // Imposition TVA
                        tot.arrTot20      = ['dont Remise HT', remTot, '0'];
                        tot.arrTot30      = ['Imputation Crédit', imputStr, '0'];
                        tot.arrTot40      = ['Total TTC Dû ', totTtc, '1'];
                        tot.numLigneGras0 = 3;
                    } else { // Franchise TVA
                        tot.arrTot20      = ['dont Remise', remTot, '0'];
                        tot.arrTot30      = ['Acompte réglé', acompMt, '0'];
                        tot.arrTot40      = ['Imputation Crédit', imputStr, '0'];
                        tot.arrTot50      = ['Total TTC Dû ', totTtc, '1'];
                        tot.numLigneGras0 = 4;
                    }
                    break;
            }
            // Dimensions PDF
            if (facture.regimeTva === 'B') {
                tot.dimLigTotGauche0 = imputAcomp !== '3' ? 139 : 153;
                tot.dimLigTotDroit0  = imputAcomp !== '3' ? 50  : 35;
            } else {
                tot.dimLigTotGauche0 = 136;
                tot.dimLigTotDroit0  = 50;
            }
            break;
        }
        case 40: { // Facture d'Avoir --------------------------
            const totTtc  = numberToFrStr(facture.totTtc);
            const totRegl = numberToFrStr(facture.totRegl);
            const acompMt = facture.acompMont ?? '0,00';
            //const totRegl = String((facture as Record<string, unknown>).totRegl ?? '0,00');
            if (facture.regimeTva === 'A') { // Franchise TVA
                if (n(acompMt) !== 0) {
                    tot.arrTot10      = ['Acompte réglé', acompMt, '0'];
                    tot.arrTot20      = ['Total TTC', totTtc, '1'];
                    tot.numLigneGras0 = 1;
                } else {
                    tot.arrTot10      = ['Total TTC', totRegl === '0,00' ? totTtc : totRegl, '1'];
                    tot.numLigneGras0 = 0;
                }
            } else {
                tot.arrTot10      = ['Total TTC', n(totRegl) === 0 ? totTtc : totRegl, '1'];
                tot.numLigneGras0 = 0;
            }
            // Dimensions PDF
            if (facture.regimeTva === 'B') {
                tot.dimLigTotGauche0 = 139; tot.dimLigTotDroit0 = 50;
            } else {
                tot.dimLigTotGauche0 = 136; tot.dimLigTotDroit0 = 50;
            }
        }
    }
}
