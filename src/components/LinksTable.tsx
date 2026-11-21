interface LinkRow {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  isInternal: boolean;
  httpStatus: number | null;
  broken: boolean;
  error: string | null;
  affectedProvinces?: string[];
}

export default function LinksTable({ links }: { links: LinkRow[] }) {
  if (links.length === 0) {
    return <p className="text-sm text-gray-500">No links match this filter.</p>;
  }
  const regional = links.some((link) => link.affectedProvinces?.length);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-2 pr-4 font-medium">Source page</th>
            <th className="py-2 pr-4 font-medium">Target</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Error</th>
            {regional && <th className="py-2 font-medium">Provinces</th>}
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id} className="border-b border-gray-100">
              <td className="max-w-xs truncate py-2 pr-4" title={link.sourceUrl}>
                {link.sourceUrl}
              </td>
              <td className="max-w-xs truncate py-2 pr-4" title={link.targetUrl}>
                {link.targetUrl}
              </td>
              <td className="py-2 pr-4">{link.isInternal ? "Internal" : "External"}</td>
              <td className={`py-2 pr-4 ${link.broken ? "font-medium text-red-600" : ""}`}>
                {link.httpStatus ?? "—"}
              </td>
              <td className="max-w-xs truncate py-2 text-gray-500" title={link.error ?? undefined}>
                {link.error ?? "—"}
              </td>
              {regional && <td className="py-2 pl-4 text-gray-500">{link.affectedProvinces?.join(", ") || "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
