import type { Metadata } from "next";
import { LibraryItemDetail } from "@/components/library/LibraryItemDetail";
import { getLibraryContentById, isPublicLibraryContent } from "@/lib/entities/library-content";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A shared link shows the item's own title — but only for a public item, never a private one's. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    if (!UUID.test(id) || !(await isPublicLibraryContent(id))) return {};
    const item = await getLibraryContentById(id);
    return item ? { title: `${item.title} · TERECO Library`, description: item.description || undefined } : {};
  } catch {
    return {};
  }
}

export default function PublicLibraryItemPage() {
  return <LibraryItemDetail variant="public" />;
}
