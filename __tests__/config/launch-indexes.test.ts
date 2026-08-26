import fs from 'fs';
import path from 'path';

type Index = {
  collectionGroup: string;
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
  fields: Array<{ fieldPath: string; order?: string }>;
};

const config = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'firestore.indexes.json'), 'utf8'),
) as { indexes: Index[] };

const shape = (index: Index) =>
  `${index.collectionGroup}:${index.queryScope}:` +
  index.fields.map((field) => `${field.fieldPath}:${field.order}`).join(',');

describe('confirmed runtime-error index definitions', () => {
  const shapes = config.indexes.map(shape);

  it.each([
    'activities:COLLECTION:tenantId:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING',
    'activity_presence:COLLECTION:online:ASCENDING,tenantId:ASCENDING,lastSeenAt:DESCENDING,__name__:DESCENDING',
    'notifications:COLLECTION:isRead:ASCENDING,recipientUid:ASCENDING,tenantId:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING',
    'notifications:COLLECTION:isRead:ASCENDING,tenantId:ASCENDING,toUserId:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING',
    'notifications:COLLECTION:isRead:ASCENDING,tenantId:ASCENDING,toUid:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING',
  ])('contains %s', (requiredShape) => {
    expect(shapes).toContain(requiredShape);
  });

  it('defines the collection-group index used by direct daily accounting syncs', () => {
    expect(shapes).toContain(
      'integrations:COLLECTION_GROUP:connected:ASCENDING,settings.scheduleDaily:ASCENDING',
    );
  });

  it('contains no exact duplicate composite definitions', () => {
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
