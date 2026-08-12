// ─────────────────────────────────────────────────────────────────────────────
// Messages d'information fiscale - comptable - et Autres ...
// ─────────────────────────────────────────────────────────────────────────────

// src\routes\(app)\abonne\ ...
export const infoReprise =
    "<div style='text-align:left;font-size:15px'>" +
    "<p>La Reprise du(des) montant(s) de Chiffre d'Affaires réalisé(s) préalablement à l'utilisation de Cinqenun " +
    "est <b>indispensable</b> à celui-ci pour apprécier votre situation au regard :<br>" +
    "  - soit du bénéfice de la Franchise de TVA pour le Statut d'Auto-entrepreneur;<br>" +
    "  - soit des conditions de maintien dans le Statut fiscal choisi.<br><br>" +
    "Indépendemment de votre Statut, cette Reprise permettra l'Appréciation de l'évolution de votre Chiffre d'Affaire.</p>" +
    "</div>";

// src\lib\components\facture\FactureEntete.svelte
export const penaReglement =
    "<div style='text-align:left;font-size:15px;line-height:normal'>" +
    "Dans le cadre de la facturation à un Client 'Professionnel', le Code de Commerce (art. L 441-9, I-al. 5) impose de l'informer sur les Pénalités de Retard applicables en cas de retard de Règlement.<br>" +
    "<span style='color:red'>Cinqenun vous permet de choisir entre ces différentes possibilités, choix qui apparaîtra sur la Facture.</span><br><br>" +
    "<u><b>Choix du Taux de Pénalité</b></u><br>" +
    "Le taux applicable peut être librement fixé, sans toutefois être inférieur à 3 fois le taux d'intérêt légal.<br>" +
    "En plus des pénalités de retard, le créancier est libre de réclamer une indemnité forfaitaire de 40€.<br><br>" +
    "<u><b>Cinqenun offre diverses possibilités :</b></u><br>" +
    "- Calcul des Pénalités par Taux d'Intérêt Légal ;<br>" +
    "- Calcul des Pénalités par Taux de la B.C.E. ;<br>" +
    "- Calcul des Pénalités par Taux d'Intérêt Légal avec affichage de la référence aux C.G.V. ;<br>" +
    "- Calcul des Pénalités par Taux de la B.C.E. avec affichage de la référence aux C.G.V.<br><br>" +
    "<span style='color:blue'><u>Rappel</u> :<br> La Confection des différences Lettres s'effectue dans l'écran 'Encaissement'.</span>" +
    "</div>";

// src\lib\components\encaissement\ModalEncaissement.svelte    
export const fiscPena =
    "<div style='text-align:center;font-size:14px'>" +
    "Les Pénalités de Retard et l'Indemnité Forfaitaire ne sont pas soumises à la TVA.<br>" +
    "En revanche, ils constituent un produit imposable (produit financier ou exceptionnel)." +
    "</div>";

export const procRelance =
    "<div style='text-align:left;font-size:14px'>" +
    "La Procédure de relance requière, en principe, 3 courriers : une 1<sup>ère</sup> Lettre de Rappel, une dernière Lettre de Rappel et une Mise en Demeure.<br>" +
    "<span style='color:red'>Cinqenun peut confectionner les 2 Lettres de Rappel et (si le calcul des Pénalités a été choisi dans l'Ecran de Création de la Facture) la Mise en Demeure.</span><br><br>" +
    "Il est conseillé d'adresser ces courriers en fonction de votre relation avec votre client, du délai de retard et de votre urgence de recouvrement.<br>" +
    "Les courriers de Rappel peuvent être envoyés soit par courrier, soit par courriel.<br>" +
    "Conformément au droit juridique français, la lettre de Mise en Demeure doit être adressée par courrier.<br><br>" +
    "<u><b>1<sup>ère</sup> étape : Lettre de Rappel</b></u><br>" +
    "En théorie, dès que votre facture est arrivée à échéance, la 1<sup>ère</sup> lettre de relance peut être envoyée. Cinqenun s'assure que le délai de paiement est bien passé pour vous proposer la confection de ce courrier.<br>" +
    "Commercialement, il est cependant judicieux de commencer votre recouvrement par une conversation téléphonique ou un courriel.<br>" +
    "Si, malgré tout, votre débiteur ne s'exécute pas, la 1<sup>ère</sup> Lettre de Rappel peut être adressée.<br><br>" +
    "<u><b>2<sup>ème</sup> étape : dernière Lettre de Rappel</b></u><br>" +
    "Si la 1<sup>ère</sup> Lettre de Rappel est restée sans réponse, une dernière Lettre de Rappel doit être adressée.<br><br>" +
    "<u><b>3<sup>ème</sup> étape : Mise en Demeure</b></u><br>" +
    "Si aucun paiement n'est effectué, la Mise en Demeure peut être envoyée.<br><br>" +
    "<u><b>Que faire si les différentes relances n'aboutissent pas ?</b></u><br>" +
    "Arrivé à cette situation, des poursuites judiciaires peuvent être engagées." +
    "</div>";

export const annulAcompte =
    "<div style='text-align:left;font-size:15px'>" +
    "Un <b>acompte</b> implique un engagement ferme et définitif et par conséquent l'obligation d'acheter pour le Client.<br>" +
    "L'acompte est un premier versement à valoir sur la Commande. Il n'y a en principe aucune possibilité de dédit.<br><br>" +
    "Les <b>arrhes</b> permettent au Client de changer d'avis en renonçant à la commande.<br>" +
    "Dans ce cas, les arrhes vous restent acquises à titre de dédommagement.<br><br>" +
    "Cinqenun vous laisse l'initiative :<br>" +
    "  - si vous considérez que la commande est abandonnée, de clore l'Affaire en n'annulant pas la Facture d'acompte (sans remboursement) ;<br>" +
    "  - si la commande n'est pas remise en cause, d'annuler la facture d'Acompte avec Remboursement Financier ou Création d'un Crédit à valoir sur une prochaine facturation." +
    "</div>";