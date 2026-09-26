import { z } from 'zod';

// ── Sous-schémas pour les champs sérialisés ──────────────────────────────────
export const lettreSchema = z.object({
  type0:          z.enum(['0', '1', '2']).default('0'),  // 0=1er Rappel, 1=dernier Rappel, 2=Mise en Demeure
  dateCourrier0:  z.string().default(''),
  aR0:            z.enum(['0', '1']).default('0'),       // 0=sans, 1=avec
  nbreJourDelai0: z.string().default(''),
});
export const penaliteSchema = z.object({
  dateDeb0:  z.string().default(''),
  dateFin0:  z.string().default(''),
  taux0:     z.string().default(''),
  nbreJour0: z.string().default(''),
  montPena0: z.string().default(''),
});

// ── Schéma principal ─────────────────────────────────────────────────────────
export const courrierSchema = z.object({
  id:            z.number().int().optional(),
  civilDest:     z.string().min(1, 'La civilité du destinataire est requise').optional(),
  nomPreDest:    z.string().optional(),
  nomSignataire: z.string().optional(),
  lettre:        z.string().optional(),     // sérialisé : type0|dateCourrier0|aR0|nbreJourDelai0
  penalite:      z.string().optional(),   // sérialisé : dateDeb0|dateFin0|taux0|nbreJour0|montPena0
  factureId:     z.number().int().min(1, 'La facture est requise'),
  abonneId:      z.number().int().min(1, "L'abonné est requis"),
});

// ── Types inférés ────────────────────────────────────────────────────────────
export type CourrierForm   = z.infer<typeof courrierSchema>;
export type LettreFields   = z.infer<typeof lettreSchema>;
export type PenaliteFields = z.infer<typeof penaliteSchema>;

// ── Constantes ───────────────────────────────────────────────────────────────
export const LETTRE_SEP   = '|';
export const PENALITE_SEP = '|';

export const TYPE_LETTRE_OPTIONS = [
  { value: '0', label: '1er Rappel'      },
  { value: '1', label: 'Dernier Rappel'  },
  { value: '2', label: 'Mise en Demeure' },
] as const;

export const AR_OPTIONS = [
  { value: '0', label: 'Sans AR' },
  { value: '1', label: 'Avec AR' },
] as const;

// ── Valeurs par défaut ───────────────────────────────────────────────────────

export const defaultLettreFields: LettreFields = {
  type0:          '0',
  dateCourrier0:  '',
  aR0:            '0',
  nbreJourDelai0: '',
};
export const defaultPenaliteFields: PenaliteFields = {
  dateDeb0:  '',
  dateFin0:  '',
  taux0:     '',
  nbreJour0: '',
  montPena0: '',
};

// ── Serialize / Parse ────────────────────────────────────────────────────────

export function serializeLettre(f: LettreFields): string {
  return [f.type0, f.dateCourrier0, f.aR0, f.nbreJourDelai0].join(LETTRE_SEP);
}

export function parseLettre(raw: string | null | undefined): LettreFields {
  if (!raw) return { ...defaultLettreFields };
  const [type0 = '0', dateCourrier0 = '', aR0 = '0', nbreJourDelai0 = ''] =
    raw.split(LETTRE_SEP);
  return {
    type0: (type0 as LettreFields['type0']) || '0',
    dateCourrier0,
    aR0: (aR0 as LettreFields['aR0']) || '0',
    nbreJourDelai0,
  };
}

export function serializePenalite(f: PenaliteFields): string {
  return [f.dateDeb0, f.dateFin0, f.taux0, f.nbreJour0, f.montPena0].join(PENALITE_SEP);
}

export function parsePenalite(raw: string | null | undefined): PenaliteFields {
  if (!raw) return { ...defaultPenaliteFields };
  const [dateDeb0 = '', dateFin0 = '', taux0 = '', nbreJour0 = '', montPena0 = ''] = raw.split(PENALITE_SEP);
  return { dateDeb0, dateFin0, taux0, nbreJour0, montPena0 };
}