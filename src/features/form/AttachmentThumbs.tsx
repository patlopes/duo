import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import { db } from '../../db/database';

/** Receipts saved on a transaction. Tapping one opens it full size. */
export function AttachmentThumbs({ ids }: { ids: string[] }) {
  const rows = useLiveQuery(() => db.attachments.bulkGet(ids), [ids.join()], []);
  const urls = useMemo(
    () => rows.flatMap((row) => (row ? [{ id: row.id, url: URL.createObjectURL(row.blob) }] : [])),
    [rows],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u.url)), [urls]);
  return (
    <div className="thumbs">
      {urls.map((u) => (
        <a key={u.id} href={u.url} target="_blank" rel="noopener" aria-label="Abrir comprovante">
          <img src={u.url} alt="Comprovante" />
        </a>
      ))}
    </div>
  );
}
