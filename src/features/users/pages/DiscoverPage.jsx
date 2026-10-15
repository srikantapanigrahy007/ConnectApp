import { userSearchQuerySchema } from '#shared';
import { AtSign, Lock, Search, UserRoundSearch } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageContainer, PageHeader } from '../../../components/layout/Page';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Field } from '../../../components/ui/Field';
import { Input } from '../../../components/ui/Input';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { UserListItem } from '../components/UserListItem';
import { useUserSearch } from '../hooks';

function SearchResults({ q }) {
  const search = useUserSearch(q);
  if (search.isPending) return <ListSkeleton rows={3} label="Searching…" />;
  if (search.isError) {
    return (
      <div className="p-4">
        <ErrorState
          message={search.error.message}
          onRetry={() => void search.refetch()}
          isRetrying={search.isFetching}
        />
      </div>
    );
  }
  const people = search.data.pages.flatMap((page) => page.items);
  if (people.length === 0) {
    return (
      <EmptyState
        icon={UserRoundSearch}
        title={`No one found for “${q}”`}
        description="Check the spelling. Private profiles only appear when you type their exact username."
      />
    );
  }
  return (
    <>
      <ul className="divide-y divide-border">
        {people.map((person) => (
          <li key={person.id}>
            <UserListItem
              user={person}
              meta={
                person.profileVisibility === 'private' ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock aria-hidden="true" className="size-3" /> Private profile
                  </span>
                ) : null
              }
            />
          </li>
        ))}
      </ul>
      {search.hasNextPage ? (
        <div className="border-t border-border p-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            loading={search.isFetchingNextPage}
            onClick={() => void search.fetchNextPage()}
          >
            Show more
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Find people by exact or partial username. Results come from the API, which applies privacy and blocks. */
export function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const submitted = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(submitted);
  const [error, setError] = useState();

  const onSubmit = (event) => {
    event.preventDefault();
    const result = userSearchQuerySchema.shape.q.safeParse(query);
    if (!result.success) {
      setError(result.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setSearchParams({ q: result.data });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Discover people"
        description="Find people by their exact or partial username."
      />

      <Card className="p-4 sm:p-5">
        <form
          role="search"
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
        >
          <div className="flex-1">
            <Field label="Username" error={error}>
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setError(undefined);
                  }}
                  placeholder="e.g. ada_lovelace"
                  autoCapitalize="none"
                  spellCheck={false}
                  leadingIcon={AtSign}
                />
              )}
            </Field>
          </div>
          <Button type="submit" icon={Search} className="sm:mt-7">
            Search
          </Button>
        </form>
      </Card>

      <section aria-labelledby="results-heading" aria-live="polite" className="mt-6">
        <h2 id="results-heading" className="sr-only">
          Search results
        </h2>
        {submitted ? (
          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm text-ink-muted">
                Results for <strong className="text-ink">@{submitted}</strong>
              </p>
              <Badge>Exact match first</Badge>
            </div>
            <SearchResults q={submitted} />
          </Card>
        ) : (
          <EmptyState
            icon={UserRoundSearch}
            title="Search for someone"
            description="Type a username, or the start of one. Private profiles only appear for an exact username."
          />
        )}
      </section>
    </PageContainer>
  );
}
