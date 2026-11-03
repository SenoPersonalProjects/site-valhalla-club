export const INITIAL_DISCIPLINARY_CATEGORIES = [
  { code: 'RESPECT', label: 'Ofensas e desrespeito' },
  { code: 'HARASSMENT', label: 'Assédio' },
  { code: 'DISCRIMINATION', label: 'Discriminação' },
  { code: 'SAFETY', label: 'Ameaças e situações de risco' },
  { code: 'COMMITMENTS', label: 'Descumprimento de compromissos combinados' },
  { code: 'OTHER', label: 'Outros, com explicação obrigatória' },
] as const;

export const DISCIPLINARY_CATEGORY_MAX_OFFSET = 2_147_483_647;
export const DISCIPLINARY_CATEGORY_MAX_PAGE_LIMIT = 50;
