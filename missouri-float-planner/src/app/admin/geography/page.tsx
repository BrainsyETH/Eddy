'use client';
import AdminLayout from '@/components/admin/AdminLayout';
import MapContainer from '@/components/map/MapContainer';
import GeographyEditor from '@/components/admin/GeographyEditor';
export default function AdminGeographyPage() {
  return <AdminLayout title="Geography" description="Edit access point locations and river geometries.">
    <div className="relative" style={{height:'calc(100dvh - 150px)',minHeight:500}}><MapContainer><GeographyEditor/></MapContainer></div>
  </AdminLayout>;
}
