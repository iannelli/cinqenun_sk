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

// src\routes\(app)\client\+page.svelte
export const excedent =
    "<div style='text-align:left;font-size:15px;line-height:19px'>" +
    "Lorsqu’au titre d’une facture, le montant encaissé excède le montant dû, il convient de distinguer :<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- la partie de l’encaissement qui correspond au montant dû et qui est considérée comme une recette en comptabilité de<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;trésorerie (recettes/dépenses) ;<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- de la partie de l’encaissement qui correspondent à un trop-perçu.<br>" +
    "<p style='margin-top:5px'>Cet excédent (encore appelé 'trop-perçu' ou 'crédit-client') doit être régularisé vis-à-vis de votre client :</p>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- soit par remboursement ;<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- soit par imputation sur une (ou plusieurs) de ces factures ultérieures.<br>" +
    "Cinqenun inclut toutes les fonctionnalités correspondantes vous permettant de gérer ces 2 situations.<br>" +

    "<p style='margin-top:10px'><b>Nature comptable et fiscal du 'trop-perçu' (ou 'crédit-client')</b></p>" +
    "Le 'trop-perçu' est considéré comme un excédent d'encaissement et exclu à ce titre de vos recettes. De ce fait, il n’apparaît pas dans le journal des recettes, mais est visualisable dans le compte du Client géré par Cinqenun.<br>" +
    "Cela permet de faire le rapprochement bancaire tout en conservant une traçabilité complète.<br>" +
    "Le 'trop-perçu' ne doit pas être confondu avec un avoir :<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- un avoir est une Facture à part entière qui annule la Facture Initiale.<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- un 'trop-perçu' est une Situation de Paiement.<br>" +
    "Le remboursement du 'trop-perçu' n'est pas non plus une charge professionnelle : c'est la restitution d'une somme qui ne vous appartenait pas.<br>" +
    "Afin de vérifier vos encaissements bancaires et de déterminer correctement ce qui constitue réellement une recette professionnelle, Cinqenun constitue un état des trop-perçus de tous vos clients. Cette Liste peut être affichée par le menu général Clients>Liste des Excédent d’Encaissement.<br>" +
    "Pour information, Cinqenun vous permet également l'affichage des 'soldes dû client' par le menu général Clients>Liste des 'Paiements en Attente'<br>" +

    "<p style='margin-top:10px'><b>Situation en fin d'exercice</b></p>" +
    "En fin d'exercice et par obligations comptables et fiscales Cinqenun, vous pouvez utiliser la fonctionnalité du menu général Clients>Liste des Excédent d’Encaissement afin d’afficher la situation des 'trop-perçus' de l'ensemble de vos Clients.<br>" +

    "<p style='margin-top:10px'><b>Prescription du 'Trop-perçu' envers le client.</b></p>" +
    "Tant que la dette envers le Client subsiste, elle restent une somme à lui restituer ou à lui imputer sur une de ses factures. Le fait qu'elle reste sur votre compte bancaire pendant plusieurs exercices ne transforme pas, à lui seul, cette somme en recette.<br>" +
    "Cependant, il existe une question de prescription.<br>" +
    "En droit civil, le délai de droit commun des actions personnelles est de 5 ans, à compter du jour où le titulaire du droit a connu ou aurait dû connaître les faits lui permettant d'agir (article 2224 du Code civil).<br>" +
    "Il faut notamment examiner :<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- la date exacte du paiement ;<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- la date à laquelle le client pouvait constater le trop-perçu ;<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- les éventuelles correspondances avec le client ;<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- une éventuelle reconnaissance de la dette ;<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- et les règles particulières qui pourraient s'appliquer au contrat concerné.<br>" +
    "Une fois la prescription effectivement acquise, la créance du client est effectivement prescrite et l’excédent est définitivement acquis.<br>" +
    "En comptabilité de trésorerie, le traitement d'un 'trop-perçu' au-delà du délai de prescription légale obéit à des règles strictes sur les plans comptable, fiscal et social.<br>" +
    "La dette devient définitivement acquise à l’auto-entrepreneur (ou à l’indépendant) et entre dans ses recettes et devient imposable.<br>" +

    "<p style='margin-top:10px'><b>Conséquences Fiscales</b></p>" +
    "Fiscalement, le 'trop-perçu' est réputé TTC et la part HT est à inclure dans vos recettes.<br>" +
    "Si vous êtes redevable de la TVA, celle-ci devient exigible et doit être reversée au Trésor public selon la nature de l'opération initiale.<br>" +
    "Si l'opération d'origine comporte un unique taux de TVA, les montants HT et de la TVA doivent être reconstitués en appliquant le taux d’origine correspondant (prestations de services ou ventes de biens).<br>" +
    "Si l'opération d'origine comporte plusieurs taux de TVA, il convient :<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- à partir du montant des bases HT ventilé par type de taux (figurant sur les lignes de totalisation de la facture d’origine)<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- de calculer une clé de répartition par taux de Tva<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;- et au titre de chaque taux de TVA, d’appliquer cette clé au 'trop-perçu' TTC selon la formule :<br>" +
    "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;montant TVA = ( trop-perçu x clé de répartition) / 1,[taux de tva]<br>" +
    "Cinqenun inclut une fonctionnalité qui vous permet d’effectuer ces calculs. Elle y inclut une note explicative précisant le détail du calcul et l'historique de l'extinction de la dette pour parer à toute demande de précision de l'Administration Fiscale.<br>" +
    "Ce qui vous permet d'apporter le justificatif qui vous incombe en cas de contrôle fiscal.<br>" +

    "<p style='margin-top:10px'><b>Conséquences Sociales</b></p>" +
    "La part HT du trop perçu, incluse dans vos recettes, est soumise aux Cotisations Sociales à déclarer à l'URSSAF." +
    "</div>";

