import { getSession } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import MobileNav from "@/components/MobileNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await getSession();
  if (!s) return <div className="min-h-screen bg-[#1b2447] text-white">{children}</div>;
  return (
    <div className="flex min-h-screen bg-[#1b2447] text-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={s.email} uid={s.uid} token={s.token} />
        <div className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</div>
        <MobileNav />
      </div>
    </div>
  );
}
