// The last line of a tile: where its number comes from, as a small link to that source
// (the pages are in sourcePages.ts).

export function SourceLink({ href, children }: { href: string; children: string }) {
  return (
    <a className="tile-source" href={href}>
      {children} →
    </a>
  )
}
