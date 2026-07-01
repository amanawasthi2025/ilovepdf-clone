import Link from 'next/link'

const TOOLS = [
  { href: '/merge', name: 'Merge PDF', description: 'Combine multiple PDFs into one file.' },
  { href: '/split', name: 'Split PDF', description: 'Extract page ranges into a new PDF.' },
  { href: '/compress', name: 'Compress PDF', description: 'Reduce a PDF’s file size.' },
  { href: '/pdf-to-image', name: 'PDF to Image', description: 'Convert every page into PNG or JPEG images.' },
  { href: '/image-to-pdf', name: 'Image to PDF', description: 'Combine PNG or JPEG images into a single PDF.' },
]

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight text-gray-900">PDF Tools</h1>
      <p className="mb-8 text-lg text-gray-500">Upload, process, and download your documents.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-gray-400"
          >
            <h2 className="text-lg font-semibold text-gray-900">{tool.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{tool.description}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}
