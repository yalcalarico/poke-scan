import { SearchFallback } from '@/components/search/search-fallback';
import { SearchPage } from '@/components/search/search-page';

export default function Loading() {
  return <SearchPage busy><SearchFallback /></SearchPage>;
}
