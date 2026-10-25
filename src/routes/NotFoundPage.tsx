import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'

export default function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Halaman tidak ditemukan"
        description="Alamat yang Anda buka tidak tersedia."
      />
      <div className="px-4 lg:px-8">
        <Link to="/lapor" className="font-semibold text-accent underline-offset-4 hover:underline">
          Kembali ke form lapor
        </Link>
      </div>
    </>
  )
}
