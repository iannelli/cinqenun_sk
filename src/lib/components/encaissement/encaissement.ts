import type { Recette, RecetteTraitement } from '$lib/schemas/recette';
import type { Facture } from '$lib/schemas/facture';
import type { Abonne } from '$lib/schemas/abonne';
import { deserialize } from '$app/forms';

export type BandeauState = {
    message: string;
    succes:  boolean;
    visible: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Variables de calcul partagées entre les fonctions du module
// ─────────────────────────────────────────────────────────────────────────────
export let cumulPresta0 = 0;
export let cumulVente0  = 0;
export let calMontTva0  = 0;
export function resetCumulateurs() {
    cumulPresta0 = 0;
    cumulVente0  = 0;
    calMontTva0  = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Création de la Facture d'Acompte + Recette correspondante [devis.codeType == 10]
// Le serveur calcule lui-même refFac (attribuerNumeroFacture atomique),
// statutCode (21) et statut — inutile de les recalculer côté client.
// ─────────────────────────────────────────────────────────────────────────────
export async function createFacAcompteRec(
    coef:        number,
    devis:       Facture,
    facAcompte:  Facture,
    recette:     Recette,
    rtData:      RecetteTraitement,
    abonne:      Abonne,
    nature:      string,
    setBandeau:  (state: BandeauState) => void,
    setBtnNonOk: (val: boolean) => void,
): Promise<{ ok: boolean; recetteId?: number }> {
  
    // ── 1. Confection des lignes de Totalisation ───────────────────────────
    const facTotalArray0 = (devis.total ?? '').split('|');
    type LigneCalc = { ligArray: string[]; montHtCents: number; montTvaCents: number; montTtcCents: number };
    const lignesCalc: LigneCalc[] = [];
    for (let i = 0; i < facTotalArray0.length; i++) {
        const ligArray = facTotalArray0[i].split('¤');
        if (ligArray[0].slice(4, 6) != '20') { // exclut les Débours
            const cal1        = ligArray[3].replace(/[,]/, '');
            const cal2         = Number(cal1) * coef;
            const montHtCents  = Math.round(cal2);
            ligArray[2] = ((montHtCents / 100).toFixed(2)).replace(/[.]/, ',');
            ligArray[3] = '';
            ligArray[4] = ligArray[2];
            let montTvaCents = 0;
            let montTtcCents: number;
            if (devis.regimeTva == 'B') {
                const tauxTva = (ligArray[0].slice(0, 4)).replace(/[,]/, '.');
                montTvaCents  = Math.round((montHtCents * Number(tauxTva)) / 100);
                ligArray[5]   = ((montTvaCents / 100).toFixed(2)).replace(/[.]/, ',');
                montTtcCents  = montHtCents + montTvaCents;
                ligArray[6]   = ((montTtcCents / 100).toFixed(2)).replace(/[.]/, ',');
            } else {
                ligArray[5]  = '0,00';
                ligArray[6]  = ligArray[4];
                montTtcCents = montHtCents;
            }
            lignesCalc.push({ ligArray, montHtCents, montTvaCents, montTtcCents });
        }
    }
  
    // ── Correction de l'arrondi : le reste est affecté à la DERNIÈRE ligne ──
    if (lignesCalc.length > 0) {
        const totalCibleCents  = Math.round((rtData.acompteMont0 ? Number(rtData.acompteMont0.replace(',', '.')) : 0) * 100);
        const sommeLignesCents = lignesCalc.reduce((acc, l) => acc + l.montTtcCents, 0);
        const diffCents        = totalCibleCents - sommeLignesCents;
        if (diffCents !== 0) {
            const derniere = lignesCalc[lignesCalc.length - 1];
            if (devis.regimeTva == 'B') {
                derniere.montTvaCents += diffCents;
                derniere.ligArray[5]   = ((derniere.montTvaCents / 100).toFixed(2)).replace(/[.]/, ',');
                derniere.montTtcCents += diffCents;
                derniere.ligArray[6]   = ((derniere.montTtcCents / 100).toFixed(2)).replace(/[.]/, ',');
            } else {
                derniere.montHtCents  += diffCents;
                derniere.montTtcCents += diffCents;
                derniere.ligArray[4]   = ((derniere.montHtCents / 100).toFixed(2)).replace(/[.]/, ',');
                derniere.ligArray[2]   = derniere.ligArray[4];
                derniere.ligArray[6]   = derniere.ligArray[4];
            }
        }
    }
  
    // ── Sérialisation finale + construction de ventilTva ────────────────────
    const facTotalAcompteArray0: string[] = [];
    for (const l of lignesCalc) {
        facTotalAcompteArray0.push(l.ligArray.join('¤'));
        if (devis.regimeTva == 'B') {
            const ventilLigne = l.ligArray[0].slice(0, 4) + '¤' + l.ligArray[2] + '¤' + l.ligArray[5];
            recette.ventilTva = (recette.ventilTva ?? '').length == 0
            ? ventilLigne
            : recette.ventilTva + '|' + ventilLigne;
        } else {
            recette.ventilTva = '00,0' + '¤' + (rtData.acompteMont0 ?? '0,00') + '¤' + '0,00';
        }
    }
    facAcompte.total = facTotalAcompteArray0.join('|');
  
    // ── Duplication directe des sommes depuis les lignes (au lieu d'accumulateurs séparés) ──
    const totVenteHtCents  = lignesCalc.filter(l => l.ligArray[0].slice(4, 6) == '00').reduce((acc, l) => acc + l.montHtCents, 0);
    const totPrestaHtCents = lignesCalc.filter(l => l.ligArray[0].slice(4, 6) != '00').reduce((acc, l) => acc + l.montHtCents, 0);
    const totTvaCents      = lignesCalc.reduce((acc, l) => acc + l.montTvaCents, 0);
    facAcompte.totVenteHt  = Number((totVenteHtCents  / 100).toFixed(2));
    facAcompte.totPrestaHt = Number((totPrestaHtCents / 100).toFixed(2));
  
    // ── 2. Initialisation des données de facAcompte ──────────────────────────
    facAcompte.codeType     = 20;
    facAcompte.refDevis     = devis.refFac;
    facAcompte.refPre       = '';
    facAcompte.client       = devis.client;
    facAcompte.regimeTva    = devis.regimeTva;
    facAcompte.dateEmis     = new Date();
    facAcompte.typeDelai    = 0;
    facAcompte.delai        = 0;
    facAcompte.dateEcheance = new Date().toLocaleDateString("fr-FR");
    facAcompte.ligne        = '';
    facAcompte.remTot       = 0;
    facAcompte.totTtc       = rtData.acompteMont0 != null ? parseFloat(rtData.acompteMont0.replace(',', '.')) : null;
    facAcompte.acompTaux    = null;
    facAcompte.acompMont    = '';
    facAcompte.dateRegl     = recette.dateRegl ? recette.dateRegl.toLocaleDateString("fr-FR") : null;
    facAcompte.imputCreCli  = 0;
    facAcompte.totRegl      = rtData.acompteMont0 != null ? parseFloat(rtData.acompteMont0.replace(',', '.')) : null;
    facAcompte.montCli      = 0;
    facAcompte.solde        = 0;
    facAcompte.penalite     = '';
    facAcompte.soldePenalite = null;
    facAcompte.clientId     = devis.clientId;
    facAcompte.abonneId     = devis.abonneId;
  
    // ── 3. Duplication directe pour la Recette (au lieu de recalculer) ──────
    recette.montHt  = ((totVenteHtCents + totPrestaHtCents) / 100).toFixed(2).replace('.', ',');
    recette.montTva = (totTvaCents / 100).toFixed(2).replace('.', ',');
    // recette.montTtc et recette.montRegl restent directement rtData.acompteMont0 (déjà le cas, voir §4)
  
    // ── 4. Création transactionnelle Facture + Recette via action serveur ───
    const fd = new FormData();
    fd.append('refDevis',    facAcompte.refDevis        ?? '');
    fd.append('client',      facAcompte.client          ?? '');
    fd.append('regimeTva',   facAcompte.regimeTva       ?? '');
    fd.append('dateEmis',    facAcompte.dateEmis.toISOString());
    fd.append('typeDelai',   String(facAcompte.typeDelai));
    fd.append('delai',       String(facAcompte.delai));
    fd.append('dateEcheance', facAcompte.dateEcheance    ?? '');
    fd.append('ligne',       facAcompte.ligne           ?? '');
    fd.append('total',       facAcompte.total           ?? '');
    fd.append('remTot',      String(facAcompte.remTot      ?? 0));
    fd.append('totTtc',      String(facAcompte.totTtc      ?? 0));
    fd.append('totPrestaHt', String(facAcompte.totPrestaHt ?? 0));
    fd.append('totVenteHt',  String(facAcompte.totVenteHt  ?? 0));
    fd.append('imputCreCli', String(facAcompte.imputCreCli ?? 0));
    fd.append('totRegl',     String(facAcompte.totRegl     ?? 0));
    fd.append('montCli',     String(facAcompte.montCli     ?? 0));
    fd.append('solde',       String(facAcompte.solde       ?? 0));
    fd.append('soldePenalite', String(facAcompte.soldePenalite ?? 0));
    fd.append('clientId',    String(facAcompte.clientId));
    fd.append('recDateEmis', recette.dateEmis.toISOString());
    fd.append('recDateRegl', recette.dateRegl?.toISOString() ?? new Date().toISOString());
    fd.append('cliNom',      recette.cliNom);
    fd.append('libelle',     recette.libelle);
    fd.append('modeRegl',    recette.modeRegl);
    fd.append('montRegl',    rtData.acompteMont0        ?? '0,00');
    fd.append('montHt',      recette.montHt             ?? '0,00');
    fd.append('ventilTva',   recette.ventilTva          ?? '');
    fd.append('montTva',     recette.montTva            ?? '0,00');
    fd.append('montTtc',     rtData.acompteMont0        ?? '0,00');
    fd.append('debours',     recette.debours            ?? '0,00');
    fd.append('penalite',    recette.penalite           ?? '0,00');
    fd.append('nature',      nature);
    try {
      const response = await fetch('?/createFactureAcompteRecette', { method: 'POST', body: fd });
      const result    = deserialize(await response.text());
      if (result.type === 'success') {
        const recetteId = (result.data as { recetteId?: number })?.recetteId;
        return { ok: true, recetteId };
      }
      setBandeau({ message: "Erreur lors de la création de la Facture d'Acompte et de l'Encaissement.", succes: false, visible: true });
      setBtnNonOk(false);
      return { ok: false };
    } catch {
      setBandeau({ message: "Erreur réseau lors de la création de la Facture d'Acompte et de l'Encaissement.", succes: false, visible: true });
      setBtnNonOk(false);
      return { ok: false };
    }
  }


// ─────────────────────────────────────────────────────────────────────────────
// Encaissement INITIAL sur une Facture IMPOSABLE à la TVA (regimeTva == 'B')
// Confection d'une occurrence de Recette et Mise à jour de la Facture correspondante 
// ─────────────────────────────────────────────────────────────────────────────
export function prepaRecetteInitTva(
    facture:  Facture,
    recette:  Recette,
    rtData:   RecetteTraitement,
): void {
    const saisi        = parseFloat((rtData.saisiAImputer0  ?? '0').replace(',', '.'));
    const montantDu    = parseFloat((rtData.facMontantDu0   ?? '0').replace(',', '.'));
    const aFacturer    = parseFloat((rtData.facMontFacturer0 ?? '0').replace(',', '.'));
    const facSolde     = parseFloat(String(facture.solde        ?? '0').replace(',', '.'));
    const facSoldePena = parseFloat(String(facture.soldePenalite ?? '0').replace(',', '.'));
    // ── II.1.1 – Détermination de l'opération ─────────────────────────────────
    const cal = saisi - montantDu;
    let ope0: 'C1' | 'C2' | 'C3';
    if      (cal < 0)   ope0 = 'C3'; // Encaissement Partiel
    else if (cal === 0) ope0 = 'C1'; // Encaissement Saisi Identique au montant Dû
    else                ope0 = 'C2'; // Encaissement Excédentaire
    // ── II.1.2 – Calcul du montant à imputer ──────────────────────────────────
    let aImputer = saisi <= aFacturer ? saisi : aFacturer;
    // ── II.2 – Imputation sur chaque ligne de facTotalRecetteArray2 ───────────
    for (const lig of rtData.facTotalRecetteArray2) { // "rt.facTotalRecetteArray2" = Agrégation des lignes de totalisation par Taux de Tva et Débours
        const soldeTtc = parseFloat(String(lig.soldeTtc ?? '0').replace(',', '.'));
        if (soldeTtc !== 0) {
            if (soldeTtc <= aImputer) {
                lig.imput  = soldeTtc.toFixed(2).replace('.', ',');
                aImputer  -= soldeTtc;
            } else {
                lig.imput  = aImputer.toFixed(2).replace('.', ',');
                aImputer   = 0;
            }
        }
    }
    // ── II.3 – Détermination de ventilTva et debours de la future occurrence de Recette ──────────────────────────
    let totMontHt  = 0;
    let totMontTva = 0;
    let totMontTtc = 0;
    recette.ventilTva = '';
    recette.debours   = '0,00';
    recette.penalite  = '0,00';
    // Détermination des données "recette.ventilTva" et "recette.debours"
    for (const lig of rtData.facTotalRecetteArray2) {
        const imput = parseFloat(String(lig.imput ?? '0').replace(',', '.'));
        if (imput !== 0) {
            const tva = String(lig.tva ?? '');
            if (tva === '00,0') { // Ligne Débours ----
                recette.debours = imput.toFixed(2).replace('.', ',');
            } else { // Ligne TVA ----
                totMontTtc += imput;
                const tauxTva = parseFloat(tva.replace(',', '.'));
                const montHt  = imput / (tauxTva / 100 + 1);
                const montTva = imput - montHt;
                totMontHt    += montHt;
                totMontTva   += montTva;
                const ventilLigne = tva + '¤' + montHt.toFixed(2).replace('.', ',') + '¤' + montTva.toFixed(2).replace('.', ',');
                if ((recette.ventilTva ?? '').length === 0) {
                    recette.ventilTva = ventilLigne;
                } else {
                    recette.ventilTva += '|' + ventilLigne;
                }
            }
        }
    }
    // ── II.4 – Traitement final ───────────────────────────────────────────────
    recette.montHt  = totMontHt.toFixed(2).replace('.', ',');
    recette.montTva = totMontTva.toFixed(2).replace('.', ',');
    recette.montTtc = totMontTtc.toFixed(2).replace('.', ',');
    if (saisi <= aFacturer) { // Règlement Partiel des données facturées ----
        recette.montRegl = saisi.toFixed(2).replace('.', ',');
        facture.solde    = facSolde - saisi;
    } else { // Règlement en Totalité des données facturées ----
        let reste = saisi - totMontTtc - parseFloat((recette.debours ?? '0').replace(',', '.'));
        rtData.saisiAImputer0     = reste.toFixed(2).replace('.', ',');
        if (reste <= facSoldePena) {
            recette.penalite      = reste.toFixed(2).replace('.', ',');
            facture.soldePenalite = facSoldePena - reste;
        } else {
            recette.penalite      = facSoldePena.toFixed(2).replace('.', ',');
            reste                -= facSoldePena;
            rtData.saisiAImputer0 = reste.toFixed(2).replace('.', ',');
            facture.soldePenalite = 0;
        }
        recette.montRegl = (
            totMontTtc +
            parseFloat((recette.debours  ?? '0').replace(',', '.')) +
            parseFloat((recette.penalite ?? '0').replace(',', '.'))
        ).toFixed(2).replace('.', ',');
        facture.solde = facSolde - parseFloat(recette.montRegl.replace(',', '.'));
    }
    // ── Finalisation selon l'opération ───────────────────────────────────────
    if (ope0 === 'C1') { // Le Montant Saisi est identique au Montant Dû
        facture.totRegl = parseFloat(recette.montRegl.replace(',', '.'));
        facture.montCli = 0;
    } else if (ope0 === 'C2') { // Encaissement Excédentaire
        facture.totRegl = parseFloat(recette.montRegl.replace(',', '.'));
        facture.montCli = parseFloat((rtData.saisiAImputer0 ?? '0').replace(',', '.')); // ← Maj du Compte Client via l'action 'createRecette' [src\routes\(app)\recette\+page.server.ts]
    } else { // C3 : Encaissement Partiel
        facture.totRegl = parseFloat(recette.montRegl.replace(',', '.'));
        facture.montCli = 0;
    }
    recette.nature = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Encaissement INITIAL sur une Facture en FRANCHISE de TVA
// Confection d'une occurrence de Recette et Mise à jour de la Facture correspondante 
// ─────────────────────────────────────────────────────────────────────────────
export function prepaRecetteInitFranchise(
    facture:  Facture,
    recette:  Recette,
    rtData:   RecetteTraitement,
): void {
    // ── Initialisation ────────────────────────────────────────────────────────
    recette.montTva  = '0,00';
    recette.penalite = '0,00';
    facture.montCli  = 0;
    const saisi           = parseFloat((rtData.saisiAImputer0  ?? '0').replace(',', '.'));
    const aFacturer       = parseFloat((rtData.facMontFacturer0 ?? '0').replace(',', '.'));
    const montDebours     = parseFloat((rtData.facMontDebours0  ?? '0').replace(',', '.'));
    const facSolde        = parseFloat(String(facture.solde        ?? '0').replace(',', '.'));
    const facSoldePena    = parseFloat(String(facture.soldePenalite ?? '0').replace(',', '.'));
    const montHorsDebours = aFacturer - montDebours;
    // ── II.1 – Calcul des montants ────────────────────────────────────────────
    switch (true) {
        case saisi <= montHorsDebours:
            // Règlement partiel hors débours
            recette.montTtc  = saisi.toFixed(2).replace('.', ',');
            recette.debours  = '0,00';
            recette.montRegl = recette.montTtc;
            facture.totRegl  = saisi;
            facture.solde    = facSolde - saisi;
            break;
        case saisi > montHorsDebours && saisi <= aFacturer:
            // Règlement incluant une partie des débours
            recette.montTtc  = montHorsDebours.toFixed(2).replace('.', ',');
            recette.debours  = (saisi - montHorsDebours).toFixed(2).replace('.', ',');
            recette.montRegl = saisi.toFixed(2).replace('.', ',');
            facture.totRegl  = saisi;
            facture.solde    = facSolde - saisi;
            break;
        case saisi > aFacturer: {
            // Encaissement Excédentaire
            recette.montTtc = montHorsDebours.toFixed(2).replace('.', ',');
            recette.debours = montDebours.toFixed(2).replace('.', ',');
            const reste     = saisi - montHorsDebours - montDebours;
            rtData.saisiAImputer0 = reste.toFixed(2).replace('.', ',');

            if (reste <= facSoldePena) {
                // Règlement partiel des pénalités
                recette.penalite      = reste.toFixed(2).replace('.', ',');
                facture.soldePenalite = facSoldePena - reste;
                facture.solde         = facSolde - montHorsDebours - montDebours - reste;
            } else {
                // Excédent après pénalités → crédit compte client
                recette.penalite      = facSoldePena.toFixed(2).replace('.', ',');
                facture.soldePenalite = 0;
                facture.solde         = 0;
                const excedent        = reste - facSoldePena;
                facture.montCli       = excedent; // ← Maj du Compte Client via l'action 'createRecette' [src\routes\(app)\recette\+page.server.ts]
                rtData.saisiAImputer0 = excedent.toFixed(2).replace('.', ',');
            }
            recette.montRegl = (montHorsDebours + montDebours + parseFloat((recette.penalite ?? '0').replace(',', '.'))).toFixed(2).replace('.', ',');
            facture.totRegl  = parseFloat(recette.montRegl.replace(',', '.'));
            break;
        }
    }
    // ── Données communes ──────────────────────────────────────────────────────
    recette.montHt    = recette.montTtc;
    recette.ventilTva = '00,0' + '¤' + recette.montHt + '¤' + '0,00';
    recette.nature    = '';
}


// ─────────────────────────────────────────────────────────────────────────────
// Encaissement COMPLEMLENTAIRE sur une Facture IMPOSABLE à la TVA (regimeTva == 'B')
// Confection d'une occurrence de Recette et Mise à jour de la Facture correspondante 
// ─────────────────────────────────────────────────────────────────────────────
export function prepaRecetteComplTva(
    facture:  Facture,
    recette:  Recette,
    rtData:   RecetteTraitement,
): void {
    const saisi        = parseFloat((rtData.saisiAImputer0  ?? '0').replace(',', '.'));
    const montantDu    = parseFloat((rtData.facMontantDu0   ?? '0').replace(',', '.'));
    const aFacturer    = parseFloat((rtData.facMontFacturer0 ?? '0').replace(',', '.'));
    const facSolde     = parseFloat(String(facture.solde        ?? '0').replace(',', '.'));
    const facSoldePena = parseFloat(String(facture.soldePenalite ?? '0').replace(',', '.'));
    // ── Détermination de l'opération ─────────────────────────────────────────
    const cal = saisi - montantDu;
    let ope0: 'C1' | 'C2' | 'C3';
    if      (cal < 0)   ope0 = 'C3'; // Partiel
    else if (cal === 0) ope0 = 'C1'; // Égalité
    else                ope0 = 'C2'; // Excédentaire
    recette.penalite = '0,00';
    recette.debours  = '0,00';
    recette.ventilTva = '';
    if (aFacturer !== 0) {
        // ── Agrégation par Taux de TVA des règlements déjà effectués ─────────
        const recVentilTvaArray0: { tva: string; montHt: number }[] = [];
        for (const rec of rtData.selRecettes) {
            const ventilTvaRaw = rec.ventilTva ?? '';
            if (ventilTvaRaw) {
                const lignes = ventilTvaRaw.split('|');
                for (const ligne of lignes) {
                    const parts  = ligne.split('¤');
                    // parts[0]=tva, parts[1]=montHt, parts[2]=montTva
                    const tva    = parts[0] ?? '';
                    const montHt = parseFloat((parts[1] ?? '0').replace(',', '.'));
                    const ind    = recVentilTvaArray0.findIndex(item => item.tva === tva);
                    if (ind === -1) {
                        recVentilTvaArray0.push({ tva, montHt });
                    } else {
                        recVentilTvaArray0[ind].montHt += montHt;
                    }
                }
            }
            // Agrégation des débours
            const debours = parseFloat(String(rec.debours ?? '0').replace(',', '.'));
            if (debours !== 0) {
                const ind = recVentilTvaArray0.findIndex(item => item.tva === '00,0');
                if (ind === -1) {
                    recVentilTvaArray0.push({ tva:'00,0', montHt:debours });
                } else {
                    recVentilTvaArray0[ind].montHt += debours;
                }
            }
        }
        // ── Maj de montEncais et soldeTtc dans facTotalRecetteArray2 ─────────
        for (const lig of rtData.facTotalRecetteArray2) {
            const tva = String(lig.tva ?? '');
            const ind = recVentilTvaArray0.findIndex(item => item.tva === tva);
            if (ind !== -1) {
                lig.montEncais  = recVentilTvaArray0[ind].montHt.toFixed(2).replace('.', ',');
                const montHtDu  = parseFloat(String(lig.montHtDu ?? '0').replace(',', '.'));
                const soldeHt   = montHtDu - recVentilTvaArray0[ind].montHt;
                lig.soldeHt     = soldeHt.toFixed(2).replace('.', ',');
                const tauxTva   = parseFloat(tva.replace(',', '.'));
                if (tva === '00,0') {
                    lig.soldeTtc = lig.soldeHt;
                } else {
                    lig.soldeTtc = (soldeHt * (tauxTva / 100 + 1)).toFixed(2).replace('.', ',');
                }
            }
        }
        // ── Imputation de l'encaissement complémentaire ───────────────────────
        let montAImputer: number;
        if (saisi <= aFacturer) {
            montAImputer = saisi;
        } else {
            montAImputer = aFacturer;
            rtData.saisiAImputer0 = (saisi - aFacturer).toFixed(2).replace('.', ',');
        }
        for (const lig of rtData.facTotalRecetteArray2) {
            const soldeHt  = parseFloat(String(lig.soldeHt  ?? '0').replace(',', '.'));
            const soldeTtc = parseFloat(String(lig.soldeTtc ?? '0').replace(',', '.'));
            if (soldeHt !== 0 && montAImputer !== 0) {
                if (soldeTtc >= montAImputer) {
                    lig.imput    = montAImputer.toFixed(2).replace('.', ',');
                    montAImputer = 0;
                } else {
                    lig.imput    = lig.soldeTtc;
                    montAImputer -= soldeTtc;
                }
            }
        }
        // ── Constitution de ventilTva ─────────────────────────────────────────
        let totMontTtc = 0;
        let totMontHt  = 0;
        let totMontTva = 0;
        for (const lig of rtData.facTotalRecetteArray2) {
            const imput = parseFloat(String(lig.imput ?? '0').replace(',', '.'));
            if (imput !== 0) {
                const tva = String(lig.tva ?? '');
                if (tva === '00,0') {
                    recette.debours = imput.toFixed(2).replace('.', ',');
                } else {
                    totMontTtc += imput;
                    const tauxTva = parseFloat(tva.replace(',', '.'));
                    const montHt  = imput / (tauxTva / 100 + 1);
                    const montTva = imput - montHt;
                    totMontHt    += montHt;
                    totMontTva   += montTva;
                    const ventilLigne = tva + '¤' + montHt.toFixed(2).replace('.', ',') + '¤' + montTva.toFixed(2).replace('.', ',');
                    if ((recette.ventilTva ?? '').length === 0) {
                        recette.ventilTva = ventilLigne;
                    } else {
                        recette.ventilTva += '|' + ventilLigne;
                    }
                }
            }
        }
        recette.montHt  = totMontHt.toFixed(2).replace('.', ',');
        recette.montTva = totMontTva.toFixed(2).replace('.', ',');
        recette.montTtc = totMontTtc.toFixed(2).replace('.', ',');
        // ── Calcul du Solde et des Pénalités ──────────────────────────────────
        const saisiCourant = parseFloat((rtData.saisiAImputer0 ?? '0').replace(',', '.'));
        if (saisiCourant < facSolde) {
            facture.solde = facSolde - saisiCourant;
        } else {
            if (saisiCourant < facSoldePena) {
                recette.penalite      = saisiCourant.toFixed(2).replace('.', ',');
                facture.soldePenalite = facSoldePena - saisiCourant;
            } else {
                recette.penalite      = facSoldePena.toFixed(2).replace('.', ',');
                rtData.saisiAImputer0 = (saisiCourant - facSoldePena).toFixed(2).replace('.', ',');
                facture.soldePenalite = 0;
            }
            facture.solde = facSolde - totMontTtc
                - parseFloat((recette.debours  ?? '0').replace(',', '.'))
                - parseFloat((recette.penalite ?? '0').replace(',', '.'));
        }

    } else {
        // ── rt.facMontFacturer0 == 0 : uniquement pénalités ───────────────────
        const saisiCourant = parseFloat((rtData.saisiAImputer0 ?? '0').replace(',', '.'));
        if (saisiCourant <= aFacturer) {
            recette.penalite      = saisiCourant.toFixed(2).replace('.', ',');
            facture.soldePenalite = facSoldePena - saisiCourant;
        } else {
            recette.penalite      = facSoldePena.toFixed(2).replace('.', ',');
            rtData.saisiAImputer0 = (saisiCourant - facSoldePena).toFixed(2).replace('.', ',');
            facture.soldePenalite = 0;
        }
        facture.solde = facSolde - parseFloat((recette.penalite ?? '0').replace(',', '.'));
    }
    // ── Finalisation selon l'opération ───────────────────────────────────────
    if (ope0 === 'C1') { // Montant saisi = Montant Dû ----
        recette.montRegl  = rtData.facMontantDu0 ?? '0,00';
        facture.totRegl   = montantDu;
        facture.montCli   = 0;
        facture.solde     = 0;
    } else if (ope0 === 'C2') { // Encaissement Excédentaire ----
        const montRegl    = parseFloat((recette.montTtc  ?? '0').replace(',', '.'))
                          + parseFloat((recette.debours  ?? '0').replace(',', '.'))
                          + parseFloat((recette.penalite ?? '0').replace(',', '.'));
        recette.montRegl  = montRegl.toFixed(2).replace('.', ',');
        facture.totRegl   = montRegl;
        facture.montCli   = parseFloat((rtData.saisiAImputer0 ?? '0').replace(',', '.')); // ← Maj du Compte Client via l'action 'createRecette' [src\routes\(app)\recette\+page.server.ts]
        facture.solde     = 0;
    } else { // C3 : Encaissement Partiel ----
        const montRegl    = parseFloat((recette.montTtc  ?? '0').replace(',', '.'))
                          + parseFloat((recette.debours  ?? '0').replace(',', '.'))
                          + parseFloat((recette.penalite ?? '0').replace(',', '.'));
        recette.montRegl  = montRegl.toFixed(2).replace('.', ',');
        facture.totRegl   = montRegl;
        facture.montCli   = 0;
        // facture.solde déjà calculé
    }
    recette.nature = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Encaissement COMPLEMENTAIRE sur une Facture en FRANCHISE de TVA
// Confection d'une occurrence de Recette et Mise à jour de la Facture correspondante 
// ─────────────────────────────────────────────────────────────────────────────
export function prepaRecetteComplFranchise(
    facture:  Facture,
    recette:  Recette,
    rtData:   RecetteTraitement,
): void {
    const saisi          = parseFloat((rtData.saisiAImputer0  ?? '0').replace(',', '.'));
    const facMontDebours = parseFloat((rtData.facMontDebours0 ?? '0').replace(',', '.'));
    const facTotTtc      = parseFloat(String(facture.totTtc      ?? '0').replace(',', '.'));
    const facTotRegl     = parseFloat(String(facture.totRegl     ?? '0').replace(',', '.'));
    const facSolde       = parseFloat(String(facture.solde       ?? '0').replace(',', '.'));
    const facSoldePena   = parseFloat(String(facture.soldePenalite ?? '0').replace(',', '.'));
    // ── II.1 – Calcul des montants déjà Réglés ────────────────────────────────
    let dejaReglNonDebours = 0;
    let dejaReglDebours    = 0;
    let dejaReglPenalite   = 0;
    for (const rec of rtData.selRecettes) {
        dejaReglNonDebours += parseFloat(String(rec.montTtc  ?? '0').replace(',', '.'));
        dejaReglDebours    += parseFloat(String(rec.debours  ?? '0').replace(',', '.'));
        dejaReglPenalite   += parseFloat(String(rec.penalite ?? '0').replace(',', '.'));
    }
    const facMontNonDebours = facTotTtc - facMontDebours;
    const resteNonDebours   = facMontNonDebours >= dejaReglNonDebours ? facMontNonDebours - dejaReglNonDebours : 0;
    const resteDebours      = facMontDebours    >= dejaReglDebours    ? facMontDebours    - dejaReglDebours    : 0;
    const restePenalite     = facSoldePena      >= dejaReglPenalite   ? facSoldePena      - dejaReglPenalite   : 0;
    const resteFacture      = resteNonDebours + resteDebours;
    // ── II.2 – Calcul des montants de Recette et mise à jour Facture ──────────
    facture.montCli = 0;
    if (saisi <= resteNonDebours) { // Cas 1 : règlement partiel hors débours ----
        recette.montTtc  = saisi.toFixed(2).replace('.', ',');
        recette.debours  = '0,00';
        recette.penalite = '0,00';
        recette.montRegl = recette.montTtc;
        facture.totRegl  = facTotRegl + saisi;
        facture.solde    = facSolde   - saisi;
    } else if (saisi > resteNonDebours && saisi <= resteFacture) { // Cas 2 : règlement incluant une partie des débours ----
        const montDeboursSaisi = saisi - resteNonDebours;
        recette.montTtc  = resteNonDebours.toFixed(2).replace('.', ',');
        recette.debours  = montDeboursSaisi.toFixed(2).replace('.', ',');
        recette.penalite = '0,00';
        recette.montRegl = (resteNonDebours + montDeboursSaisi).toFixed(2).replace('.', ',');
        facture.totRegl  = facTotRegl + resteNonDebours + montDeboursSaisi;
        facture.solde    = facSolde   - resteNonDebours - montDeboursSaisi;
    } else { // Cas 3 : encaissement excédentaire ----
        recette.montTtc   = resteNonDebours.toFixed(2).replace('.', ',');
        recette.debours   = resteDebours.toFixed(2).replace('.', ',');
        const reste       = saisi - resteNonDebours - resteDebours;
        rtData.saisiAImputer0 = reste.toFixed(2).replace('.', ',');
        if (reste <= restePenalite) {
            recette.penalite      = reste.toFixed(2).replace('.', ',');
            facture.soldePenalite = facSoldePena - reste;
        } else {
            recette.penalite      = restePenalite.toFixed(2).replace('.', ',');
            facture.soldePenalite = 0;
            const excedent        = reste - restePenalite;
            facture.montCli       = excedent; // ← Maj du Compte Client via l'action 'createRecette' [src\routes\(app)\recette\+page.server.ts]
            rtData.saisiAImputer0 = excedent.toFixed(2).replace('.', ',');
        }
        const montRegl   = resteNonDebours + resteDebours + parseFloat((recette.penalite ?? '0').replace(',', '.'));
        recette.montRegl = montRegl.toFixed(2).replace('.', ',');
        facture.totRegl  = facTotRegl + montRegl;
        facture.solde    = facSolde   - montRegl;
    }
    // ── Données communes ──────────────────────────────────────────────────────
    recette.montTva   = '0,00';
    recette.montHt    = recette.montTtc;
    recette.ventilTva = '00,0' + '¤' + recette.montHt + '¤' + '0,00';
    recette.nature    = '';
}

