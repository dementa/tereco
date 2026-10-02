import { Suspense } from "react";
import { PublicLibraryHome } from "@/components/library/public/PublicLibraryHome";

// Suspense: the home page reads its filters from the URL (useSearchParams).
export default function PublicLibraryPage() {
  return (
    <Suspense>
      <PublicLibraryHome />
    </Suspense>
  );
}
