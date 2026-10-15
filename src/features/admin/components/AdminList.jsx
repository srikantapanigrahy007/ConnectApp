import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ListSkeleton } from '../../../components/ui/Skeleton';

/** Cursor-paginated admin list ("Load more"), with loading, empty and error states. */
export function AdminList({ query, empty, label, renderItem }) {
  if (query.isPending) return <ListSkeleton rows={4} label={`Loading ${label.toLowerCase()}…`} />;
  if (query.isError) {
    return (
      <div className="p-4">
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return <EmptyState {...empty} />;
  return (
    <>
      <ul className="divide-y divide-border" aria-label={label}>
        {items.map((item) => (
          <li key={item.id}>{renderItem(item)}</li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <div className="flex justify-center p-3">
          <Button
            variant="secondary"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}
