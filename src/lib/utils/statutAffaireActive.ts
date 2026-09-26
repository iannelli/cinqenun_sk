
import { type Abonne, parseSuiviFacAbonne, buildSuiviFacAbonne, parseNbrMontAffaire, buildNbrMontAffaire } from '$lib/schemas/abonne';
import { type Affaire, buildSuiviFacAffaire }                                                              from '$lib/schemas/affaire';
import { type Facture, parseDateEcheance }                                                                 from '$lib/schemas/facture';
import { calculerDelaiJours } from '$lib/utils/format';

export type StatutAffaireActiveResult = {
    action:           'update' | 'delete';
    suiviFacAvant:   string | null;   // ancienne valeur de affaire.suiviFac
    affaireData?:     {
        statutCode:   number;
        statutLib:    string;
        situation:    string;
        suiviFac:     string | null;
        facValide:    number;
        archived:     number;
    };
    facturesToUpdate: { id:number; statutCode:number; statut:string }[];
    abonneData: { nbrMontAffaire:string; suiviFac:string };
};

// Traitement réservé aux Affaires Actives ────────────────────────────
export function statutAffaireActive(abonne:Abonne, affaire:Affaire, factures:Facture[]):StatutAffaireActiveResult {
    // ─── Compteurs abonné désérialisés ────────────────────────────
    const nbrMontArray = parseNbrMontAffaire(abonne.nbrMontAffaire);
    const nbrSuiviFac  = parseSuiviFacAbonne(abonne.suiviFac);

    // ═════════════════════════════════════════════════════════════
    // ─── §-I des Spécifications - Affaire SANS facture
    // ═════════════════════════════════════════════════════════════
    if (!factures || factures.length === 0) {
        const nbreJour0 = calculerDelaiJours(new Date(affaire.updatedAt).toLocaleDateString('fr-FR')) ?? 0;
        if (nbreJour0 > 270) {
            nbrMontArray[0] = Math.max(0, nbrMontArray[0] - 1);
            nbrSuiviFac[0]  = String(Math.max(0, Number(nbrSuiviFac[0]) - 1));
            return {
                action:           'delete',
                suiviFacAvant:   affaire.suiviFac ?? null,
                facturesToUpdate: [],
                abonneData: {
                    nbrMontAffaire: buildNbrMontAffaire(nbrMontArray),
                    suiviFac:       buildSuiviFacAbonne(nbrSuiviFac)
                }
            };
        } else { // Affaire passant de '10x' (Affaire ne comportant que devis ou facture) à '00x'
            nbrMontArray[1] = Math.max(0, nbrMontArray[0] - 1);
            nbrSuiviFac[1]  = String(Math.max(0, Number(nbrSuiviFac[0]) - 1));
            nbrMontArray[0] = Math.max(0, nbrMontArray[0] + 1);
            nbrSuiviFac[0]  = String(Math.max(0, Number(nbrSuiviFac[0]) + 1));
            return {
                action: 'update',
                suiviFacAvant:   affaire.suiviFac ?? null,
                affaireData: {
                    statutCode: 0,
                    statutLib:  "<mark style='background:gray;color:white'>Affaire à Initier",
                    situation:  '00x',
                    suiviFac:   '0|0,00|0|0,00|0|0,00|0|0,00|0|0,00|0|0,00|0|0,00|0|0,00',
                    facValide:  0,
                    archived:   0,
                },
                facturesToUpdate: [],
                abonneData: {
                    nbrMontAffaire: buildNbrMontAffaire(nbrMontArray),
                    suiviFac:       buildSuiviFacAbonne(nbrSuiviFac)
                }
            };
        }
    } else {
        // ═════════════════════════════════════════════════════════════
        // ───  §-II des Spécifications - Affaire AVEC factures : Détermination du Statut de chaque Facture
        // ═════════════════════════════════════════════════════════════
        // ─── Initialisation des variables : cf. §-II.1 des Spécifications ────────────────────────────
        let facValide0        = 0;
        let affStatutCodeMaj0 = 0;
        let affStatutMaj0     = '';
        const facturesToUpdate: { id: number; statutCode: number; statut: string }[] = [];
        const suiviFac: (number | string)[] = Array(16).fill(0);
        // ─── §-II.2 des Spécifications - Examen de tous les Documents de l’affaire ────────────────────────────
        factures.forEach((fac) => {
            // ──  §-II.2.1 des Spécifications - Détermination du Statut du Devis ou Facture ────────────────────────────
            if ([1, 2, 20, 21, 22, 28].includes(Number(fac.statutCode))) { // FactureAnnulé - DevisAcompteRéglé - FactureAcompteRéglé - Facture*A*Annuler
                if (fac.statutCode === affStatutCodeMaj0 && String(fac.statut ?? '').includes('Facture Réglée')) {
                    affStatutMaj0 = fac.statut;
                }
                if (fac.statutCode > affStatutCodeMaj0) {
                    affStatutCodeMaj0 = fac.statutCode;
                    affStatutMaj0     = fac.statut;
                }
            }
            if ([3, 4, 5, 6, 13, 14, 15, 16, 23, 24, 25, 26].includes(Number(fac.statutCode))) { // Devis - FactureBrouillon - FactureValidée
                const { code:newCode, statut:newStatut } = affecteStatutFacture(fac);
                if (newCode > fac.statutCode) {
                    fac.statutCode = newCode;
                    fac.statut     = newStatut;
                    facturesToUpdate.push({ id:fac.id, statutCode:newCode, statut:newStatut });
                }
                if (fac.statutCode    >= affStatutCodeMaj0) {
                    affStatutCodeMaj0 = fac.statutCode;
                    affStatutMaj0     = fac.statut;
                }
            }
            if (fac.statutCode === 27) { // Facture Réglée Partiellement
                const { statut: newStatut } = affecteStatutFacture(fac);
                // Le statut "Réglée partiellement" est toujours prioritaire
                fac.statut        = newStatut;
                facturesToUpdate.push({ id: fac.id, statutCode: fac.statutCode, statut: newStatut });
                affStatutCodeMaj0 = fac.statutCode;
                affStatutMaj0     = newStatut;
            }
            // ── §-II.2.2  des Spécifications - Totalisation du C.A. de la facture de l’Affaire ───────────────────────────
            // Maj de suiviFac et de facValide. Cette totalisation ne concerne pas les "Factures Brouillon" --------
            if (fac.codeType == 10 && [3, 4, 5, 6].includes(Number(fac.statutCode))) { // Devis "avecAcompte nonRéglé" ou "sansAcompte nonSigné"
                const nbreJour0 = calculerDelaiJours(new Date(fac.dateEmis).toLocaleDateString('fr-FR')) ?? 0;
                if (nbreJour0 < 90) {
                    suiviFac[0] = (suiviFac[1] as number) + 1;
                    suiviFac[1] = (suiviFac[2] as number) + (fac.solde ?? 0);
                } else {
                    suiviFac[2] = (suiviFac[3] as number) + 1;
                    suiviFac[3] = (suiviFac[4] as number) + (fac.solde ?? 0);
                }
            }
            if (fac.codeType == 10 && fac.statutCode == 20) {
                if ((fac.acompTaux ?? 0) > 0) { // Devis "avecAcompte Réglé"
                    suiviFac[6] = (suiviFac[7] as number) + 1;
                    suiviFac[7] = (suiviFac[8] as number) + (fac.solde ?? 0);
                } else { // Devis "sansAcompte Signé"
                    suiviFac[4] = (suiviFac[5] as number) + 1;
                    suiviFac[5] = (suiviFac[6] as number) + (fac.solde ?? 0);
                }
                facValide0 = 1;
            }
            if ([23, 24, 25, 26].includes(Number(fac.statutCode))) { // Facture nonRéglée
                if ([23, 24, 25].includes(Number(fac.statutCode))) { // avec Echéance enCours
                    suiviFac[8] = (suiviFac[9] as number) + 1;
                    suiviFac[9] = (suiviFac[10] as number) + (fac.totTtc ?? 0);
                }
                if (fac.statutCode == 26) { // avec Echéance dépassée
                    suiviFac[10] = (suiviFac[9] as number) + 1;
                    suiviFac[11] = (suiviFac[10] as number) + (fac.totTtc ?? 0)
                }
                facValide0 = 1;
            }
            if ([21, 22, 27].includes(Number(fac.statutCode))) { // Facture Réglée
                if ([21, 22].includes(Number(fac.statutCode))) { // avec Règlement total ou excédentaire
                    suiviFac[12] = (suiviFac[13] as number) + 1;
                    suiviFac[13] = (suiviFac[14] as number) + (fac.totRegl ?? 0);
                }
                if (fac.statutCode == 27) { // avec Règlement partiel
                    suiviFac[14] = (suiviFac[15] as number) + 1;
                    suiviFac[15] = (suiviFac[16] as number) + (fac.totRegl ?? 0)
                }
                facValide0 = 1;
            }
        }); // FIN forEach

        // ═════════════════════════════════════════════════════════════
        // Traitement Final de l’Affaire : cf. §-IV des Spécifications
        // ═════════════════════════════════════════════════════════════
        // ─── §-IV.1 des Spécifications - Détermination du statut de l'Affaire (statutCode et statut) ────────────────────
        let newStatutCode = affaire.statutCode ?? 0;
        let newStatutLib  = affaire.statutLib  ?? '';
        if ([1, 2].includes(Number(affStatutCodeMaj0)) && newStatutCode !== affStatutCodeMaj0) { // L'affaire ne contient que des Factures Annulées
            newStatutCode = affStatutCodeMaj0;
            newStatutLib  = "<mark style='background:gray;color:white'>Affaire à Initier";
        }
        if ([3, 4, 5, 6, 13, 14, 15, 16, 20, 21, 22].includes(Number(affStatutCodeMaj0)) && newStatutCode !== affStatutCodeMaj0) {
            newStatutCode = affStatutCodeMaj0;
            newStatutLib  = affStatutMaj0;
        }
        if ([23, 24, 25, 26, 28].includes(Number(affStatutCodeMaj0)) && (affaire.statutCode ?? 0) <= affStatutCodeMaj0) {
            newStatutCode = affStatutCodeMaj0;
            newStatutLib  = affStatutMaj0;
        }
        if (affStatutCodeMaj0 === 27 && newStatutLib !== affStatutMaj0) { // Facture Réglée partiellement
            newStatutCode = affStatutCodeMaj0;
            newStatutLib  = affStatutMaj0;
        }
        // ─── §-IV.2 des Spécifications - Détermination de la Catégorie de l'Affaire (affaire.situation) ──────────────────────
        let newSituation = affaire.situation ?? '';
        let archived     = 0;
        if (facValide0 === 0) {
            const nbreJour0 = calculerDelaiJours(new Date(affaire.updatedAt).toLocaleDateString('fr-FR')) ?? 0;
            if (nbreJour0 <= 90) { // 3 mois
                newSituation = '10x'; // Affaire en Attente
            } else if (nbreJour0 > 90 && nbreJour0 < 180) { // entre 3 et 6 mois
                newSituation = '11a';
                archived     = 1; // Archivage de l'Affaire et du(des) documents et Courrier)
            }
        } else {
            const montSolde = parseFloat(String(affaire.montSolde ?? '0').replace(',', '.')) || 0;
            if (montSolde <= 0) {
                const nbreJour0 = calculerDelaiJours(new Date(affaire.updatedAt).toLocaleDateString('fr-FR')) ?? 0;
                if (nbreJour0 < 90) { // 3 mois
                    newSituation = '30x'; // Affaire Soldée
                } else {
                    newSituation = '31a'; // Affaire enCours Soldée
                    archived     = 1; // Archivage de l'Affaire et du(des) documents et Courrier
                }
            } else {
                newSituation = '20x'; // Affaire enCours non-Soldée
            }
        }
        // ─── Formatage de affaire.suiviFac ──────────────────────
        const suiviFacStr = buildSuiviFacAffaire(suiviFac.map((v, i) => {
            const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) || 0 : v;
            return (i % 2 === 0)
                ? String(Math.round(n))           // index pairs  → entiers
                : n.toFixed(2).replace('.', ','); // index impairs → décimaux
        }));

        return {
            action:         'update',
            suiviFacAvant:   affaire.suiviFac ?? null,
            affaireData: {
                statutCode: newStatutCode,
                statutLib:  newStatutLib,
                situation:  newSituation,
                suiviFac:   suiviFacStr,
                facValide:  facValide0,
                archived,
            },
            facturesToUpdate,
            abonneData: {
                nbrMontAffaire: buildNbrMontAffaire(nbrMontArray),
                suiviFac:       suiviFacStr,
            },
        };
    }
}

// ─── affecteStatutFacture / traitCouleur inchangés ──────────────────
function affecteStatutFacture(fac:Facture): { code:number; statut:string } {
    const echeanceParsed = parseDateEcheance(fac.dateEcheance);
    if (!echeanceParsed) return { code:fac.statutCode, statut:fac.statut };
    const echeance = calculerDelaiJours(echeanceParsed.date0) ?? 0; // Calcul du nombre de jours restants
    const d = echeanceParsed.date0;
    if ([3, 4, 5, 6].includes(Number(fac.statutCode))) { // Devis en Attente à échéance
        if (echeance > 20)                    return { code:3,  statut:`<mark style='background:white;color:#66C909'>Devis Echéance <strong>${d}` };
        if (echeance <= 20 && echeance > 10)  return { code:4,  statut:`<mark style='background:white;color:#FC9B05'>Devis Echéance <strong>${d}` };
        if (echeance <= 10 && echeance > 0)   return { code:5,  statut:`<mark style='background:white;color:#FC6A05'>Devis Echéance <strong>${d}` };
        if (echeance <= 0)                    return { code:6,  statut:`<mark style='background:white;color:#FC1B05'>Devis Echéance <strong>${d}` };
    }
    if ([13, 14, 15, 16].includes(Number(fac.statutCode))) { // Facture 'Brouillon' à échéance
        if (echeance >  20)                    return { code:13, statut:`<mark style='background:white;color:#66C909'>Facture brouillon Echéance <strong>${d}` };
        if (echeance <= 20 && echeance > 10)   return { code:14, statut:`<mark style='background:white;color:#FC9B05'>Facture brouillon Echéance <strong>${d}` };
        if (echeance <= 10 && echeance > 0)    return { code:15, statut:`<mark style='background:white;color:#FC6A05'>Facture brouillon Echéance <strong>${d}` };
        if (echeance <= 0)                     return { code:16, statut:`<mark style='background:white;color:#FC1B05'>Facture brouillon Echéance <strong>${d}` };
    }
    if ([23, 24, 25, 26].includes(Number(fac.statutCode))) { // facture 'validée' à échéance
        if (echeance >  20)                    return { code:23, statut:`<mark style='background:white;color:#66C909'>Facture Echéance <strong>${d}` };
        if (echeance <= 20 && echeance > 10)   return { code:24, statut:`<mark style='background:white;color:#FC9B05'>Facture Echéance <strong>${d}` };
        if (echeance <= 10 && echeance > 0)    return { code:25, statut:`<mark style='background:white;color:#FC6A05'>Facture Echéance <strong>${d}` };
        if (echeance <= 0)                     return { code:26, statut:`<mark style='background:white;color:#FC1B05'>Facture Echéance <strong>${d}` };
    }
    if (fac.statutCode === 27) { // Facture Réglée partiellement
        if (echeance >  20)                    return { code:27, statut:`<mark style='background:white;color:#66C909'>Facture Réglée partiellement Echéance <strong>${d}` };
        if (echeance <= 20 && echeance > 10)   return { code:27, statut:`<mark style='background:white;color:#FC9B05'>Facture Réglée partiellement Echéance <strong>${d}` };
        if (echeance <= 10 && echeance > 0)    return { code:27, statut:`<mark style='background:white;color:#FC6A05'>Facture Réglée partiellement Echéance <strong>${d}` };
        if (echeance <= 0)                     return { code:27, statut:`<mark style='background:white;color:#FC1B05'>Facture Réglée partiellement Echéance <strong>${d}` };
    }
    return { code:fac.statutCode, statut:fac.statut };
}
