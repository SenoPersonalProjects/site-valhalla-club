import { disciplinaryCategoriesHarness } from '../../test/support/disciplinary-categories.harness';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AccountStatus, WarningSeverity } from '../generated/prisma/enums';
import { INITIAL_DISCIPLINARY_CATEGORIES } from './disciplinary-categories.constants';
import { provisionDisciplinaryCategories } from './provision-disciplinary-categories';

describe('Disciplinary category catalog', () => {
  it('defines the six approved codes without automatic severity', () => {
    expect(INITIAL_DISCIPLINARY_CATEGORIES.map((row) => row.code)).toEqual([
      'RESPECT',
      'HARASSMENT',
      'DISCRIMINATION',
      'SAFETY',
      'COMMITMENTS',
      'OTHER',
    ]);
    expect(
      new Set(INITIAL_DISCIPLINARY_CATEGORIES.map((row) => row.code)).size,
    ).toBe(6);
  });
  it('provisions an empty catalog once, using database-generated IDs', async () => {
    const h = disciplinaryCategoriesHarness();
    h.categories.length = 0;
    expect(await provisionDisciplinaryCategories(h.catalogClient)).toEqual({
      count: 6,
    });
    expect(await provisionDisciplinaryCategories(h.catalogClient)).toEqual({
      count: 0,
    });
    expect(h.categories).toHaveLength(6);
    for (const row of h.tx.disciplinaryCategory.createMany.mock.calls[0][0]
      .data) {
      expect(row).not.toHaveProperty('id');
      expect(row).toMatchObject({ active: true, defaultSeverity: null });
    }
    expect(h.tx.disciplinaryCategory.createMany).toHaveBeenLastCalledWith({
      data: expect.any(Array) as unknown[],
      skipDuplicates: true,
    });
  });
  it('inserts missing categories without overwriting customized, inactive or unrelated records', async () => {
    const h = disciplinaryCategoriesHarness();
    h.categories[0].label = 'Customized label';
    h.categories[0].defaultSeverity = WarningSeverity.SEVERE;
    h.categories.push({
      ...h.categories[0],
      id: 'extra-category',
      code: 'CUSTOM',
    });
    h.categories.splice(1, 1);
    const before = structuredClone(h.categories);
    expect(await provisionDisciplinaryCategories(h.catalogClient)).toEqual({
      count: 1,
    });
    for (const row of before)
      expect(h.categories.find((item) => item.code === row.code)).toEqual(row);
    expect(h.categories.find((row) => row.code === 'OTHER')?.active).toBe(
      false,
    );
  });
  it('propagates a provisioning failure instead of reporting success', async () => {
    const h = disciplinaryCategoriesHarness();
    h.tx.disciplinaryCategory.createMany.mockRejectedValueOnce(
      Error('Synthetic failure'),
    );
    await expect(
      provisionDisciplinaryCategories(h.catalogClient),
    ).rejects.toThrow('Synthetic failure');
  });
  it.each(['admin', 'dev'])(
    'lists only active categories for %s with a minimal projection',
    async (actor) => {
      const h = disciplinaryCategoriesHarness();
      const response = await h.service.list(actor, new PaginationQueryDto());
      expect(response.meta).toEqual({ page: 1, limit: 20, total: 5, pages: 1 });
      expect(response.items.map((row) => row.code)).toEqual([
        'COMMITMENTS',
        'DISCRIMINATION',
        'HARASSMENT',
        'RESPECT',
        'SAFETY',
      ]);
      for (const row of response.items)
        expect(Object.keys(row).sort()).toEqual(['code', 'id', 'label']);
      expect(h.outside).not.toHaveBeenCalled();
      expect(h.transaction).toHaveBeenLastCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
      expect(h.tx.disciplinaryCategory.findMany.mock.calls[0][0].where).toEqual(
        h.tx.disciplinaryCategory.count.mock.calls[0][0].where,
      );
    },
  );
  it('keeps pagination totals scoped to active rows', async () => {
    const h = disciplinaryCategoriesHarness();
    const response = await h.service.list('admin', { page: 2, limit: 2 });
    expect(response.items.map((row) => row.code)).toEqual([
      'HARASSMENT',
      'RESPECT',
    ]);
    expect(response.meta).toEqual({ page: 2, limit: 2, total: 5, pages: 3 });
    expect(
      (await h.service.list('admin', { page: 4, limit: 2 })).items,
    ).toEqual([]);
  });
  it.each(['user', 'master', 'club-admin'])(
    'rejects %s before reading category data',
    async (actor) => {
      const h = disciplinaryCategoriesHarness();
      await expect(
        h.service.list(actor, new PaginationQueryDto()),
      ).rejects.toMatchObject({ status: 403 });
      expect(h.tx.disciplinaryCategory.findMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.DELETION_PENDING,
    AccountStatus.ANONYMIZED,
  ])('rechecks operator status %s inside the transaction', async (status) => {
    const h = disciplinaryCategoriesHarness();
    h.users.admin.status = status;
    await expect(
      h.service.list('admin', new PaginationQueryDto()),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.tx.disciplinaryCategory.findMany).not.toHaveBeenCalled();
  });
  it.each([
    { page: 0, limit: 20 },
    { page: 1, limit: 0 },
    { page: 1, limit: 51 },
    { page: 1.5, limit: 20 },
    { page: Number.MAX_SAFE_INTEGER, limit: 50 },
  ])('rejects invalid service pagination %j', async (query) => {
    const h = disciplinaryCategoriesHarness();
    await expect(h.service.list('admin', query)).rejects.toMatchObject({
      status: 400,
    });
  });
});
