import type { Recette, RecetteTraitement } from '$lib/schemas/recette';
import type { Facture } from '$lib/schemas/facture';
import type { Abonne } from '$lib/schemas/abonne';
//import { rt } from '$lib/stores/encaissementStore.svelte';
import {convert } from '$lib/utils/format';
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
// Détermine les lignes de totalisation, initialise facAcompte, puis crée l'occurrence de Recette en base. 
// Concomitance assurée par le fait que facAcompte reste un objet local non persistant si createRecette échoue.
// ─────────────────────────────────────────────────────────────────────────────
export async function createFacAcompteRec(coef:number, devis:Facture, facAcompte:Facture, recette:Recette, rtData:RecetteTraitement, abonne:Abonne, nature:string, setBandeau: (state:BandeauState)=>void, setBtnNonOk:(val:boolean)=>void):Promise<{ ok:boolean; recetteId?:number}> {
    // ── 1. Calcul des lignes de Totalisation + ventilTva ──────────────────
    recette.ventilTva = '';
    cumulPresta0 = 0;
    cumulVente0  = 0;
    calMontTva0  = 0;
    const facTotalAcompteArray0: string[] = [];
    const facTotalArray0 = (devis.total ?? '').split('|');
    for (let i=0; i<facTotalArray0.length; i++) {
        let lig = facTotalArray0[i];
        const ligArray = lig.split('¤');
        if (ligArray[0].slice(4, 6) == '00' || ligArray[0].slice(4, 6) == '11') {
            const cal1 = ligArray[3].replace(/[,]/, '');
            const cal2 = Number(cal1) * coef;
            ligArray[2] = ((cal2 / 100).toFixed(2)).replace(/[.]/, ',');
            if (ligArray[0].slice(4, 6) == '00') {
                cumulVente0 += Number(cal2);
            } else {
                cumulPresta0 += Number(cal2);
            }
            ligArray[3] = '';
            ligArray[4] = ligArray[2];
            if (devis.regimeTva == 'B') {
                const tauxTva = (ligArray[0].slice(0, 4)).replace(/[,]/, '.');
                const montHt  = ligArray[4].replace(/[,]/, '');
                const montTva = (Number(montHt) * Number(tauxTva)) / 100;
                calMontTva0  += Number(montTva);
                ligArray[5]   = ((montTva / 100).toFixed(2)).replace(/[.]/, ',');
                const montTtc = Number(montHt) + Number(montTva);
                ligArray[6]   = ((montTtc / 100).toFixed(2)).replace(/[.]/, ',');
            } else {
                ligArray[5] = '0,00';
                ligArray[6] = ligArray[4];
            }
            lig = ligArray.join('¤');
            facTotalAcompteArray0.push(lig);
            if (devis.regimeTva == 'B') {
                if ((recette.ventilTva ?? '').length == 0) {
                    recette.ventilTva = ligArray[0].slice(0, 4) + '¤' + ligArray[2] + '¤' + ligArray[5];
                } else {
                    recette.ventilTva += '¤' + ligArray[0].slice(0, 4) + '¤' + ligArray[2] + '¤' + ligArray[5];
                }
            }
        }
    }
    if (devis.regimeTva != 'B') {
        recette.ventilTva = '00,0' + '¤' + (rtData.acompteMont0 ?? '0,00') + '¤' + '0,00';
    }
    facAcompte.total       = facTotalAcompteArray0.join('|');
    facAcompte.totPrestaHt = Number((cumulPresta0 / 100).toFixed(2));
    facAcompte.totVenteHt  = Number((cumulVente0  / 100).toFixed(2));
    // ── 2. Initialisation des autres données de facAcompte ────────────────
    const num = Number(abonne.numFact) + 1;
    facAcompte.codeType      = 20;
    facAcompte.refDevis      = devis.refFac;
    facAcompte.refFac        = abonne.anFact + '-' + convert(num, 5);
    facAcompte.refPre        = '';
    facAcompte.client        = devis.client;
    facAcompte.statutCode    = 21;
    facAcompte.statut        = "<mark style='background:white;color:#0488fd'>Facture Acompte Réglée";
    facAcompte.regimeTva     = devis.regimeTva;
    facAcompte.dateEmis      = new Date();
    facAcompte.typeDelai     = 0;
    facAcompte.delai         = 0;
    facAcompte.dateEcheance  = new Date().toLocaleDateString("fr-FR");
    facAcompte.ligne         = '';
    facAcompte.remTot        = 0;
    facAcompte.totTtc        = rtData.acompteMont0 != null ? parseFloat(rtData.acompteMont0.replace(',', '.')) : null;
    facAcompte.acompTaux     = null;
    facAcompte.acompMont     = '';
    facAcompte.dateRegl      = recette.dateRegl ? recette.dateRegl.toLocaleDateString("fr-FR") : null;
    facAcompte.imputCreCli   = 0;
    facAcompte.totRegl       = rtData.acompteMont0 != null ? parseFloat(rtData.acompteMont0.replace(',', '.')) : null;
    facAcompte.montCli       = 0;
    facAcompte.solde         = 0;
    facAcompte.penalite      = '';
    facAcompte.soldePenalite = null;
    facAcompte.clientId      = devis.clientId;
    facAcompte.abonneId      = devis.abonneId;

    // ── 3. Données calculées pour la Recette ───────────────────────────────
    recette.montHt  = ((cumulPresta0 + cumulVente0) / 100).toFixed(2).replace('.', ',');
    recette.montTva = (calMontTva0 / 100).toFixed(2).replace('.', ',');

    // ── 4. Création transactionnelle Facture + Recette ─────────────────────
    const fd = new FormData();
    // Données Facture
    fd.append('refFac',         facAcompte.refFac);
    fd.append('refDevis',       facAcompte.refDevis             ?? '');
    fd.append('client',         facAcompte.client               ?? '');
    fd.append('statut',         facAcompte.statut);
    fd.append('regimeTva',      facAcompte.regimeTva            ?? '');
    fd.append('dateEmis',       facAcompte.dateEmis.toISOString());
    fd.append('typeDelai',      String(facAcompte.typeDelai));
    fd.append('delai',          String(facAcompte.delai));
    fd.append('dateEcheance',   facAcompte.dateEcheance         ?? '');
    fd.append('ligne',          facAcompte.ligne                ?? '');
    fd.append('total',          facAcompte.total                ?? '');
    fd.append('remTot',         String(facAcompte.remTot        ?? 0));
    fd.append('totTtc',         String(facAcompte.totTtc        ?? 0));
    fd.append('totPrestaHt',    String(facAcompte.totPrestaHt   ?? 0));
    fd.append('totVenteHt',     String(facAcompte.totVenteHt    ?? 0));
    fd.append('imputCreCli',    String(facAcompte.imputCreCli   ?? 0));
    fd.append('totRegl',        String(facAcompte.totRegl       ?? 0));
    fd.append('montCli',        String(facAcompte.montCli       ?? 0));
    fd.append('solde',          String(facAcompte.solde         ?? 0));
    fd.append('soldePenalite',  String(facAcompte.soldePenalite ?? 0));
    fd.append('clientId',       String(facAcompte.clientId));
    // Données Recette
    fd.append('recDateEmis',    recette.dateEmis.toISOString());
    fd.append('recDateRegl',    recette.dateRegl?.toISOString() ?? new Date().toISOString());
    fd.append('cliNom',         recette.cliNom);
    fd.append('libelle',        recette.libelle);
    fd.append('modeRegl',       recette.modeRegl);
    fd.append('montRegl',       rtData.acompteMont0             ?? '0,00');
    fd.append('montHt',         recette.montHt                  ?? '0,00');
    fd.append('ventilTva',      recette.ventilTva               ?? '');
    fd.append('montTva',        recette.montTva                 ?? '0,00');
    fd.append('montTtc',        rtData.acompteMont0             ?? '0,00');
    fd.append('debours',        recette.debours                 ?? '0,00');
    fd.append('penalite',       recette.penalite                ?? '0,00');
    fd.append('nature', nature);
    try { // Appel action serveur ----------------
        const response = await fetch('?/createFactureAcompteRecette', { method:'POST', body:fd });
        const result    = deserialize(await response.text());
        if (result.type === 'success') {
            const recetteId = (result.data as { recetteId?:number })?.recetteId;
            return { ok:true, recetteId };
        }
        setBandeau({ message:"Erreur lors de la création...", succes:false, visible:true });
        setBtnNonOk(false);
        return { ok:false };
    } catch {
        setBandeau({ message:"Erreur réseau...", succes:false, visible:true });
        setBtnNonOk(false);
        return { ok: false };
    }
}


/*
export async function createRecette(
    nature:      string,
    recette:     Recette,
    rt:          RecetteTraitement,
    facture:     Facture,
    setBandeau:  (state: BandeauState) => void,
    setBtnNonOk: (val: boolean) => void,
): Promise<boolean> {
    const fd = new FormData();
    fd.append('dateEmis',  recette.dateEmis.toISOString());
    fd.append('dateRegl',  recette.dateRegl?.toISOString() ?? new Date().toISOString());
    fd.append('refFac',    recette.refFac);
    fd.append('cliNom',    recette.cliNom);
    fd.append('libelle',   recette.libelle);
    fd.append('regimeTva', recette.regimeTva  ?? '');
    fd.append('modeRegl',  recette.modeRegl);
    fd.append('montRegl',  rt.saisiAImputer0);
    fd.append('montHt',    recette.montHt ?? '0,00');
    fd.append('ventilTva', recette.ventilTva  ?? '');
    fd.append('montTva',   recette.montTva?? '0,00');
    fd.append('montTtc',   rt.saisiAImputer0);
    fd.append('debours',   recette.debours?? '0,00');
    fd.append('penalite',  recette.penalite   ?? '0,00');
    fd.append('nature',    nature);
    fd.append('factureId', String(facture.id));
    fd.append('clientId',  String(facture.clientId));
    try {
        const response = await fetch('?/createRecette', { method: 'POST', body: fd });
        const raw = await response.json();
        // Réponses d'action SvelteKit : { type: "success" | "failure" | "error", data: "..." }
        if (raw.type === 'success') {
            return true;
        }
        setBandeau({ message: "Erreur lors de la création de l'encaissement.", succes: false, visible: true });
        setBtnNonOk(false);
        return false;
    } catch {
        setBandeau({ message: "Erreur réseau lors de la création de l'encaissement.", succes: false, visible: true });
        setBtnNonOk(false);
        return false;
    }
}
*/