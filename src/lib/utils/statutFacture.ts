import {  type Facture, parseDateEcheance, serializeDateEcheance } from '$lib/schemas/facture';
import { calculerDelaiJours }                                      from '$lib/utils/format';

export function statutFacture(facture:Facture): void {
    // ─── Parsing de la date d'échéance ────────────────────────────
    const echeanceParsed = parseDateEcheance(facture.dateEcheance);
    if (!echeanceParsed) return;
    // ─── Calcul du nombre de jours restants ───────────────────────
    const echeance = calculerDelaiJours(echeanceParsed.date0) ?? 0;

    // ─── Détermination de la couleur et du statut ─────────────────
    let couleur = '';
    switch (true) {
        case echeance > 20:
            couleur = '#66C909';
            if (facture.codeType === 10) {
                facture.statutCode = 3;
                facture.statut     = `<mark style='background:white;color:#66C909'>Echéance <strong>${echeanceParsed.date0}`;
            }
            if (facture.codeType === 30) {
                if (facture.statutCode == 27) {
                   facture.statut  = `<mark style='background:white;color:#66C909'>Facture Réglée partiellement Echéance <strong>${echeanceParsed.date0}`
                } else {
                    if (facture.refFac.slice(0, 2) === 'FB') {
                        facture.statutCode = 13;
                        facture.statut     = `<mark style='background:white;color:#66C909'>Facture brouillon Echéance <strong>${echeanceParsed.date0}`;
                    } else {
                        facture.statutCode = 23;
                        facture.statut     = `<mark style='background:white;color:#66C909'>Facture Echéance <strong>${echeanceParsed.date0}`;
                    }
                }
            }
            break;
        case echeance <= 20 && echeance > 10:
            couleur = '#FC9B05';
            if (facture.codeType === 10) {
                facture.statutCode = 4;
                facture.statut     = `<mark style='background:white;color:#FC9B05'>Echéance <strong>${echeanceParsed.date0}`;
            }
            if (facture.codeType === 30) {
                if (facture.statutCode == 27) {
                    facture.statut = `<mark style='background:white;color:#FC9B05'>Facture Réglée partiellement Echéance <strong>${echeanceParsed.date0}`
                 } else {
                    if (facture.refFac.slice(0, 2) === 'FB') {
                        facture.statutCode = 14;
                        facture.statut     = `<mark style='background:white;color:#FC9B05'>Facture brouillon Echéance <strong>${echeanceParsed.date0}`;
                    } else {
                        facture.statutCode = 24;
                        facture.statut     = `<mark style='background:white;color:#FC9B05'>Facture Echéance <strong>${echeanceParsed.date0}`;
                    }
                }
            }
            break;
        case echeance <= 10 && echeance > 0:
            couleur = '#FC6A05';
            if (facture.codeType === 10) {
                facture.statutCode = 5;
                facture.statut     = `<mark style='background:white;color:#FC6A05'>Echéance <strong>${echeanceParsed.date0}`;
            }
            if (facture.codeType === 30) {
                if (facture.statutCode == 27) {
                    facture.statut = `<mark style='background:white;color:#FC6A05'>Facture Réglée partiellement Echéance <strong>${echeanceParsed.date0}`
                } else {
                    if (facture.refFac.slice(0, 2) === 'FB') {
                        facture.statutCode = 15;
                        facture.statut     = `<mark style='background:white;color:#FC6A05'>Facture brouillon Echéance <strong>${echeanceParsed.date0}`;
                    } else {
                        facture.statutCode = 25;
                        facture.statut     = `<mark style='background:white;color:#FC6A05'>Facture Echéance <strong>${echeanceParsed.date0}`;
                    }
                }
            }
            break;
        case echeance < 0:
            couleur = '#FC1B05';
            if (facture.codeType === 10) {
                facture.statutCode = 6;
                facture.statut     = `<mark style='background:white;color:#FC1B05'>Echéance <strong>${echeanceParsed.date0}`;
            }
            if (facture.codeType === 30) {
                if (facture.statutCode == 27) {
                    facture.statut = `<mark style='background:white;color:#FC1B05'>Facture Réglée partiellement Echéance <strong>${echeanceParsed.date0}`
                } else {
                    if (facture.refFac.slice(0, 2) === 'FB') {
                        facture.statutCode = 16;
                        facture.statut     = `<mark style='background:white;color:#FC1B05'>Facture brouillon Echéance <strong>${echeanceParsed.date0}`;
                    } else {
                        facture.statutCode = 26;
                        facture.statut     = `<mark style='background:white;color:#FC1B05'>Facture Echéance <strong>${echeanceParsed.date0}`;
                    }
                }
            }
    };
    // ─── Mise à jour de la couleur dans facture.dateEcheance ──────
    if (couleur) {
        echeanceParsed.couleurHtml0 = couleur;
        facture.dateEcheance = serializeDateEcheance(echeanceParsed);
    }
}