interface PageRow {
  id: string;
  url: string;
  status: string;
  httpStatus: number | null;
  title: string | null;
  requestedProvince: string | null;
  province: string | null;
  language: string | null;
  fetchError: string | null;
}

export default function PageList({ pages }: { pages: PageRow[] }) {
  if (pages.length === 0) {
    return <p className="text-sm text-gray-500">No pages discovered yet.</p>;
  }
  const localized = pages.some((page) => page.requestedProvince !== null);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-2 pr-4 font-medium">URL</th>
            {localized ? <>
              <th className="py-2 pr-4 font-medium">Requested province</th>
              <th className="py-2 pr-4 font-medium">Declared province</th>
              <th className="py-2 pr-4 font-medium">Language</th>
            </> : null}
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">HTTP</th>
            <th className="py-2 font-medium">Title</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id} className="border-b border-gray-100">
              <td className="max-w-xs truncate py-2 pr-4" title={page.url}>
                {page.url}
              </td>
              {localized ? <>
                <td className="py-2 pr-4">{page.requestedProvince ?? "—"}</td>
                <td className="py-2 pr-4">{page.province ?? "—"}</td>
                <td className="py-2 pr-4">{page.language ?? "—"}</td>
              </> : null}
              <td className="py-2 pr-4" title={page.fetchError ?? undefined}>{page.status}</td>
              <td className="py-2 pr-4">{page.httpStatus ?? "—"}</td>
              <td className="max-w-xs truncate py-2" title={page.title ?? undefined}>
                {page.title ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
