import { Prisma } from '../generated/prisma/client';
import { INITIAL_DISCIPLINARY_CATEGORIES } from './disciplinary-categories.constants';

export function provisionDisciplinaryCategories(
  client: Pick<Prisma.TransactionClient, 'disciplinaryCategory'>,
) {
  // The unique code handles repeats and concurrent runs without updating
  // existing labels, activation, severity defaults or timestamps.
  return client.disciplinaryCategory.createMany({
    data: INITIAL_DISCIPLINARY_CATEGORIES.map((category) => ({
      ...category,
      active: true,
      defaultSeverity: null,
    })),
    skipDuplicates: true,
  });
}
