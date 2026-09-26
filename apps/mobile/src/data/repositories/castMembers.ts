import { CastMember } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const castMemberSpec: TableSpec<CastMember> = {
  table: 'cast_members',
  key: 'id',
  contract: CastMember,
  columns: {
    id: 'id',
    documentaryId: 'documentary_id',
    name: 'name',
    relation: 'relation',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  },
};

export async function put(driver: SqlDriver, member: CastMember): Promise<CastMember> {
  return upsert(driver, castMemberSpec, member);
}

export async function get(driver: SqlDriver, id: string): Promise<CastMember | undefined> {
  const row = await selectRow(driver, castMemberSpec, id);
  return row ? fromRow(castMemberSpec, row) : undefined;
}

/** People not deleted, by name. */
export async function list(driver: SqlDriver, documentaryId: string): Promise<CastMember[]> {
  const rows = await driver.all<Row>(
    'SELECT * FROM cast_members WHERE documentary_id = ? AND deleted_at IS NULL ORDER BY name, id',
    [documentaryId],
  );
  return rows.map((r) => fromRow(castMemberSpec, r));
}
