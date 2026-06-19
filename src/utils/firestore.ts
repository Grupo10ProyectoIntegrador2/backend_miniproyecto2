import { db } from '../config/firebase';

const BATCH_LIMIT = 499;

export async function commitBatchDeletes(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<void> {
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const chunk = docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    }
}
